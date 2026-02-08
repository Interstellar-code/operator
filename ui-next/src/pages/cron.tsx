import {
  Timer,
  RotateCcw,
  Play,
  Pause,
  Trash2,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useGateway } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway-store";

type CronJob = {
  id?: string;
  jobId?: string;
  name?: string;
  schedule?: string;
  enabled?: boolean;
  lastRunMs?: number;
  nextRunMs?: number;
  lastResult?: string;
  lastError?: string;
  runCount?: number;
  spec?: unknown;
  trigger?: unknown;
  [key: string]: unknown;
};

type CronRunEntry = {
  ts?: number;
  ok?: boolean;
  durationMs?: number;
  error?: string;
  [key: string]: unknown;
};

function formatTime(ms?: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function CronPage() {
  const { sendRpc } = useGateway();
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [runHistory, setRunHistory] = useState<Record<string, CronRunEntry[]>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await sendRpc<{ jobs?: CronJob[] }>("cron.list", {
        includeDisabled: true,
      });
      setJobs(result?.jobs ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [sendRpc]);

  useEffect(() => {
    if (isConnected) loadJobs();
  }, [isConnected, loadJobs]);

  const loadRuns = useCallback(
    async (jobId: string) => {
      try {
        const result = await sendRpc<{ entries?: CronRunEntry[] }>("cron.runs", {
          id: jobId,
          limit: 20,
        });
        setRunHistory((prev) => ({ ...prev, [jobId]: result?.entries ?? [] }));
      } catch {
        // silently fail
      }
    },
    [sendRpc],
  );

  const toggleExpand = useCallback(
    (jobId: string) => {
      if (expandedJob === jobId) {
        setExpandedJob(null);
      } else {
        setExpandedJob(jobId);
        if (!runHistory[jobId]) loadRuns(jobId);
      }
    },
    [expandedJob, runHistory, loadRuns],
  );

  const handleRunNow = useCallback(
    async (jobId: string) => {
      setActionLoading(jobId);
      try {
        await sendRpc("cron.run", { id: jobId, mode: "force" });
        await loadJobs();
        await loadRuns(jobId);
      } finally {
        setActionLoading(null);
      }
    },
    [sendRpc, loadJobs, loadRuns],
  );

  const handleToggle = useCallback(
    async (jobId: string, enabled: boolean) => {
      setActionLoading(jobId);
      try {
        await sendRpc("cron.update", { id: jobId, patch: { enabled } });
        await loadJobs();
      } finally {
        setActionLoading(null);
      }
    },
    [sendRpc, loadJobs],
  );

  const handleDelete = useCallback(
    async (jobId: string) => {
      setActionLoading(jobId);
      try {
        await sendRpc("cron.remove", { id: jobId });
        await loadJobs();
      } finally {
        setActionLoading(null);
      }
    },
    [sendRpc, loadJobs],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Timer className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-mono font-semibold">Cron Jobs</h1>
          <span className="text-xs font-mono text-muted-foreground">{jobs.length} jobs</span>
        </div>
        <Button variant="outline" size="sm" onClick={loadJobs} disabled={loading}>
          <RotateCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {!isConnected ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          <Timer className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Connect to the gateway to view cron jobs</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          <Clock className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm mb-1">No cron jobs configured</p>
          <p className="text-xs">Add scheduled jobs via the config file or CLI</p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => {
            const jobId = job.id || job.jobId || "";
            const isExpanded = expandedJob === jobId;
            const runs = runHistory[jobId];

            return (
              <div key={jobId} className="rounded-lg border border-border bg-card overflow-hidden">
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-secondary/20 transition-colors"
                  onClick={() => toggleExpand(jobId)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-semibold truncate">
                        {job.name || jobId}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-mono px-1.5 py-0.5 rounded",
                          job.enabled
                            ? "bg-chart-2/10 text-chart-2"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {job.enabled ? "active" : "disabled"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs font-mono text-muted-foreground">
                        {job.schedule || "—"}
                      </span>
                      {job.nextRunMs && (
                        <span className="text-xs text-muted-foreground">
                          Next: {formatTime(job.nextRunMs)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRunNow(jobId);
                      }}
                      disabled={actionLoading === jobId}
                      title="Run now"
                    >
                      <Play className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggle(jobId, !job.enabled);
                      }}
                      disabled={actionLoading === jobId}
                      title={job.enabled ? "Disable" : "Enable"}
                    >
                      {job.enabled ? (
                        <Pause className="h-3 w-3" />
                      ) : (
                        <Play className="h-3 w-3 text-chart-2" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(jobId);
                      }}
                      disabled={actionLoading === jobId}
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border/50 px-4 py-3">
                    <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
                      Recent Runs
                    </h4>
                    {!runs ? (
                      <p className="text-xs text-muted-foreground">Loading...</p>
                    ) : runs.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No run history</p>
                    ) : (
                      <div className="space-y-1">
                        {runs.map((run, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 text-xs font-mono px-2 py-1 rounded hover:bg-secondary/20"
                          >
                            {run.ok ? (
                              <CheckCircle2 className="h-3 w-3 text-chart-2 shrink-0" />
                            ) : (
                              <XCircle className="h-3 w-3 text-destructive shrink-0" />
                            )}
                            <span className="text-muted-foreground">
                              {run.ts ? formatTime(run.ts) : "—"}
                            </span>
                            {run.durationMs != null && (
                              <span className="text-muted-foreground">{run.durationMs}ms</span>
                            )}
                            {run.error && (
                              <span className="text-destructive truncate">{run.error}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
