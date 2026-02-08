import { ArrowDown, Pause, Play, Trash2 } from "lucide-react";
import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LogEntry = {
  ts: number;
  level?: "info" | "warn" | "error" | "debug";
  message: string;
  data?: unknown;
};

export type LogViewerProps = {
  entries: LogEntry[];
  className?: string;
  maxEntries?: number;
  autoScroll?: boolean;
  onClear?: () => void;
};

const levelColors: Record<string, string> = {
  info: "text-chart-2",
  warn: "text-chart-5",
  error: "text-destructive",
  debug: "text-muted-foreground",
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false, fractionalSecondDigits: 3 });
}

export function LogViewer({
  entries,
  className,
  maxEntries = 500,
  autoScroll: autoScrollProp = true,
  onClear,
}: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(autoScrollProp);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");

  const displayEntries = entries.slice(-maxEntries);

  const filtered = filter
    ? displayEntries.filter((e) => e.message.toLowerCase().includes(filter.toLowerCase()))
    : displayEntries;

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    if (autoScroll && !paused) scrollToBottom();
  }, [filtered.length, autoScroll, paused, scrollToBottom]);

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-border bg-card overflow-hidden",
        className,
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <input
          type="text"
          placeholder="Filter logs..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-7 flex-1 rounded border border-border bg-background px-2 text-xs font-mono placeholder:text-muted-foreground outline-none focus:border-primary/50"
        />
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setPaused(!paused)}
          title={paused ? "Resume" : "Pause"}
        >
          {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={scrollToBottom} title="Scroll to bottom">
          <ArrowDown className="h-3 w-3" />
        </Button>
        {onClear && (
          <Button variant="ghost" size="icon-xs" onClick={onClear} title="Clear">
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
        <span className="text-[10px] font-mono text-muted-foreground">{filtered.length}</span>
      </div>

      {/* Log entries */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-2 font-mono text-xs leading-5"
        onScroll={() => {
          const el = containerRef.current;
          if (!el) return;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
          setAutoScroll(atBottom);
        }}
      >
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            {filter ? "No matching entries" : "No log entries"}
          </div>
        ) : (
          filtered.map((entry, i) => (
            <div key={`${entry.ts}-${i}`} className="flex gap-2 hover:bg-secondary/30 rounded px-1">
              <span className="shrink-0 text-muted-foreground">{formatTimestamp(entry.ts)}</span>
              {entry.level && (
                <span
                  className={cn(
                    "shrink-0 w-12 uppercase",
                    levelColors[entry.level] ?? "text-foreground",
                  )}
                >
                  {entry.level}
                </span>
              )}
              <span className="text-foreground break-all">{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
