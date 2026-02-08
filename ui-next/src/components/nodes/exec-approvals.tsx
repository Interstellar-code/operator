import {
  Shield,
  Lock,
  AlertTriangle,
  Monitor,
  Save,
  Loader2,
  Check,
  CheckCircle2,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useGateway } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway-store";

// Types based on ui/src/ui/controllers/exec-approvals.ts

type ExecApprovalsDefaults = {
  security?: string; // "deny" | "allowlist" | "full"
  ask?: string; // "off" | "on-miss" | "always"
  askFallback?: string; // "deny" | "allowlist" | "full"
  autoAllowSkills?: boolean;
};

type ExecApprovalsAllowlistEntry = {
  id?: string;
  pattern: string;
  lastUsedAt?: number;
  lastUsedCommand?: string;
  lastResolvedPath?: string;
};

type ExecApprovalsAgent = ExecApprovalsDefaults & {
  allowlist?: ExecApprovalsAllowlistEntry[];
};

type ExecApprovalsFile = {
  version?: number;
  socket?: { path?: string };
  defaults?: ExecApprovalsDefaults;
  agents?: Record<string, ExecApprovalsAgent>;
};

type ExecApprovalsSnapshot = {
  path: string;
  exists: boolean;
  hash: string;
  file: ExecApprovalsFile;
};

type NodeInfo = {
  nodeId: string;
  displayName?: string;
  connected?: boolean;
};

const SECURITY_OPTIONS = [
  { value: "deny", label: "Deny" },
  { value: "allowlist", label: "Allowlist" },
  { value: "full", label: "Full" },
];

const ASK_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "on-miss", label: "On miss" },
  { value: "always", label: "Always" },
];

