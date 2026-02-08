import { ScrollText, RotateCcw, Pause, Play, ArrowDown, Trash2 } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useGateway } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway-store";

type LogLine = {
  text: string;
  level?: "info" | "warn" | "error" | "debug";
  ts?: string;
};

function parseLine(raw: string): LogLine {
  // Attempt to parse structured log lines: [TIMESTAMP] LEVEL message
  const match = raw.match(
    /^\[?(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^\]]*)\]?\s*(INFO|WARN|ERROR|DEBUG|info|warn|error|debug)?\s*(.*)/,
  );
  if (match) {
    return {
      ts: match[1],
      level: (match[2]?.toLowerCase() as LogLine["level"]) ?? undefined,
      text: match[3] || raw,
    };
  }
  // Check for level-only lines
  const levelMatch = raw.match(/^(INFO|WARN|ERROR|DEBUG|info|warn|error|debug)\s+(.*)/);
  if (levelMatch) {
    return {
      level: levelMatch[1].toLowerCase() as LogLine["level"],
      text: levelMatch[2],
    };
  }
  return { text: raw };
}

const levelColors: Record<string, string> = {
  info: "text-chart-2",
  warn: "text-chart-5",
  error: "text-destructive",
  debug: "text-muted-foreground",
};

export function LogsPage() {
  const { sendRpc } = useGateway();
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");
  const [lines, setLines] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const result = await sendRpc<{
        lines?: string[];
        cursor?: number;
        truncated?: boolean;
        reset?: boolean;
      }>("logs.tail", {
        cursor: cursorRef.current,
        limit: 500,
      });

      if (result?.reset) {
        setLines([]);
        cursorRef.current = 0;
      }

      if (result?.lines && result.lines.length > 0) {
        const parsed = result.lines.map(parseLine);
        setLines((prev) => [...prev, ...parsed].slice(-2000));
      }
      if (result?.cursor != null) {
        cursorRef.current = result.cursor;
      }
    } catch {
      // silently fail
    }
  }, [sendRpc]);

  const initialLoad = useCallback(async () => {
    setLoading(true);
    cursorRef.current = 0;
    setLines([]);
    await fetchLogs();
    setLoading(false);
  }, [fetchLogs]);

  useEffect(() => {
    if (isConnected) initialLoad();
  }, [isConnected, initialLoad]);

  // Poll for new logs
  useEffect(() => {
    if (!isConnected || paused) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(fetchLogs, 2000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isConnected, paused, fetchLogs]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && !paused && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines.length, autoScroll, paused]);

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  const filtered = filter
    ? lines.filter((l) => l.text.toLowerCase().includes(filter.toLowerCase()))
    : lines;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <ScrollText className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-mono font-semibold">Logs</h1>
          <span className="text-xs font-mono text-muted-foreground">{lines.length} lines</span>
        </div>
        <Button variant="outline" size="sm" onClick={initialLoad} disabled={loading}>
          <RotateCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Reload
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 shrink-0">
          <input
            type="text"
            placeholder="Filter logs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-7 flex-1 max-w-xs rounded border border-border bg-background px-2 text-xs font-mono placeholder:text-muted-foreground outline-none focus:border-primary/50"
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
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              setLines([]);
              cursorRef.current = 0;
            }}
            title="Clear"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
          {paused && (
            <span className="text-[10px] font-mono text-chart-5 px-1.5 py-0.5 rounded bg-chart-5/10">
              paused
            </span>
          )}
          <span className="text-[10px] font-mono text-muted-foreground ml-auto">
            {filtered.length} lines
          </span>
        </div>

        {/* Log content */}
        {!isConnected ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p className="text-sm">Connect to the gateway to view logs</p>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="flex-1 overflow-y-auto p-2 font-mono text-xs leading-5"
            onScroll={() => {
              const el = containerRef.current;
              if (!el) return;
              const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
              setAutoScroll(atBottom);
            }}
          >
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                {filter ? "No matching lines" : loading ? "Loading..." : "No log entries"}
              </div>
            ) : (
              filtered.map((line, i) => (
                <div key={i} className="flex gap-2 hover:bg-secondary/30 rounded px-1">
                  {line.ts && <span className="shrink-0 text-muted-foreground/50">{line.ts}</span>}
                  {line.level && (
                    <span
                      className={cn(
                        "shrink-0 w-12 uppercase",
                        levelColors[line.level] ?? "text-foreground",
                      )}
                    >
                      {line.level}
                    </span>
                  )}
                  <span className="text-foreground break-all whitespace-pre-wrap">{line.text}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
