import {
  Bot,
  Copy,
  Check,
  RefreshCw,
  Send,
  Square,
  Search,
  Plus,
  MessageSquare,
  MoreHorizontal,
  Trash2,
  RotateCcw,
  Paperclip,
  Mic,
  ChevronDown,
  ChevronRight,
  ArrowDown,
  ArrowUp,
  FileText,
  Code2,
  Paintbrush,
  BookOpen,
  Menu,
  ThumbsUp,
  ThumbsDown,
  Brain,
  Image,
  X,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import { ToolCallCard, extractToolCards } from "@/components/chat/tool-call-card";
import { Button } from "@/components/ui/button";
import { ChatContainer } from "@/components/ui/custom/prompt/chat-container";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
} from "@/components/ui/custom/prompt/input";
import { TextShimmerLoader } from "@/components/ui/custom/prompt/loader";
import { Markdown } from "@/components/ui/custom/prompt/markdown";
import { PromptScrollButton } from "@/components/ui/custom/prompt/scroll-button";
import { type ModelEntry } from "@/components/ui/custom/status/model-selector";
import { useToast } from "@/components/ui/custom/toast";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useChat } from "@/hooks/use-chat";
import { useGateway } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";
import {
  useChatStore,
  getMessageText,
  getMessageImages,
  type ChatMessage,
  type SessionEntry,
} from "@/store/chat-store";
import { useGatewayStore } from "@/store/gateway-store";

// ─── Attachment Types ───

type Attachment = {
  file: File;
  preview: string;
  id: string;
};

let attachmentIdCounter = 0;

/** Read a File as a base64 data URL string. */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Extract the raw base64 data (without the data: prefix) from a data URL. */
function extractBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(",");
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

// ─── Helpers ───

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return String(tokens);
}