export function ExecApprovals() {
  const { sendRpc } = useGateway();
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snapshot, setSnapshot] = useState<ExecApprovalsSnapshot | null>(null);
  const [form, setForm] = useState<ExecApprovalsFile | null>(null);
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [target, setTarget] = useState<"gateway" | "node">("gateway");
  const [targetNodeId, setTargetNodeId] = useState<string>("");

  const [scope, setScope] = useState<string>("__defaults__");
  const [agents, setAgents] = useState<string[]>([]); // List of agent IDs

  const dirty = JSON.stringify(form) !== JSON.stringify(snapshot?.file);

  // Load basic data (Nodes, Config for Agents)
  useEffect(() => {
    if (!isConnected) return;

    // Fetch nodes to populate target selector
    sendRpc<{ nodes: NodeInfo[] }>("node.list", {})
      .then((res) => {
        setNodes(res.nodes || []);
        if (res.nodes && res.nodes.length > 0 && !targetNodeId) {
          setTargetNodeId(res.nodes[0].nodeId);
        }
      })
      .catch(() => {});

    // Fetch config to populate agents list
    // We assume agents are defined in config.agents.list or similar,
    // OR we just use what's in the approvals file + "main".
    // For now, let's just use "main" if not found.
    setAgents(["main"]);
  }, [isConnected, sendRpc, targetNodeId]);

  const loadApprovals = useCallback(async () => {
    setLoading(true);
    try {
      let method = "exec.approvals.get";
      let params = {};

      if (target === "node") {
        if (!targetNodeId) return; // Wait for node selection
        method = "exec.approvals.node.get";
        params = { nodeId: targetNodeId };
      }

      const res = await sendRpc<ExecApprovalsSnapshot>(method, params);
      setSnapshot(res);
      setForm(res.file);

      // Extract agents from file if any
      const fileAgents = Object.keys(res.file.agents || {});
      setAgents((prev) => Array.from(new Set([...prev, ...fileAgents])));
    } catch (e) {
      console.error("Failed to load approvals", e);
    } finally {
      setLoading(false);
    }
  }, [sendRpc, target, targetNodeId]);

  useEffect(() => {
    if (isConnected && (target === "gateway" || targetNodeId)) {
      loadApprovals();
    }
  }, [isConnected, loadApprovals, target, targetNodeId]);

  const handleSave = async () => {
    if (!form || !snapshot) return;
    setSaving(true);
    try {
      let method = "exec.approvals.set";
      let params: any = { file: form, baseHash: snapshot.hash };

      if (target === "node") {
        method = "exec.approvals.node.set";
        params = { ...params, nodeId: targetNodeId };
      }

      await sendRpc(method, params);
      await loadApprovals(); // Reload to get new hash
    } catch (e) {
      console.error("Failed to save approvals", e);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (path: string[], value: any) => {
    if (!form) return;
    const newForm = JSON.parse(JSON.stringify(form));

    // Helper to set deep value
    let current = newForm;
    for (let i = 0; i < path.length - 1; i++) {
      if (!current[path[i]]) current[path[i]] = {};
      current = current[path[i]];
    }

    // If setting to undefined/null, delete the key?
    // For overrides ("__default__"), we might want to delete the key from agent config.
    if (value === "__default__") {
      delete current[path[path.length - 1]];
    } else {
      current[path[path.length - 1]] = value;
    }

    setForm(newForm);
  };

  if (!isConnected) return null;

  const isDefaults = scope === "__defaults__";
  const defaults = form?.defaults || {};
  const agent = form?.agents?.[scope] || {};

  // Resolve effective values
  const getValue = (key: keyof ExecApprovalsDefaults) => {
    if (isDefaults) return defaults[key];
    return agent[key] ?? "__default__";
  };

  const getDisplayValue = (key: keyof ExecApprovalsDefaults) => {
    const val = getValue(key);
    if (val === "__default__") return defaults[key];
    return val;
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
            Exec Approvals
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Policy for{" "}
            <span className="font-mono">exec host={target === "gateway" ? "gateway" : "node"}</span>
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!dirty || saving || loading}
          className={cn(dirty && "animate-pulse")}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-2" />
          )}
          Save
        </Button>
      </div>

      {/* Targets */}
      <div className="flex items-center gap-4 border-b border-border/50 pb-4">
        <div className="flex-1 max-w-xs">
          <label className="text-xs font-mono text-muted-foreground block mb-1.5">Target</label>
          <div className="flex items-center gap-2">
            <select
              className="h-8 w-full rounded border border-input bg-transparent px-2 text-sm font-mono outline-none focus-visible:border-ring"
              value={target}
              onChange={(e) => setTarget(e.target.value as "gateway" | "node")}
            >
              <option value="gateway">Gateway</option>
              <option value="node">Node</option>
            </select>
            {target === "node" && (
              <select
                className="h-8 w-full rounded border border-input bg-transparent px-2 text-sm font-mono outline-none focus-visible:border-ring"
                value={targetNodeId}
                onChange={(e) => setTargetNodeId(e.target.value)}
              >
                {nodes.map((n) => (
                  <option key={n.nodeId} value={n.nodeId}>
                    {n.displayName || n.nodeId.substring(0, 8)}
                    {n.connected ? "" : " (offline)"}
                  </option>
                ))}
                {nodes.length === 0 && <option disabled>No nodes</option>}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Scopes */}
      <div className="space-y-3">
        <label className="text-xs font-mono text-muted-foreground block">Scope</label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={scope === "__defaults__" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setScope("__defaults__")}
            className="font-mono text-xs h-7"
          >
            Defaults
          </Button>
          {agents.map((agentId) => (
            <Button
              key={agentId}
              variant={scope === agentId ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setScope(agentId)}
              className="font-mono text-xs h-7"
            >
              {agentId}
            </Button>
          ))}
        </div>
      </div>

      {/* Form Fields */}
      <div className="space-y-4 pt-2">
        {/* Security Mode */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center rounded-md border border-border/50 p-3 bg-card/50">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Security Mode</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-6">
              {isDefaults
                ? "Default security enforcement."
                : `Default: ${defaults.security || "deny"}`}
            </p>
          </div>
          <select
            className="h-8 w-full rounded border border-input bg-background px-2 text-sm font-mono outline-none focus-visible:border-ring"
            value={getValue("security") as string}
            onChange={(e) =>
              updateField(
                isDefaults ? ["defaults", "security"] : ["agents", scope, "security"],
                e.target.value,
              )
            }
          >
            {!isDefaults && (
              <option value="__default__">Use default ({defaults.security || "deny"})</option>
            )}
            {SECURITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Ask Mode */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center rounded-md border border-border/50 p-3 bg-card/50">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Ask Policy</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-6">
              {isDefaults ? "When to prompt user." : `Default: ${defaults.ask || "on-miss"}`}
            </p>
          </div>
          <select
            className="h-8 w-full rounded border border-input bg-background px-2 text-sm font-mono outline-none focus-visible:border-ring"
            value={getValue("ask") as string}
            onChange={(e) =>
              updateField(
                isDefaults ? ["defaults", "ask"] : ["agents", scope, "ask"],
                e.target.value,
              )
            }
          >
            {!isDefaults && (
              <option value="__default__">Use default ({defaults.ask || "on-miss"})</option>
            )}
            {ASK_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Ask Fallback */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center rounded-md border border-border/50 p-3 bg-card/50">
          <div>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Ask Fallback</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-6">
              {isDefaults ? "If UI unavailable." : `Default: ${defaults.askFallback || "deny"}`}
            </p>
          </div>
          <select
            className="h-8 w-full rounded border border-input bg-background px-2 text-sm font-mono outline-none focus-visible:border-ring"
            value={getValue("askFallback") as string}
            onChange={(e) =>
              updateField(
                isDefaults ? ["defaults", "askFallback"] : ["agents", scope, "askFallback"],
                e.target.value,
              )
            }
          >
            {!isDefaults && (
              <option value="__default__">Use default ({defaults.askFallback || "deny"})</option>
            )}
            {SECURITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Auto Allow */}
        <div className="flex items-center justify-between rounded-md border border-border/50 p-3 bg-card/50">
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Auto-allow skill CLIs</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-6">
              Allow skill executables listed by the Gateway.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isDefaults && (
              <span className="text-xs text-muted-foreground mr-2">
                Deafult: {defaults.autoAllowSkills ? "On" : "Off"}
              </span>
            )}
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-ring"
              checked={
                isDefaults
                  ? (defaults.autoAllowSkills ?? false)
                  : agent.autoAllowSkills !== undefined
                    ? agent.autoAllowSkills
                    : (defaults.autoAllowSkills ?? false)
              }
              onChange={(e) => {
                const val = e.target.checked;
                updateField(
                  isDefaults
                    ? ["defaults", "autoAllowSkills"]
                    : ["agents", scope, "autoAllowSkills"],
                  val,
                );
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
