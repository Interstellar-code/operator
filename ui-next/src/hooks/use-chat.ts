import { useCallback, useEffect, useRef } from "react";
import { generateUUID } from "@/lib/uuid";
import { useChatStore, type ChatMessage, type SessionEntry } from "@/store/chat-store";
import { useGatewayStore } from "@/store/gateway-store";

type SendRpc = <T = unknown>(method: string, params?: unknown) => Promise<T>;

export function useChat(sendRpc: SendRpc) {
  const activeSessionKey = useChatStore((s) => s.activeSessionKey);
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");

  // Sequence counters to guard against stale async responses.
  // When a new request starts, the counter increments; if the counter has
  // moved on by the time the response arrives, we discard it.
  const historySeqRef = useRef(0);
  const sessionsSeqRef = useRef(0);

  // Load sessions on connect
  const loadSessions = useCallback(async () => {
    if (!isConnected) {
      return;
    }
    const seq = ++sessionsSeqRef.current;
    const store = useChatStore.getState();
    store.setSessionsLoading(true);
    try {
      const result = await sendRpc<{ sessions: SessionEntry[] }>("sessions.list", {
        limit: 50,
        includeDerivedTitles: true,
        includeLastMessage: true,
      });
      // Discard if a newer request has been issued
      if (seq !== sessionsSeqRef.current) {
        return;
      }
      store.setSessions(result?.sessions ?? []);
    } catch (err) {
      if (seq !== sessionsSeqRef.current) {
        return;
      }
      console.error("[chat] failed to load sessions:", err);
    } finally {
      if (seq === sessionsSeqRef.current) {
        useChatStore.getState().setSessionsLoading(false);
      }
    }
  }, [sendRpc, isConnected]);

  // Load message history for active session
  const loadHistory = useCallback(async () => {
    if (!isConnected || !activeSessionKey) {
      return;
    }
    const seq = ++historySeqRef.current;
    const store = useChatStore.getState();
    // Only show loading spinner when there are no messages yet (initial load).
    // Reconnect-triggered reloads should not flash the spinner.
    const isInitialLoad = store.messages.length === 0;
    if (isInitialLoad) {
      store.setMessagesLoading(true);
    }
    try {
      const result = await sendRpc<{
        messages: ChatMessage[];
        thinkingLevel?: string;
      }>("chat.history", {
        sessionKey: activeSessionKey,
        limit: 200,
      });
      // Discard if a newer loadHistory call has superseded this one
      if (seq !== historySeqRef.current) {
        return;
      }
      store.setMessages(result?.messages ?? []);
      if (result?.thinkingLevel) {
        store.setThinkingLevel(result.thinkingLevel);
      }
    } catch (err) {
      if (seq !== historySeqRef.current) {
        return;
      }
      console.error("[chat] failed to load history:", err);
      // Don't wipe existing messages on error — keep what we have
    } finally {
      if (seq === historySeqRef.current) {
        useChatStore.getState().setMessagesLoading(false);
      }
    }
  }, [sendRpc, isConnected, activeSessionKey]);

  // Send a message (plain text or structured content blocks for multimodal)
  const sendMessage = useCallback(
    async (content: string | Array<unknown>) => {
      const text = typeof content === "string" ? content : "";
      // For plain text, require non-empty; for structured content, require at least one block
      if (typeof content === "string" && !content.trim()) {
        return;
      }
      if (Array.isArray(content) && content.length === 0) {
        return;
      }
      if (!isConnected) {
        return;
      }

      const store = useChatStore.getState();

      // Optimistically add user message
      store.appendMessage({
        role: "user",
        content: content as string | import("@/store/chat-store").ChatMessageContent[],
        timestamp: Date.now(),
      });

      try {
        await sendRpc("chat.send", {
          sessionKey: activeSessionKey,
          message: content,
          idempotencyKey: generateUUID(),
        });
      } catch (err) {
        console.error("[chat] send failed:", err);
        store.appendMessage({
          role: "system",
          content: `Failed to send message: ${err instanceof Error ? err.message : "unknown error"}`,
          timestamp: Date.now(),
        });
        throw err;
      }
    },
    [sendRpc, isConnected, activeSessionKey],
  );

  // Abort current run
  const abortRun = useCallback(async () => {
    const store = useChatStore.getState();
    if (!store.streamRunId) {
      return;
    }
    try {
      await sendRpc("chat.abort", {
        sessionKey: activeSessionKey,
        runId: store.streamRunId,
      });
    } catch (err) {
      console.error("[chat] abort failed:", err);
    }
  }, [sendRpc, activeSessionKey]);

  // Switch session
  const switchSession = useCallback((key: string) => {
    useChatStore.getState().setActiveSessionKey(key);
  }, []);

  // Reset session
  const resetSession = useCallback(
    async (key: string) => {
      try {
        await sendRpc("sessions.reset", { key });
        if (key === activeSessionKey) {
          useChatStore.getState().setMessages([]);
        }
        await loadSessions();
      } catch (err) {
        console.error("[chat] reset session failed:", err);
      }
    },
    [sendRpc, activeSessionKey, loadSessions],
  );

  // Delete session
  const deleteSession = useCallback(
    async (key: string) => {
      try {
        await sendRpc("sessions.delete", { key });
        await loadSessions();
        // If the deleted session was active, switch to "main" or the first available session
        const store = useChatStore.getState();
        if (key === store.activeSessionKey) {
          const remaining = store.sessions;
          const fallback = remaining.find((s) => s.key === "main")
            ? "main"
            : (remaining[0]?.key ?? "main");
          store.setActiveSessionKey(fallback);
        }
      } catch (err) {
        console.error("[chat] delete session failed:", err);
      }
    },
    [sendRpc, loadSessions],
  );

  // Auto-load sessions when connected
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Auto-load history when session changes
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return {
    sendMessage,
    abortRun,
    loadSessions,
    loadHistory,
    switchSession,
    resetSession,
    deleteSession,
  };
}
