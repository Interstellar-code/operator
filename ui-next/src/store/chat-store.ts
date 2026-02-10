import { create } from "zustand";
import { generateUUID } from "@/lib/uuid";

export type ChatMessageContent = {
  type: string;
  text?: string;
  [key: string]: unknown;
};

export type ChatMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string | ChatMessageContent[];
  timestamp?: number;
  runId?: string;
  // Server fields (from session transcript)
  errorMessage?: string;
  stopReason?: string;
  // UI-only fields
  id: string;
  isStreaming?: boolean;
};

/** Ensure a message has a stable ID; assigns one if missing (e.g. from gateway). */
function ensureId(msg: Omit<ChatMessage, "id"> & { id?: string }): ChatMessage {
  return { ...msg, id: msg.id || generateUUID() };
}

export type SessionEntry = {
  key: string;
  sessionId?: string;
  label?: string;
  agentId?: string;
  model?: string;
  origin?: string;
  lastActiveMs?: number;
  derivedTitle?: string;
  lastMessage?: string;
  tokenCounts?: {
    totalInput?: number;
    totalOutput?: number;
  };
  [key: string]: unknown;
};

export type ChatState = {
  // Session management
  activeSessionKey: string;
  sessions: SessionEntry[];
  sessionsLoading: boolean;

  // Messages
  messages: ChatMessage[];
  messagesLoading: boolean;

  // Streaming state
  isStreaming: boolean;
  streamRunId: string | null;
  streamContent: string;

  // Thinking level from history
  thinkingLevel: string;

  // Actions
  setActiveSessionKey: (key: string) => void;
  setSessions: (sessions: SessionEntry[]) => void;
  setSessionsLoading: (loading: boolean) => void;
  setMessages: (messages: Array<Omit<ChatMessage, "id"> & { id?: string }>) => void;
  setMessagesLoading: (loading: boolean) => void;
  appendMessage: (message: Omit<ChatMessage, "id"> & { id?: string }) => void;

  // Streaming actions
  startStream: (runId: string) => void;
  updateStreamDelta: (runId: string, text: string) => void;
  finalizeStream: (runId: string, text?: string) => void;
  streamError: (runId: string, errorMessage?: string) => void;

  setThinkingLevel: (level: string) => void;
  reset: () => void;
};

/** Extract plain text from message content (string or content array). */
export function getMessageText(msg: ChatMessage): string {
  if (typeof msg.content === "string") {
    return msg.content;
  }
  const parts = msg.content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text!)
    .join("");
  return parts;
}

/** Extract image URLs from structured content blocks. */
export function getMessageImages(msg: ChatMessage): Array<{ url: string; alt?: string }> {
  if (typeof msg.content === "string") {
    return [];
  }
  const images: Array<{ url: string; alt?: string }> = [];
  for (const block of msg.content) {
    if (block.type === "image") {
      // Anthropic-style: { type: "image", source: { type, media_type, data | url } }
      const source = block.source as
        | { type?: string; media_type?: string; data?: string; url?: string }
        | undefined;
      if (source?.url) {
        images.push({ url: source.url });
      } else if (source?.data && source?.media_type) {
        images.push({ url: `data:${source.media_type};base64,${source.data}` });
      }
    } else if (block.type === "image_url") {
      // OpenAI-style: { type: "image_url", image_url: { url, detail? } }
      const imageUrl = block.image_url as { url?: string } | undefined;
      if (imageUrl?.url) {
        images.push({ url: imageUrl.url });
      }
    }
  }
  return images;
}

const initialState = {
  activeSessionKey: "main",
  sessions: [] as SessionEntry[],
  sessionsLoading: false,
  messages: [] as ChatMessage[],
  messagesLoading: false,
  isStreaming: false,
  streamRunId: null as string | null,
  streamContent: "",
  thinkingLevel: "off",
};

export const useChatStore = create<ChatState>((set) => ({
  ...initialState,

  setActiveSessionKey: (key) => set({ activeSessionKey: key }),

  setSessions: (sessions) => set({ sessions }),
  setSessionsLoading: (loading) => set({ sessionsLoading: loading }),

  setMessages: (messages) => set({ messages: messages.map(ensureId) }),
  setMessagesLoading: (loading) => set({ messagesLoading: loading }),

  appendMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, ensureId(message)],
    })),

  startStream: (runId) =>
    set({
      isStreaming: true,
      streamRunId: runId,
      streamContent: "",
    }),

  updateStreamDelta: (runId, text) =>
    set((state) => {
      if (state.streamRunId !== runId) {
        return state;
      }
      return { streamContent: text };
    }),

  finalizeStream: (runId, text) =>
    set((state) => {
      if (state.streamRunId !== runId) {
        return state;
      }
      const finalText = text ?? state.streamContent;
      const newMessages = finalText.trim()
        ? [
            ...state.messages,
            ensureId({
              role: "assistant" as const,
              content: finalText,
              timestamp: Date.now(),
              runId,
            }),
          ]
        : state.messages;
      return {
        messages: newMessages,
        isStreaming: false,
        streamRunId: null,
        streamContent: "",
      };
    }),

  streamError: (runId, errorMessage) =>
    set((state) => {
      if (state.streamRunId !== runId) {
        return state;
      }
      const errorMsg = ensureId({
        role: "system" as const,
        content: errorMessage ?? "An error occurred",
        timestamp: Date.now(),
        runId,
      });
      return {
        messages: [...state.messages, errorMsg],
        isStreaming: false,
        streamRunId: null,
        streamContent: "",
      };
    }),

  setThinkingLevel: (level) => set({ thinkingLevel: level }),

  reset: () => set(initialState),
}));
