import {
  Monitor,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronRight,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useGateway } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway-store";

type NodeInfo = {
  nodeId: string;
  displayName?: string;
  platform?: string;
  version?: string;
  connected?: boolean;
  paired?: boolean;
  caps?: string[];
  commands?: string[];
  lastSeenMs?: number;
  [key: string]: unknown;
};

type PairRequest = {
  requestId: string;
  nodeId: string;
  displayName?: string;
  platform?: string;
  version?: string;
  createdMs?: number;
};

function formatTime(ms?: number): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

import { ExecApprovals } from "@/components/nodes/exec-approvals";

export function NodesPage() {
  const { sendRpc } = useGateway();
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [pairRequests, setPairRequests] = useState<PairRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const [renamingNode, setRenamingNode] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadNodes = useCallback(async () => {
    setLoading(true);
    try {
      const [nodeResult, pairResult] = await Promise.all([
        sendRpc<{ nodes?: NodeInfo[] }>("node.list", {}),
        sendRpc<{ requests?: PairRequest[] }>("node.pair.list", {}),
      ]);
      setNodes(nodeResult?.nodes ?? []);
      setPairRequests(pairResult?.requests ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [sendRpc]);

  useEffect(() => {
    if (isConnected) loadNodes();
  }, [isConnected, loadNodes]);

  const handleApprove = useCallback(
    async (requestId: string) => {
      setActionLoading(requestId);
      try {
        await sendRpc("node.pair.approve", { requestId });
        await loadNodes();
      } finally {
        setActionLoading(null);
      }
    },
    [sendRpc, loadNodes],
  );

  const handleReject = useCallback(
    async (requestId: string) => {
      setActionLoading(requestId);
      try {
        await sendRpc("node.pair.reject", { requestId });
        await loadNodes();
      } finally {
        setActionLoading(null);
      }
    },
    [sendRpc, loadNodes],
  );

  const handleRename = useCallback(
    async (nodeId: string, displayName: string) => {
      setActionLoading(nodeId);
      try {
        await sendRpc("node.rename", { nodeId, displayName });
        setRenamingNode(null);
        await loadNodes();
      } finally {
        setActionLoading(null);
      }
    },
    [sendRpc, loadNodes],
  );

  const connectedNodes = nodes.filter((n) => n.connected);
  const pairedNodes = nodes.filter((n) => n.paired && !n.connected);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Monitor className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-mono font-semibold">Nodes</h1>
          <span className="text-xs font-mono text-muted-foreground">
            {connectedNodes.length} connected, {pairedNodes.length} paired
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={loadNodes} disabled={loading}>
          <RotateCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {!isConnected ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          <Monitor className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Connect to the gateway to view nodes</p>
        </div>
      ) : (
        <>
          {/* Pair requests */}
          {pairRequests.length > 0 && (
            <div>
              <h2 className="text-sm font-mono uppercase tracking-wider text-chart-5 mb-3">
                Pending Pair Requests
              </h2>
              <div className="space-y-2">
                {pairRequests.map((req) => (
                  <div
                    key={req.requestId}
                    className="rounded-lg border border-chart-5/30 bg-chart-5/5 px-4 py-3 flex items-center gap-3"
                  >
                    <Monitor className="h-4 w-4 text-chart-5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-mono">{req.displayName || req.nodeId}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {req.platform && (
                          <span className="text-xs text-muted-foreground">{req.platform}</span>
                        )}
                        {req.version && (
                          <span className="text-xs text-muted-foreground">v{req.version}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => handleApprove(req.requestId)}
                        disabled={actionLoading === req.requestId}
                        className="text-chart-2 border-chart-2/30"
                      >
                        <Check className="h-3 w-3" />
                        Approve
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => handleReject(req.requestId)}
                        disabled={actionLoading === req.requestId}
                        className="text-destructive"
                      >
                        <X className="h-3 w-3" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Connected nodes */}
          {connectedNodes.length > 0 && (
            <div>
              <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-3">
                Connected
              </h2>
              <div className="space-y-2">
                {connectedNodes.map((node) => (
                  <NodeCard
                    key={node.nodeId}
                    node={node}
                    expanded={expandedNode === node.nodeId}
                    onToggle={() =>
                      setExpandedNode(expandedNode === node.nodeId ? null : node.nodeId)
                    }
                    renaming={renamingNode === node.nodeId}
                    renameValue={renameValue}
                    onStartRename={() => {
                      setRenamingNode(node.nodeId);
                      setRenameValue(node.displayName ?? "");
                    }}
                    onRenameChange={setRenameValue}
                    onRenameSubmit={() => handleRename(node.nodeId, renameValue)}
                    onRenameCancel={() => setRenamingNode(null)}
                    actionLoading={actionLoading === node.nodeId}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Paired but offline */}
          {pairedNodes.length > 0 && (
            <div>
              <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-3">
                Paired (Offline)
              </h2>
              <div className="space-y-2">
                {pairedNodes.map((node) => (
                  <NodeCard
                    key={node.nodeId}
                    node={node}
                    expanded={expandedNode === node.nodeId}
                    onToggle={() =>
                      setExpandedNode(expandedNode === node.nodeId ? null : node.nodeId)
                    }
                    renaming={renamingNode === node.nodeId}
                    renameValue={renameValue}
                    onStartRename={() => {
                      setRenamingNode(node.nodeId);
                      setRenameValue(node.displayName ?? "");
                    }}
                    onRenameChange={setRenameValue}
                    onRenameSubmit={() => handleRename(node.nodeId, renameValue)}
                    onRenameCancel={() => setRenamingNode(null)}
                    actionLoading={actionLoading === node.nodeId}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="mt-8">
            <ExecApprovals />
          </div>
        </>
      )}
    </div>
  );
}

function NodeCard({
  node,
  expanded,
  onToggle,
  renaming,
  renameValue,
  onStartRename,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  actionLoading,
}: {
  node: NodeInfo;
  expanded: boolean;
  onToggle: () => void;
  renaming: boolean;
  renameValue: string;
  onStartRename: () => void;
  onRenameChange: (v: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  actionLoading: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-secondary/20 transition-colors"
        onClick={onToggle}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}

        {node.connected ? (
          <Wifi className="h-4 w-4 text-chart-2 shrink-0" />
        ) : (
          <WifiOff className="h-4 w-4 text-muted-foreground shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          {renaming ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => onRenameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onRenameSubmit();
                  if (e.key === "Escape") onRenameCancel();
                }}
                className="h-6 w-48 rounded border border-input bg-transparent px-2 text-sm font-mono outline-none focus-visible:border-ring"
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onRenameSubmit}
                disabled={actionLoading}
              >
                <Check className="h-3 w-3 text-chart-2" />
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={onRenameCancel}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono font-semibold truncate">
                {node.displayName || node.nodeId}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartRename();
                }}
                className="opacity-0 group-hover:opacity-100"
              >
                <Pencil className="h-2.5 w-2.5" />
              </Button>
            </div>
          )}
          <div className="flex items-center gap-3 mt-0.5">
            {node.platform && (
              <span className="text-xs text-muted-foreground">{node.platform}</span>
            )}
            {node.version && <span className="text-xs text-muted-foreground">v{node.version}</span>}
            {node.lastSeenMs && (
              <span className="text-xs text-muted-foreground">
                Last seen: {formatTime(node.lastSeenMs)}
              </span>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/50 px-4 py-3 space-y-3">
          <div className="text-xs font-mono text-muted-foreground">ID: {node.nodeId}</div>

          {node.caps && node.caps.length > 0 && (
            <div>
              <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1.5">
                Capabilities
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {node.caps.map((cap) => (
                  <span
                    key={cap}
                    className="text-[11px] font-mono px-2 py-0.5 rounded bg-secondary text-secondary-foreground"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          )}

          {node.commands && node.commands.length > 0 && (
            <div>
              <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1.5">
                Commands
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {node.commands.map((cmd) => (
                  <span
                    key={cmd}
                    className="text-[11px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary"
                  >
                    {cmd}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
