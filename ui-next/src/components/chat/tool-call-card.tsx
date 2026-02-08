import { Wrench, ChevronDown, ChevronRight, Check } from "lucide-react";
import { useState } from "react";
import type { ChatMessageContent } from "@/store/chat-store";
import { cn } from "@/lib/utils";

/** Threshold below which tool result text is shown inline (not collapsed). */
const INLINE_THRESHOLD = 80;

export type ToolCardData = {
  kind: "call" | "result";
  name: string;
  args?: unknown;
  text?: string;
};

/** Extract tool call and tool result cards from a message's content array. */
export function extractToolCards(content: string | ChatMessageContent[]): ToolCardData[] {
  if (typeof content === "string") return [];

  const cards: ToolCardData[] = [];

  for (const block of content) {
    const kind = (typeof block.type === "string" ? block.type : "").toLowerCase();

    // Tool call / tool_use blocks
    if (
      kind === "tool_use" ||
      kind === "tool_call" ||
      kind === "tooluse" ||
      kind === "toolcall" ||
      (typeof block.name === "string" && block.input != null)
    ) {
      cards.push({
        kind: "call",
        name: (block.name as string) ?? "tool",
        args: block.input ?? block.arguments ?? block.args,
      });
    }

    // Tool result blocks
    if (kind === "tool_result" || kind === "toolresult") {
      const text =
        typeof block.content === "string"
          ? block.content
          : typeof block.text === "string"
            ? block.text
            : undefined;
      cards.push({
        kind: "result",
        name: (block.name as string) ?? (block.tool_use_id as string) ?? "tool",
        text,
      });
    }
  }

  return cards;
}

/** Format an arguments value for display. */
function formatArgs(args: unknown): string {
  if (args == null) return "";
  if (typeof args === "string") {
    // Try parsing as JSON for pretty-print
    const trimmed = args.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
      } catch {
        return args;
      }
    }
    return args;
  }
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

/** A single tool card: shows tool name, args, and optionally a collapsible result. */
function ToolCard({ card }: { card: ToolCardData }) {
  const [expanded, setExpanded] = useState(false);
  const isCall = card.kind === "call";
  const formattedArgs = isCall ? formatArgs(card.args) : "";
  const hasResult = !isCall && card.text != null;
  const isShort = hasResult && (card.text?.length ?? 0) <= INLINE_THRESHOLD;
  const isLong = hasResult && !isShort;

  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm">
      {/* Header */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2",
          isLong && "cursor-pointer hover:bg-muted/40 transition-colors",
        )}
        onClick={isLong ? () => setExpanded((prev) => !prev) : undefined}
      >
        <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-foreground truncate">{card.name}</span>

        {/* Status indicators */}
        {!isCall && !hasResult && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
            <Check className="h-3 w-3" />
            Completed
          </span>
        )}
        {isLong && (
          <span className="ml-auto text-muted-foreground">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </span>
        )}
      </div>

      {/* Arguments (for tool calls) */}
      {isCall && formattedArgs && (
        <div className="border-t border-border/50 px-3 py-2">
          <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-all leading-relaxed max-h-32 overflow-y-auto">
            {formattedArgs}
          </pre>
        </div>
      )}

      {/* Short inline result */}
      {isShort && (
        <div className="border-t border-border/50 px-3 py-2">
          <span className="text-[11px] font-mono text-muted-foreground">{card.text}</span>
        </div>
      )}

      {/* Long collapsible result */}
      {isLong && expanded && (
        <div className="border-t border-border/50 px-3 py-2">
          <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-all leading-relaxed max-h-64 overflow-y-auto">
            {card.text}
          </pre>
        </div>
      )}
    </div>
  );
}

/** Renders a list of tool cards extracted from a message. */
export function ToolCallCard({ cards }: { cards: ToolCardData[] }) {
  if (cards.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {cards.map((card, i) => (
        <ToolCard key={`${card.kind}-${card.name}-${i}`} card={card} />
      ))}
    </div>
  );
}
