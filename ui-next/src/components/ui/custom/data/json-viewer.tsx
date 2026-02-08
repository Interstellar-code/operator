import { ChevronRight, ChevronDown, Copy, Check } from "lucide-react";
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type JsonViewerProps = {
  data: unknown;
  className?: string;
  maxDepth?: number;
  collapsed?: boolean;
};

function JsonValue({
  value,
  depth,
  maxDepth,
}: {
  value: unknown;
  depth: number;
  maxDepth: number;
}) {
  if (value === null) return <span className="text-muted-foreground italic">null</span>;
  if (value === undefined) return <span className="text-muted-foreground italic">undefined</span>;
  if (typeof value === "boolean") return <span className="text-chart-5">{String(value)}</span>;
  if (typeof value === "number") return <span className="text-chart-2">{String(value)}</span>;
  if (typeof value === "string") {
    // Truncate long strings
    const display = value.length > 200 ? `${value.slice(0, 200)}...` : value;
    return <span className="text-primary">"{display}"</span>;
  }
  if (Array.isArray(value)) return <JsonArray arr={value} depth={depth} maxDepth={maxDepth} />;
  if (typeof value === "object")
    return <JsonObject obj={value as Record<string, unknown>} depth={depth} maxDepth={maxDepth} />;
  return <span className="text-foreground">{String(value)}</span>;
}

function JsonArray({ arr, depth, maxDepth }: { arr: unknown[]; depth: number; maxDepth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);

  if (arr.length === 0) return <span className="text-muted-foreground">[]</span>;
  if (depth >= maxDepth) return <span className="text-muted-foreground">[...{arr.length}]</span>;

  return (
    <span>
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center text-muted-foreground hover:text-foreground"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="text-xs ml-0.5">[{arr.length}]</span>
      </button>
      {expanded && (
        <div className="ml-4 border-l border-border/50 pl-3">
          {arr.map((item, i) => (
            <div key={i} className="leading-6">
              <span className="text-muted-foreground text-xs mr-2">{i}:</span>
              <JsonValue value={item} depth={depth + 1} maxDepth={maxDepth} />
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

function JsonObject({
  obj,
  depth,
  maxDepth,
}: {
  obj: Record<string, unknown>;
  depth: number;
  maxDepth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const keys = Object.keys(obj);

  if (keys.length === 0) return <span className="text-muted-foreground">{"{}"}</span>;
  if (depth >= maxDepth)
    return (
      <span className="text-muted-foreground">
        {"{"} ...{keys.length} {"}"}
      </span>
    );

  return (
    <span>
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center text-muted-foreground hover:text-foreground"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="text-xs ml-0.5">
          {"{"}
          {keys.length}
          {"}"}
        </span>
      </button>
      {expanded && (
        <div className="ml-4 border-l border-border/50 pl-3">
          {keys.map((key) => (
            <div key={key} className="leading-6">
              <span className="text-chart-3 text-sm">{key}</span>
              <span className="text-muted-foreground">: </span>
              <JsonValue value={obj[key]} depth={depth + 1} maxDepth={maxDepth} />
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

export function JsonViewer({ data, className, maxDepth = 5, collapsed = false }: JsonViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data]);

  return (
    <div className={cn("rounded-lg border border-border bg-card overflow-hidden", className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-xs font-mono text-muted-foreground">JSON</span>
        <Button variant="ghost" size="icon-xs" onClick={handleCopy} className="h-6 w-6">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
      <div className="overflow-x-auto p-3 font-mono text-sm">
        <JsonValue value={data} depth={0} maxDepth={maxDepth} />
      </div>
    </div>
  );
}