function formatContextWindow(tokens?: number): string {
  if (!tokens) {
    return "";
  }
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(0)}k`;
  }
  return String(tokens);
}

/** Context window usage bar shown below the input */
function ContextUsageBar({
  used,
  total,
  className,
}: {
  used: number;
  total: number;
  className?: string;
}) {
  const pct = Math.min((used / total) * 100, 100);
  const isHigh = pct > 80;
  const isCritical = pct > 95;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex-1 h-1.5 rounded-full bg-secondary/60 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            isCritical ? "bg-destructive" : isHigh ? "bg-chart-5" : "bg-primary/60",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={cn(
          "text-[10px] font-mono shrink-0",
          isCritical ? "text-destructive" : isHigh ? "text-chart-5" : "text-muted-foreground",
        )}
      >
        {formatTokenCount(used)} / {formatContextWindow(total)}
      </span>
    </div>
  );
}

function formatSessionTitle(session: SessionEntry): string {
  if (session.label) {
    return session.label;
  }
  if (session.derivedTitle) {
    return session.derivedTitle;
  }
  const key = session.key;
  if (key.includes(":")) {
    const parts = key.split(":");
    return parts[parts.length - 1] || key;
  }
  return key;
}

function groupSessionsByTime(sessions: SessionEntry[]): Record<string, SessionEntry[]> {
  const now = Date.now();
  const day = 86400000;
  const groups: Record<string, SessionEntry[]> = {};

  for (const s of sessions) {
    const lastActive = s.lastActiveMs ?? 0;
    const age = now - lastActive;
    let group: string;
    if (age < day) {
      group = "Today";
    } else if (age < 2 * day) {
      group = "Yesterday";
    } else if (age < 7 * day) {
      group = "7 Days Ago";
    } else {
      group = "Older";
    }

    if (!groups[group]) {
      groups[group] = [];
    }
    groups[group].push(s);
  }

  return groups;
}

// ─── Clipboard hook ───

function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return { copied, copy };
}

// ─── Message Grouping ───

/**
 * Determine whether a message is the first in a consecutive group of the same
 * effective role. Tool messages are treated as "assistant" for grouping purposes
 * (they always follow assistant tool_use blocks).
 */
function isFirstInGroup(messages: ChatMessage[], index: number): boolean {
  if (index === 0) {
    return true;
  }
  const cur = messages[index];
  const prev = messages[index - 1];
  const effectiveRole = (role: string) => (role === "tool" ? "assistant" : role);
  return effectiveRole(cur.role) !== effectiveRole(prev.role);
}

// ─── Thinking Extraction ───

const THINKING_RE = /<thinking>([\s\S]*?)<\/thinking>/gi;

/**
 * Extract thinking content from an assistant message.
 * Handles both inline `<thinking>` tags in text and structured content blocks
 * where `type === "thinking"`.
 */
function extractThinking(msg: ChatMessage): { thinking: string | null; content: string } {
  // Check for structured thinking blocks in content arrays
  if (Array.isArray(msg.content)) {
    const thinkingBlocks: string[] = [];
    const otherBlocks: typeof msg.content = [];

    for (const block of msg.content) {
      if (block.type === "thinking" && typeof block.text === "string") {
        thinkingBlocks.push(block.text);
      } else {
        otherBlocks.push(block);
      }
    }

    if (thinkingBlocks.length > 0) {
      const textContent = otherBlocks
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text!)
        .join("");
      return { thinking: thinkingBlocks.join("\n\n"), content: textContent };
    }
  }

  // Fall back to regex extraction from text
  const text = getMessageText(msg);
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  // Reset lastIndex since the regex is global
  THINKING_RE.lastIndex = 0;
  while ((match = THINKING_RE.exec(text)) !== null) {
    matches.push(match[1].trim());
  }

  if (matches.length === 0) {
    return { thinking: null, content: text };
  }

  const stripped = text.replace(THINKING_RE, "").trim();
  return { thinking: matches.join("\n\n"), content: stripped };
}

/** Collapsible thinking section displayed above assistant message content. */
function ThinkingSection({ thinking }: { thinking: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Brain className="h-3 w-3" />
        <span className="font-medium">Thinking</span>
      </button>
      {expanded && (
        <div className="mt-2 pl-5 border-l-2 border-border/40">
          <p className="text-xs text-muted-foreground italic whitespace-pre-wrap leading-relaxed">
            {thinking}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Message Images ───

/** Renders inline images extracted from a message's content blocks. */
function MessageImages({ msg }: { msg: ChatMessage }) {
  const images = getMessageImages(msg);
  if (images.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {images.map((img, i) => (
        <a
          key={i}
          href={img.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-lg overflow-hidden border border-border/60 hover:border-primary/40 transition-colors"
        >
          <img
            src={img.url}
            alt={img.alt ?? "image"}
            className="max-w-xs max-h-64 rounded-lg object-contain"
          />
        </a>
      ))}
    </div>
  );
}

// ─── Model Selector Helpers ───

function providerColor(provider: string): string {
  switch (provider.toLowerCase()) {
    case "anthropic":
      return "text-chart-5";
    case "openai":
      return "text-chart-2";
    case "google":
      return "text-chart-1";
    default:
      return "text-muted-foreground";
  }
}

function groupModelsByProvider(models: ModelEntry[]): Record<string, ModelEntry[]> {
  const groups: Record<string, ModelEntry[]> = {};
  for (const m of models) {
    const key = m.provider || "other";
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(m);
  }
  return groups;
}

// ─── Visual Components ───

function GlowingOrb() {
  return (
    <div className="relative flex h-32 w-32 items-center justify-center">
      {/* Outer glow - increased opacity for better visibility */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-t from-primary/30 to-chart-2/30 blur-2xl animate-pulse" />
      <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-gray-900 to-black shadow-2xl border border-white/10 flex items-center justify-center overflow-hidden ring-1 ring-white/10">
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/30 via-transparent to-chart-2/30 opacity-60" />
        {/* Inner shine */}
        <div className="absolute -top-4 -left-4 h-12 w-12 rounded-full bg-primary/30 blur-xl" />
        <Bot className="h-8 w-8 text-primary relative z-10" />
      </div>
    </div>
  );
}

// ─── Message Bubble ───

function ChatMessageBubble({
  msg,
  index,
  rating,
  isLastAssistant,
  isGroupFirst = true,
  onRate,
  onRegenerate,
}: {
  msg: ChatMessage;
  index: number;
  rating?: "up" | "down" | null;
  isLastAssistant: boolean;
  /** True when this message starts a new consecutive group (show avatar). */
  isGroupFirst?: boolean;
  onRate: (index: number, rating: "up" | "down") => void;
  onRegenerate: () => void;
}) {
  const text = getMessageText(msg);
  const isUser = msg.role === "user";
  const isSystem = msg.role === "system";
  const isTool = msg.role === "tool";
  const { copied, copy } = useCopyToClipboard();

  // Check for tool call/result content blocks in any message
  const toolCards = extractToolCards(msg.content);
  const hasToolCards = toolCards.length > 0;

  if (isSystem) {
    return (
      <div className="flex justify-center px-4 py-4 animate-fade-in">
        <span className="text-xs text-muted-foreground/80 bg-muted/30 px-3 py-1 rounded-full border border-border/40 font-mono">
          {text}
        </span>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className={cn("flex justify-end px-4 animate-slide-in", isGroupFirst ? "py-2" : "py-1")}>
        <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-5 py-3.5 max-w-[80%] shadow-lg shadow-primary/10 ring-1 ring-white/10">
          <p className="text-sm whitespace-pre-wrap leading-relaxed font-sans">{text}</p>
          <MessageImages msg={msg} />
        </div>
        {isGroupFirst ? (
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center ml-2 border border-primary/10 shrink-0">
            <div className="w-4 h-4 rounded-full bg-primary/40" />
          </div>
        ) : (
          /* Invisible spacer to keep right alignment consistent */
          <div className="w-8 ml-2 shrink-0" />
        )}
      </div>
    );
  }

  // Tool role messages (entire message is a tool result)
  // Always rendered without avatar, indented to align with assistant messages
  if (isTool) {
    if (hasToolCards) {
      return (
        <div className="px-4 py-1 animate-fade-in ml-11">
          <ToolCallCard cards={toolCards} />
        </div>
      );
    }
    return (
      <div className="px-4 py-1 animate-fade-in ml-11">
        <ToolCallCard cards={[{ kind: "result", name: "tool", text: text || undefined }]} />
      </div>
    );
  }

  // Assistant message -- extract thinking and tool cards
  const { thinking, content: displayContent } = extractThinking(msg);

  // If this assistant message contains tool_use blocks, render tool cards
  // alongside any text content
  const hasText = displayContent.trim().length > 0;
  const hasError = Boolean(msg.errorMessage && msg.stopReason === "error");

  return (
    <div
      className={cn("group px-4 animate-slide-in-left flex gap-3", isGroupFirst ? "py-2" : "py-1")}
    >
      {isGroupFirst ? (
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0 mt-1">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      ) : (
        /* Invisible spacer to keep left alignment consistent with avatar width */
        <div className="w-8 shrink-0" />
      )}
      <div className="max-w-[90%] md:max-w-[85%]">
        <div className="bg-card/40 text-foreground border border-border/60 rounded-2xl rounded-bl-sm px-6 py-5 shadow-sm backdrop-blur-md">
          {/* Thinking section */}
          {thinking && <ThinkingSection thinking={thinking} />}

          {/* Tool cards within assistant message */}
          {hasToolCards && (
            <div className={cn(hasText && "mb-3")}>
              <ToolCallCard cards={toolCards} />
            </div>
          )}

          {/* Main text content */}
          {hasText && (
            <div className="prose prose-neutral dark:prose-invert prose-sm max-w-none break-words leading-relaxed font-sans">
              <Markdown>{displayContent}</Markdown>
            </div>
          )}
          {/* Error message from failed model response */}
          {hasError && !hasText && (
            <p className="text-sm text-destructive/80 font-mono">{msg.errorMessage}</p>
          )}
          <MessageImages msg={msg} />
        </div>

        {/* Actions Toolbar */}
        <div className="flex items-center gap-1 mt-2 ml-1 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0">
          <Button
            variant="ghost"
            size="icon-xs"
            className="h-7 w-7 text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
            onClick={() => copy(displayContent || text)}
            title="Copy"
            aria-label="Copy message"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn(
              "h-7 w-7 rounded-lg transition-colors",
              rating === "up"
                ? "text-primary bg-primary/10 hover:bg-primary/20"
                : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/50",
            )}
            onClick={() => onRate(index, "up")}
            title="Helpful"
            aria-label="Mark as helpful"
          >
            <ThumbsUp className={cn("h-3.5 w-3.5", rating === "up" && "fill-current")} />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn(
              "h-7 w-7 rounded-lg transition-colors",
              rating === "down"
                ? "text-destructive bg-destructive/10 hover:bg-destructive/20"
                : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/50",
            )}
            onClick={() => onRate(index, "down")}
            title="Not Helpful"
            aria-label="Mark as not helpful"
          >
            <ThumbsDown className={cn("h-3.5 w-3.5", rating === "down" && "fill-current")} />
          </Button>
          {isLastAssistant && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="h-7 w-7 text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
              onClick={onRegenerate}
              title="Regenerate"
              aria-label="Regenerate response"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Streaming Bubble ───

function StreamingBubble({
  content,
  isGroupFirst = true,
}: {
  content: string;
  isGroupFirst?: boolean;
}) {
  return (
    <div className={cn("animate-slide-in-left flex gap-3 px-4", isGroupFirst ? "py-2" : "py-1")}>
      {isGroupFirst ? (
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0 mt-1">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      ) : (
        <div className="w-8 shrink-0" />
      )}
      <div className="max-w-[90%] md:max-w-[85%]">
        {content ? (
          <div className="bg-card/40 text-foreground border border-border/60 rounded-2xl rounded-bl-sm px-6 py-5 shadow-sm backdrop-blur-md">
            <div className="prose prose-neutral dark:prose-invert prose-sm max-w-none break-words leading-relaxed font-sans">
              <Markdown>{content}</Markdown>
            </div>
          </div>
        ) : (
          <div className="bg-card/40 border border-border/60 rounded-2xl rounded-bl-sm px-6 py-6 shadow-sm flex items-center gap-2">
            <div className="h-2 w-2 bg-primary/50 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            <div className="h-2 w-2 bg-primary/50 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="h-2 w-2 bg-primary/50 rounded-full animate-bounce"></div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Empty State ───

function EmptyState({ onSuggestionClick }: { onSuggestionClick: (text: string) => void }) {
  const suggestions = [
    { icon: FileText, label: "Summary", text: "Summarize this recent conversation" },
    { icon: Code2, label: "Code", text: "Write a React component for a dashboard" },
    { icon: Paintbrush, label: "Design", text: "Create a color palette for a fintech app" },
    { icon: BookOpen, label: "Research", text: "Find the latest trends in AI agents" },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening";

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 animate-fade-in relative z-10">
      <div className="mb-6">
        <GlowingOrb />
      </div>

      <div className="text-center mb-10 max-w-md">
        <h1 className="text-3xl font-medium tracking-tight mb-2">{greeting}</h1>
        <h2 className="text-xl text-muted-foreground font-light">
          How can I{" "}
          <span className="bg-gradient-to-r from-primary to-chart-2 bg-clip-text text-transparent font-normal">
            assist you today?
          </span>
        </h2>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 max-w-2xl">
        {suggestions.map((s) => (
          <button
            key={s.label}
            onClick={() => onSuggestionClick(s.text)}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-card/30 hover:bg-card/80 hover:border-primary/30 transition-all duration-200 text-sm md:text-xs"
          >
            <s.icon className="h-3.5 w-3.5 text-primary" />
            <span className="text-foreground/80">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Session Sidebar ───

function SessionSidebarContent({
  onSelect,
  activeKey,
  onNewChat,
  onReset,
  onDelete,
  collapsed = false,
  onCollapse,
}: {
  onSelect: (key: string) => void;
  activeKey: string;
  onNewChat: () => void;
  onReset: (key: string) => void;
  onDelete: (key: string) => void;
  collapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
}) {
  const sessions = useChatStore((s) => s.sessions);
  const loading = useChatStore((s) => s.sessionsLoading);
  const [searchQuery, setSearchQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu/confirmations when clicking outside
  useEffect(() => {
    if (menuOpen === null && confirmDelete === null && confirmReset === null) {
      return;
    }
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
        setConfirmDelete(null);
        setConfirmReset(null);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [menuOpen, confirmDelete, confirmReset]);

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) {
      return sessions;
    }
    const q = searchQuery.toLowerCase();
    return sessions.filter((s) => {
      const title = formatSessionTitle(s).toLowerCase();
      const msg = (s.lastMessage ?? "").toLowerCase();
      return title.includes(q) || msg.includes(q);
    });
  }, [sessions, searchQuery]);

  const grouped = useMemo(() => groupSessionsByTime(filteredSessions), [filteredSessions]);
  const groupOrder = ["Today", "Yesterday", "7 Days Ago", "Older"];

  return (
    <div className="flex h-full flex-col bg-card/30 min-h-0">
      {/* Header with collapse toggle */}
      <div
        className={cn(
          "flex items-center border-b border-border/40 shrink-0",
          collapsed ? "justify-center px-2 py-3" : "justify-between px-4 py-3",
        )}
      >
        {!collapsed && (
          <span className="text-sm font-semibold text-foreground/80 tracking-tight">History</span>
        )}
        {onCollapse && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => onCollapse(!collapsed)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronsLeft className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        )}
      </div>

      {/* Search (hidden when collapsed) */}
      {!collapsed && (
        <div className="px-3 py-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search chats"
              className="h-9 w-full rounded-lg border border-border/50 bg-background/50 pl-9 pr-3 text-sm placeholder:text-muted-foreground/70 outline-none focus:border-primary/30 focus:ring-1 focus:ring-primary/10 transition-colors"
            />
          </div>
        </div>
      )}

      {/* Session list — scrollable */}
      <nav
        className={cn(
          "flex-1 overflow-y-auto min-h-0 py-1",
          collapsed ? "px-1.5" : "px-3 space-y-6",
        )}
        role="list"
        aria-label="Chat sessions"
      >
        {loading && sessions.length === 0 ? (
          <div className="px-3 py-4 text-center">
            {!collapsed && <TextShimmerLoader text="Loading..." size="sm" />}
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            {!collapsed && (searchQuery ? "No matching chats" : "No sessions yet")}
          </div>
        ) : collapsed ? (
          /* Collapsed: icon-only session list with hover tooltips */
          <div className="space-y-0.5 py-1">
            {filteredSessions.map((session) => (
              <div key={session.key} className="relative group" role="listitem">
                <button
                  onClick={() => onSelect(session.key)}
                  aria-label={formatSessionTitle(session)}
                  className={cn(
                    "flex w-full items-center justify-center rounded-md py-2 transition-colors",
                    activeKey === session.key
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <MessageSquare className="h-4 w-4 shrink-0" />
                </button>
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 hidden group-hover:block">
                  <div className="rounded-md border bg-popover px-3 py-1.5 text-sm shadow-md whitespace-nowrap max-w-[200px] truncate">
                    {formatSessionTitle(session)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Expanded: full session list with groups */
          groupOrder.map((group) => {
            const items = grouped[group];
            if (!items?.length) {
              return null;
            }
            return (
              <div key={group}>
                <div className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  {group}
                </div>
                <div className="space-y-0.5">
                  {items.map((session) => (
                    <div key={session.key} className="relative group/item" role="listitem">
                      <button
                        onClick={() => onSelect(session.key)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-all duration-200",
                          "hover:bg-accent/40",
                          activeKey === session.key
                            ? "bg-accent/60 text-foreground font-medium shadow-sm ring-1 ring-border/50"
                            : "text-muted-foreground",
                        )}
                      >
                        <MessageSquare
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors",
                            activeKey === session.key ? "text-primary" : "text-muted-foreground/70",
                          )}
                        />
                        <span className="truncate text-sm">{formatSessionTitle(session)}</span>
                      </button>

                      {/* Hover Menu */}
                      <div
                        ref={
                          menuOpen === session.key ||
                          confirmDelete === session.key ||
                          confirmReset === session.key
                            ? menuRef
                            : undefined
                        }
                        className={cn(
                          "absolute right-2 top-1/2 -translate-y-1/2 transition-opacity",
                          menuOpen === session.key ||
                            confirmDelete === session.key ||
                            confirmReset === session.key
                            ? "opacity-100 z-50"
                            : "opacity-0 group-hover/item:opacity-100",
                        )}
                      >
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="h-6 w-6 bg-background/80 backdrop-blur-sm shadow-sm ring-1 ring-border/50"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpen(menuOpen === session.key ? null : session.key);
                            setConfirmDelete(null);
                            setConfirmReset(null);
                          }}
                          aria-label="Session options"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>

                        {menuOpen === session.key && (
                          <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-xl border border-border bg-popover/95 backdrop-blur-md p-1 shadow-lg animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpen(null);
                                setConfirmReset(session.key);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted font-medium transition-colors"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Reset
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpen(null);
                                setConfirmDelete(session.key);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 font-medium transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </div>
                        )}

                        {/* Inline reset confirmation */}
                        {confirmReset === session.key && (
                          <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-xl border border-border/30 bg-popover/95 backdrop-blur-md p-2 shadow-lg animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                            <p className="text-xs text-foreground mb-2 px-1">Reset this session?</p>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmReset(null);
                                }}
                                className="flex-1 rounded-lg px-2 py-1.5 text-xs font-medium bg-muted hover:bg-muted/80 transition-colors text-center"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onReset(session.key);
                                  setConfirmReset(null);
                                }}
                                className="flex-1 rounded-lg px-2 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-center"
                              >
                                Reset
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Inline delete confirmation */}
                        {confirmDelete === session.key && (
                          <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-xl border border-destructive/30 bg-popover/95 backdrop-blur-md p-2 shadow-lg animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                            <p className="text-xs text-foreground mb-2 px-1">
                              Delete this session?
                            </p>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDelete(null);
                                }}
                                className="flex-1 rounded-lg px-2 py-1.5 text-xs font-medium bg-muted hover:bg-muted/80 transition-colors text-center"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDelete(session.key);
                                  setConfirmDelete(null);
                                }}
                                className="flex-1 rounded-lg px-2 py-1.5 text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors text-center"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </nav>

      {/* New Chat button */}
      <div className={cn("border-t border-border/40 shrink-0", collapsed ? "px-1.5 py-2" : "p-4")}>
        {collapsed ? (
          <div className="relative group">
            <button
              onClick={onNewChat}
              className="flex w-full items-center justify-center rounded-md py-2 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 hidden group-hover:block">
              <div className="rounded-md border bg-popover px-3 py-1.5 text-sm shadow-md whitespace-nowrap">
                New Chat
              </div>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full justify-start gap-3 rounded-xl h-11 border-dashed border-border/60 hover:border-primary/50 hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary"
            onClick={onNewChat}
          >
            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
              <Plus className="h-4 w-4" />
            </div>
            New Chat
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Chat Page ───

export function ChatPage() {
  const { sendRpc } = useGateway();
  const { sendMessage, abortRun, switchSession, resetSession, deleteSession, loadHistory } =
    useChat(sendRpc);
  const { toast } = useToast();

  const messages = useChatStore((s) => s.messages);
  const messagesLoading = useChatStore((s) => s.messagesLoading);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamContent = useChatStore((s) => s.streamContent);
  const activeSessionKey = useChatStore((s) => s.activeSessionKey);
  const sessions = useChatStore((s) => s.sessions);
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");

  const [inputValue, setInputValue] = useState("");
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [chatSidebarCollapsed, setChatSidebarCollapsed] = useState(false);
  const modelSelectorRef = useRef<HTMLDivElement>(null);

  // Attachment state for image paste / file picker
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addAttachments = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      return;
    }
    const newAttachments: Attachment[] = [];
    for (const file of imageFiles) {
      const preview = await readFileAsDataUrl(file);
      newAttachments.push({ file, preview, id: `att-${++attachmentIdCounter}` });
    }
    setAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Handle paste events to detect images
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) {
        return;
      }
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        addAttachments(imageFiles);
      }
    },
    [addAttachments],
  );

  // Handle file input change (from Paperclip button)
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) {
        return;
      }
      addAttachments(Array.from(files));
      // Reset the input so the same file can be re-selected
      e.target.value = "";
    },
    [addAttachments],
  );

  // Message ratings: map of message index -> "up" | "down"
  const [ratings, setRatings] = useState<Record<number, "up" | "down">>({});

  // Reset ratings when session changes
  useEffect(() => {
    setRatings({});
  }, [activeSessionKey]);

  // Find the index of the last assistant message
  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        return i;
      }
    }
    return -1;
  }, [messages]);

  // Handle rating a message
  const handleRate = useCallback(
    (messageIndex: number, value: "up" | "down") => {
      const isToggleOff = ratings[messageIndex] === value;
      setRatings((prev) => {
        if (prev[messageIndex] === value) {
          const next = { ...prev };
          delete next[messageIndex];
          return next;
        }
        return { ...prev, [messageIndex]: value };
      });
      // Best-effort feedback RPC (may not exist yet)
      sendRpc("chat.feedback", {
        sessionKey: activeSessionKey,
        messageIndex,
        rating: isToggleOff ? null : value,
      }).catch(() => {});
    },
    [sendRpc, activeSessionKey, ratings],
  );

  // Regenerate: find last user message and resend it
  const handleRegenerate = useCallback(() => {
    if (isStreaming) {
      return;
    }
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        const lastUserText = getMessageText(messages[i]);
        if (lastUserText.trim()) {
          sendMessage(lastUserText);
          return;
        }
      }
    }
  }, [messages, isStreaming, sendMessage]);

  // Load available models
  const loadModels = useCallback(async () => {
    try {
      const result = await sendRpc<{ models?: ModelEntry[] }>("models.list", {});
      setModels(result?.models ?? []);
    } catch {
      toast("Failed to load models", "error");
    }
  }, [sendRpc, toast]);

  useEffect(() => {
    if (isConnected) {
      loadModels();
    }
  }, [isConnected, loadModels]);

  // Switch model for current session
  const handleModelSwitch = useCallback(
    async (modelId: string) => {
      setModelSelectorOpen(false);
      try {
        await sendRpc("sessions.update", { key: activeSessionKey, model: modelId });
        // Reload sessions to pick up the model change
        const result = await sendRpc<{ sessions: { key: string; model?: string }[] }>(
          "sessions.list",
          { limit: 50, includeDerivedTitles: true, includeLastMessage: true },
        );
        useChatStore.getState().setSessions((result?.sessions as SessionEntry[]) ?? []);
        toast("Model switched successfully", "success");
      } catch (err) {
        console.error("[chat] model switch failed:", err);
        toast("Failed to switch model", "error");
      }
    },
    [sendRpc, activeSessionKey, toast],
  );

  // Close model selector on Escape
  useEffect(() => {
    if (!modelSelectorOpen) {
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModelSelectorOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [modelSelectorOpen]);

  // Close model selector on click outside
  useEffect(() => {
    if (!modelSelectorOpen) {
      return;
    }
    const handleClick = (e: MouseEvent) => {
      if (modelSelectorRef.current && !modelSelectorRef.current.contains(e.target as Node)) {
        setModelSelectorOpen(false);
      }
    };
    const id = setTimeout(() => window.addEventListener("mousedown", handleClick), 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener("mousedown", handleClick);
    };
  }, [modelSelectorOpen]);

  // Resolve the active session's model
  const activeSession = useMemo(
    () => sessions.find((s) => s.key === activeSessionKey),
    [sessions, activeSessionKey],
  );
  const activeModel = useMemo(
    () => models.find((m) => m.id === activeSession?.model),
    [models, activeSession?.model],
  );

  // Context window usage from session token counts
  const tokenUsed =
    (activeSession?.tokenCounts?.totalInput ?? 0) + (activeSession?.tokenCounts?.totalOutput ?? 0);
  const contextTotal = activeModel?.contextWindow ?? 0;
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const scrollToRef = useRef<HTMLDivElement>(null);

  const hasMessages = messages.length > 0 || isStreaming;

  // ── "New messages" indicator state ──
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const isNearBottomRef = useRef(true);
  const prevMessageCountRef = useRef(messages.length);

  // Track whether user is near the bottom (within 300px)
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const nearBottom = scrollHeight - scrollTop - clientHeight <= 300;
      isNearBottomRef.current = nearBottom;
      if (nearBottom) {
        setHasNewBelow(false);
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [hasMessages]);

  // Detect new messages arriving while scrolled up
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current && !isNearBottomRef.current) {
      setHasNewBelow(true);
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  // Clear indicator on session switch
  useEffect(() => {
    setHasNewBelow(false);
    isNearBottomRef.current = true;
  }, [activeSessionKey]);

  const scrollToBottom = useCallback(() => {
    const container = chatContainerRef.current;
    if (!container) {
      return;
    }
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    setHasNewBelow(false);
  }, []);

  const handleSubmit = async () => {
    const hasText = inputValue.trim().length > 0;
    const hasAttachments = attachments.length > 0;
    if ((!hasText && !hasAttachments) || isStreaming) {
      return;
    }

    try {
      if (hasAttachments) {
        // Build structured content blocks for multimodal message
        const contentBlocks: Array<unknown> = [];
        if (hasText) {
          contentBlocks.push({ type: "text", text: inputValue });
        }
        for (const att of attachments) {
          const base64 = extractBase64(att.preview);
          contentBlocks.push({
            type: "image",
            source: {
              type: "base64",
              media_type: att.file.type,
              data: base64,
            },
          });
        }
        await sendMessage(contentBlocks);
      } else {
        await sendMessage(inputValue);
      }
      setInputValue("");
      setAttachments([]);
    } catch {
      toast("Failed to send message", "error");
    }
  };

  // Wrapped delete with toast
  const handleDeleteSession = useCallback(
    async (key: string) => {
      try {
        await deleteSession(key);
        toast("Session deleted", "success");
      } catch {
        toast("Failed to delete session", "error");
      }
    },
    [deleteSession, toast],
  );

  const handleNewChat = () => {
    switchSession("main");
  };

  return (
    <div className="flex h-full bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <div
        className={cn(
          "hidden md:block border-r border-border h-full shrink-0 transition-all duration-200 ease-in-out overflow-hidden",
          chatSidebarCollapsed ? "w-[52px]" : "w-80",
        )}
      >
        <SessionSidebarContent
          onSelect={switchSession}
          activeKey={activeSessionKey}
          onNewChat={handleNewChat}
          onReset={resetSession}
          onDelete={handleDeleteSession}
          collapsed={chatSidebarCollapsed}
          onCollapse={setChatSidebarCollapsed}
        />
      </div>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col min-w-0 h-full relative">
        {/* Header - Mobile Sidebar Trigger Only */}
        <div className="md:hidden flex items-center border-b border-border px-4 py-2 h-14 shrink-0 bg-background/80 backdrop-blur z-20 absolute top-0 left-0 right-0">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="-ml-2" aria-label="Open chat sidebar">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-80 border-r border-border">
              <SessionSidebarContent
                onSelect={switchSession}
                activeKey={activeSessionKey}
                onNewChat={handleNewChat}
                onReset={resetSession}
                onDelete={handleDeleteSession}
              />
            </SheetContent>
          </Sheet>
          <span className="font-medium ml-2">Chat</span>
        </div>

        {/* Content area */}
        <div className="flex flex-1 flex-col min-h-0 pt-14 md:pt-0">
          {messagesLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <TextShimmerLoader text="Loading messages..." size="md" />
            </div>
          ) : !hasMessages ? (
            <div className="flex flex-1 items-center justify-center p-4">
              <EmptyState onSuggestionClick={setInputValue} />
            </div>
          ) : (
            <ChatContainer
              ref={chatContainerRef}
              scrollToRef={scrollToRef}
              className="flex-1 w-full relative"
            >
              <div className="mx-auto w-full max-w-4xl py-6 md:py-10" role="log" aria-live="polite">
                {messages.map((msg, i) => (
                  <ChatMessageBubble
                    key={msg.id}
                    msg={msg}
                    index={i}
                    rating={ratings[i] ?? null}
                    isLastAssistant={i === lastAssistantIndex}
                    isGroupFirst={isFirstInGroup(messages, i)}
                    onRate={handleRate}
                    onRegenerate={handleRegenerate}
                  />
                ))}
                {isStreaming && (
                  <StreamingBubble
                    content={streamContent}
                    isGroupFirst={
                      messages.length === 0 ||
                      (messages[messages.length - 1].role !== "assistant" &&
                        messages[messages.length - 1].role !== "tool")
                    }
                  />
                )}
                <div ref={scrollToRef} className="h-4" />
              </div>
            </ChatContainer>
          )}

          {/* Scroll-to-bottom FAB + New messages indicator */}
          {hasMessages && (
            <div className="absolute bottom-24 right-6 md:right-10 z-20 flex flex-col items-center gap-2">
              {hasNewBelow && (
                <button
                  onClick={scrollToBottom}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all animate-slide-in-up"
                >
                  New messages
                  <ArrowDown className="h-3 w-3" />
                </button>
              )}
              <PromptScrollButton
                scrollRef={scrollToRef}
                containerRef={chatContainerRef}
                threshold={200}
              />
            </div>
          )}
        </div>

        {/* Improved Input Area */}
        <div className="shrink-0 p-4 pt-2 pb-6 z-20 bg-gradient-to-t from-background via-background to-transparent">
          <div className="mx-auto max-w-4xl relative">
            {/* Pro Nudge */}
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex items-center gap-1.5 opacity-70 hover:opacity-100 transition-opacity duration-300">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                Use our faster AI on Pro Plan
              </span>
              <span className="h-1 w-1 rounded-full bg-primary/50" />
              <span className="text-[10px] tracking-wide text-primary font-bold cursor-pointer hover:underline">
                UPGRADE
              </span>
            </div>

            {/* Hidden file input for Paperclip button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />

            <PromptInput
              value={inputValue}
              onValueChange={setInputValue}
              onSubmit={handleSubmit}
              isLoading={isStreaming}
              className="bg-secondary/40 border-border/60 shadow-lg backdrop-blur-md rounded-3xl overflow-hidden ring-1 ring-border/40 focus-within:ring-primary/20 transition-all p-0"
            >
              {/* Attachment previews */}
              {attachments.length > 0 && (
                <div className="flex items-center gap-2 px-4 pt-3 pb-1 overflow-x-auto">
                  {attachments.map((att) => (
                    <div key={att.id} className="relative shrink-0 group/att">
                      <img
                        src={att.preview}
                        alt={att.file.name}
                        className="h-12 w-12 rounded-lg object-cover border border-border/60"
                      />
                      <button
                        onClick={() => removeAttachment(att.id)}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-background border border-border flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity shadow-sm hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
                        aria-label="Remove attachment"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div onPaste={handlePaste}>
                <PromptInputTextarea
                  placeholder={isConnected ? "Ask me anything..." : "Connecting to gateway..."}
                  disabled={!isConnected}
                  className="text-base min-h-[56px] px-4 py-4 md:text-sm placeholder:text-muted-foreground/60"
                />
              </div>

              {/* Internal Toolbar */}
              <div className="flex items-center justify-between px-3 pb-3 pt-1">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="h-8 w-8 text-muted-foreground hover:bg-muted/50 rounded-lg hover:text-foreground"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach image"
                    aria-label="Attach image"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <div className="relative" ref={modelSelectorRef}>
                    <button
                      onClick={() => setModelSelectorOpen((prev) => !prev)}
                      className="flex items-center gap-1.5 px-2 h-8 text-muted-foreground hover:text-foreground text-xs font-mono rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      <Bot className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate max-w-[140px]">
                        {activeModel?.name ?? activeSession?.model ?? "Default Model"}
                      </span>
                      {activeModel?.reasoning && (
                        <span title="Reasoning">
                          <Brain className="h-3 w-3 text-chart-5 shrink-0" />
                        </span>
                      )}
                      <ChevronDown
                        className={cn(
                          "h-3 w-3 shrink-0 opacity-50 transition-transform",
                          modelSelectorOpen && "rotate-180",
                        )}
                      />
                    </button>

                    {/* Model Selector Dropdown */}
                    {modelSelectorOpen && (
                      <div className="absolute bottom-full left-0 mb-2 z-50 w-72 sm:w-80 rounded-xl border border-border bg-popover/95 backdrop-blur-md shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-bottom-left">
                        <div className="max-h-80 overflow-y-auto">
                          {models.length === 0 ? (
                            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                              No models available
                            </div>
                          ) : (
                            Object.entries(groupModelsByProvider(models)).map(
                              ([provider, providerModels]) => (
                                <div key={provider}>
                                  <div className="sticky top-0 bg-popover/95 backdrop-blur px-3 py-1.5 border-b border-border/50">
                                    <span
                                      className={cn(
                                        "text-[10px] font-mono uppercase tracking-wider",
                                        providerColor(provider),
                                      )}
                                    >
                                      {provider}
                                    </span>
                                  </div>
                                  {providerModels.map((model) => {
                                    const isSelected = model.id === activeSession?.model;
                                    return (
                                      <button
                                        key={model.id}
                                        onClick={() => handleModelSwitch(model.id)}
                                        className={cn(
                                          "flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-secondary/40 transition-colors",
                                          isSelected && "bg-primary/5",
                                        )}
                                      >
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-sm font-mono truncate">
                                              {model.name}
                                            </span>
                                            {model.reasoning && (
                                              <span title="Reasoning">
                                                <Brain className="h-3 w-3 text-chart-5 shrink-0" />
                                              </span>
                                            )}
                                            {model.input?.includes("image") && (
                                              <span title="Vision">
                                                <Image className="h-3 w-3 text-chart-2 shrink-0" />
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[10px] font-mono text-muted-foreground truncate">
                                              {model.id}
                                            </span>
                                            {model.contextWindow && (
                                              <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                                                {formatContextWindow(model.contextWindow)} ctx
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        {isSelected && (
                                          <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              ),
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="h-8 w-8 text-muted-foreground hover:bg-muted/50 rounded-full hover:text-foreground"
                    aria-label="Voice input"
                  >
                    <Mic className="h-4 w-4" />
                  </Button>
                  <PromptInputActions>
                    {isStreaming ? (
                      <Button
                        variant="default"
                        size="icon-xs"
                        onClick={abortRun}
                        aria-label="Stop generating"
                        className="h-8 w-8 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-md transform hover:scale-105 transition-all"
                      >
                        <Square className="h-3.5 w-3.5 fill-current" />
                      </Button>
                    ) : (
                      <Button
                        variant="default"
                        size="icon-xs"
                        onClick={handleSubmit}
                        disabled={(!inputValue.trim() && attachments.length === 0) || !isConnected}
                        aria-label="Send message"
                        className={cn(
                          "h-8 w-8 rounded-full shadow-md transition-all duration-200",
                          inputValue.trim() || attachments.length > 0
                            ? "bg-primary text-primary-foreground transform hover:scale-105"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                    )}
                  </PromptInputActions>
                </div>
              </div>
            </PromptInput>

            {tokenUsed > 0 && contextTotal > 0 && (
              <ContextUsageBar
                used={tokenUsed}
                total={contextTotal}
                className="mt-2 max-w-xs mx-auto"
              />
            )}
            <div className="text-center mt-2 text-[10px] text-muted-foreground/40 font-mono">
              AI Operator can make mistakes. Please verify important information.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
