import { Bug, Send, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { JsonViewer } from "@/components/ui/custom/data";
import { useGateway } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway-store";

export function DebugPage() {
  const { sendRpc } = useGateway();
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");
  const eventLog = useGatewayStore((s) => s.eventLog);
  const hello = useGatewayStore((s) => s.hello);
  const healthSnapshot = useGatewayStore((s) => s.healthSnapshot);

  const [rpcMethod, setRpcMethod] = useState("health");
  const [rpcParams, setRpcParams] = useState("{}");
  const [rpcResult, setRpcResult] = useState<unknown>(null);
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [rpcLoading, setRpcLoading] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState<number | null>(null);

  const handleRpcCall = useCallback(async () => {
    setRpcLoading(true);
    setRpcResult(null);
    setRpcError(null);
    try {
      let params: unknown = {};
      if (rpcParams.trim()) {
        params = JSON.parse(rpcParams);
      }
      const result = await sendRpc(rpcMethod, params);
      setRpcResult(result);
    } catch (e) {
      setRpcError((e as Error).message);
    } finally {
      setRpcLoading(false);
    }
  }, [sendRpc, rpcMethod, rpcParams]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bug className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-mono font-semibold">Debug</h1>
      </div>

      {/* RPC Console */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-2">
          <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
            RPC Console
          </h2>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-2">
            <div className="flex-1 sm:max-w-xs">
              <label className="text-xs font-mono text-muted-foreground mb-1 block">Method</label>
              <input
                type="text"
                value={rpcMethod}
                onChange={(e) => setRpcMethod(e.target.value)}
                placeholder="e.g. health"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm font-mono outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-mono text-muted-foreground mb-1 block">
                Params (JSON)
              </label>
              <input
                type="text"
                value={rpcParams}
                onChange={(e) => setRpcParams(e.target.value)}
                placeholder="{}"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm font-mono outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] placeholder:text-muted-foreground"
              />
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={handleRpcCall}
              disabled={!isConnected || rpcLoading || !rpcMethod}
            >
              <Send className="h-3.5 w-3.5" />
              Send
            </Button>
          </div>

          {rpcError && (
            <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-mono text-destructive">
              {rpcError}
            </div>
          )}

          {rpcResult != null && (
            <div>
              <h3 className="text-xs font-mono text-muted-foreground mb-1">Response</h3>
              <JsonViewer data={rpcResult} maxDepth={6} />
            </div>
          )}
        </div>
      </div>

      {/* Snapshots */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {hello && (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="border-b border-border px-4 py-2">
              <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
                Hello Snapshot
              </h2>
            </div>
            <div className="p-3 max-h-80 overflow-auto">
              <JsonViewer data={hello} maxDepth={4} />
            </div>
          </div>
        )}

        {healthSnapshot && (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="border-b border-border px-4 py-2">
              <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
                Health Snapshot
              </h2>
            </div>
            <div className="p-3 max-h-80 overflow-auto">
              <JsonViewer data={healthSnapshot} maxDepth={4} />
            </div>
          </div>
        )}
      </div>

      {/* Event log */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
            Event Log
          </h2>
          <span className="text-xs font-mono text-muted-foreground">{eventLog.length} events</span>
        </div>
        <div className="max-h-96 overflow-auto">
          {eventLog.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">No events yet</div>
          ) : (
            eventLog.map((evt, i) => {
              const isExpanded = expandedEvent === i;
              return (
                <div key={`${evt.ts}-${i}`} className="border-b border-border/30 last:border-0">
                  <div
                    className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-secondary/20 transition-colors"
                    onClick={() => setExpandedEvent(isExpanded ? null : i)}
                  >
                    {evt.payload ? (
                      isExpanded ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      )
                    ) : (
                      <div className="w-3" />
                    )}
                    <span className="text-xs font-mono text-muted-foreground shrink-0">
                      {new Date(evt.ts).toLocaleTimeString("en-US", {
                        hour12: false,
                        fractionalSecondDigits: 3,
                      })}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-mono font-semibold",
                        evt.event === "chat"
                          ? "text-primary"
                          : evt.event === "presence"
                            ? "text-chart-2"
                            : "text-foreground",
                      )}
                    >
                      {evt.event}
                    </span>
                  </div>
                  {isExpanded && evt.payload && (
                    <div className="px-4 pb-3 pl-9">
                      <JsonViewer data={evt.payload} maxDepth={4} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
