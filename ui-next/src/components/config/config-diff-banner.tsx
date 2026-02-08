import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type ConfigDiffBannerProps = {
  formValue: Record<string, unknown>;
  originalValue: Record<string, unknown>;
};

type Change = {
  path: string;
  from: unknown;
  to: unknown;
};

function computeChanges(
  original: Record<string, unknown>,
  current: Record<string, unknown>,
  prefix: string[] = [],
): Change[] {
  const changes: Change[] = [];
  const allKeys = new Set([...Object.keys(original), ...Object.keys(current)]);

  for (const key of allKeys) {
    const path = [...prefix, key];
    const ov = original[key];
    const cv = current[key];

    if (ov === cv) continue;

    // Both objects: recurse
    if (
      typeof ov === "object" &&
      ov !== null &&
      !Array.isArray(ov) &&
      typeof cv === "object" &&
      cv !== null &&
      !Array.isArray(cv)
    ) {
      changes.push(
        ...computeChanges(ov as Record<string, unknown>, cv as Record<string, unknown>, path),
      );
      continue;
    }

    // Different values
    if (JSON.stringify(ov) !== JSON.stringify(cv)) {
      changes.push({
        path: path.join("."),
        from: ov,
        to: cv,
      });
    }
  }

  return changes;
}

function formatValue(v: unknown): string {
  if (v === undefined) return "(removed)";
  if (v === null) return "null";
  if (typeof v === "string") return v || '""';
  return JSON.stringify(v);
}

export function ConfigDiffBanner({ formValue, originalValue }: ConfigDiffBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const changes = computeChanges(originalValue, formValue);

  if (changes.length === 0) return null;

  return (
    <div className="rounded-lg border border-chart-5/30 bg-chart-5/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm"
      >
        <AlertTriangle className="h-4 w-4 text-chart-5 shrink-0" />
        <span className="text-chart-5 font-medium">
          {changes.length} unsaved {changes.length === 1 ? "change" : "changes"}
        </span>
        <span className="text-xs text-muted-foreground">
          — saving will apply changes and may restart the gateway
        </span>
        <div className="flex-1" />
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-chart-5/20 px-4 py-2 space-y-1.5">
          {changes.map((change) => (
            <div key={change.path} className="flex items-start gap-3 text-xs font-mono">
              <span className="text-muted-foreground w-48 shrink-0 truncate" title={change.path}>
                {change.path}
              </span>
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded",
                  change.from === undefined
                    ? "bg-chart-2/10 text-chart-2"
                    : change.to === undefined
                      ? "bg-destructive/10 text-destructive"
                      : "bg-chart-5/10 text-chart-5",
                )}
              >
                {change.from === undefined
                  ? `+ ${formatValue(change.to)}`
                  : change.to === undefined
                    ? `- ${formatValue(change.from)}`
                    : `${formatValue(change.from)} → ${formatValue(change.to)}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
