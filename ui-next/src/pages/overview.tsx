import {
  Radio,
  MessageSquare,
  Link2,
  Zap,
  Clock,
  Brain,
  Image,
  Bot,
  Shield,
  Activity,
  Server,
  Key,
  Layers,
  Hash,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { ConnectionStatus } from "@/components/ui/custom/status/connection-status";
import { type ModelEntry } from "@/components/ui/custom/status/model-selector";
import { StatCard } from "@/components/ui/custom/status/stat-card";
import { useGateway } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway-store";

function formatContextWindow(tokens?: number): string {
  if (!tokens) return "";
  if (tokens >= 1_000_000)
    return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}k`;
  return String(tokens);
}

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

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/** Row in the connection details table */
function DetailRow({
  icon: Icon,
  label,
  value,
  valueClass,
}: {
  icon: typeof Server;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-secondary/20 transition-colors">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs font-mono text-muted-foreground w-28 shrink-0">{label}</span>
      <span className={cn("text-xs font-mono truncate", valueClass ?? "text-foreground")}>
        {value}
      </span>
    </div>
  );
}

export function OverviewPage() {
  const { sendRpc } = useGateway();
  const connectionStatus = useGatewayStore((s) => s.connectionStatus);
  const hello = useGatewayStore((s) => s.hello);
  const presenceEntries = useGatewayStore((s) => s.presenceEntries);
  const lastError = useGatewayStore((s) => s.lastError);

  const isConnected = connectionStatus === "connected";
  const features = hello?.features;

  const [models, setModels] = useState<ModelEntry[]>([]);
  const [connectedSince] = useState(() => Date.now());
  const [uptimeStr, setUptimeStr] = useState("0s");

  const loadModels = useCallback(async () => {
    try {
      const result = await sendRpc<{ models?: ModelEntry[] }>("models.list", {});
      setModels(result?.models ?? []);
    } catch {
      // silently fail
    }
  }, [sendRpc]);

  useEffect(() => {
    if (isConnected) loadModels();
  }, [isConnected, loadModels]);

  // Update uptime every second while connected
  useEffect(() => {
    if (!isConnected) return;
    const update = () => setUptimeStr(formatUptime(Date.now() - connectedSince));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [isConnected, connectedSince]);

  // Group models by provider
  const modelsByProvider = useMemo(() => {
    const groups: Record<string, ModelEntry[]> = {};
    for (const m of models) {
      const key = m.provider || "other";
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    }
    return groups;
  }, [models]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <ConnectionStatus status={connectionStatus} protocol={hello?.protocol} error={lastError} />

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
        <StatCard
          icon={<Radio className="w-4 h-4" />}
          label="Connected Clients"
          value={isConnected ? String(presenceEntries.length) : "--"}
          subtitle={isConnected ? "Active connections" : "Waiting for connection"}
        />
        <StatCard
          icon={<MessageSquare className="w-4 h-4" />}
          label="Methods"
          value={isConnected ? String(features?.methods?.length ?? 0) : "--"}
          subtitle={isConnected ? "Available RPC methods" : "Waiting for connection"}
        />
        <StatCard
          icon={<Link2 className="w-4 h-4" />}
          label="Events"
          value={isConnected ? String(features?.events?.length ?? 0) : "--"}
          subtitle={isConnected ? "Subscribed event types" : "Waiting for connection"}
        />
        <StatCard
          icon={<Zap className="w-4 h-4" />}
          label="Protocol"
          value={hello?.protocol ? `v${hello.protocol}` : "--"}
          subtitle={isConnected ? "Gateway protocol version" : "Waiting for connection"}
        />
        <StatCard
          icon={<Clock className="w-4 h-4" />}
          label="Tick Interval"
          value={
            hello?.policy?.tickIntervalMs
              ? `${(hello.policy.tickIntervalMs / 1000).toFixed(0)}s`
              : "--"
          }
          subtitle={isConnected ? "Heartbeat interval" : "Waiting for connection"}
        />
        <StatCard
          icon={<Bot className="w-4 h-4" />}
          label="Models"
          value={isConnected ? String(models.length) : "--"}
          subtitle={isConnected ? "Available AI models" : "Waiting for connection"}
        />
      </div>

      {/* Connection Details */}
      {isConnected && hello && (
        <div className="rounded-lg bg-card border border-border p-3 sm:p-5">
          <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-3 sm:mb-4">
            Connection Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
            <DetailRow icon={Server} label="Protocol" value={`v${hello.protocol}`} />
            <DetailRow icon={Activity} label="Uptime" value={uptimeStr} valueClass="text-primary" />
            <DetailRow
              icon={Clock}
              label="Heartbeat"
              value={
                hello.policy?.tickIntervalMs
                  ? `${(hello.policy.tickIntervalMs / 1000).toFixed(0)}s interval`
                  : "Not configured"
              }
            />
            <DetailRow
              icon={Shield}
              label="Auth Role"
              value={hello.auth?.role ?? "anonymous"}
              valueClass={hello.auth?.role ? "text-chart-2" : "text-muted-foreground"}
            />
            {hello.auth?.scopes && hello.auth.scopes.length > 0 && (
              <DetailRow icon={Key} label="Scopes" value={hello.auth.scopes.join(", ")} />
            )}
            <DetailRow
              icon={Layers}
              label="RPC Methods"
              value={`${features?.methods?.length ?? 0} available`}
            />
            <DetailRow
              icon={Hash}
              label="Event Types"
              value={features?.events?.join(", ") ?? "none"}
            />
          </div>
        </div>
      )}

      {/* Models */}
      {isConnected && models.length > 0 && (
        <div className="rounded-lg bg-card border border-border p-3 sm:p-5">
          <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-3 sm:mb-4">
            Available Models
          </h2>
          <div className="space-y-4">
            {Object.entries(modelsByProvider).map(([provider, providerModels]) => (
              <div key={provider}>
                <h3
                  className={cn(
                    "text-xs font-mono uppercase tracking-wider mb-2",
                    providerColor(provider),
                  )}
                >
                  {provider}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {providerModels.map((model) => (
                    <div
                      key={model.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary/30 hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-mono truncate">{model.name}</span>
                          {model.reasoning && (
                            <Brain className="h-3 w-3 text-chart-5 shrink-0" title="Reasoning" />
                          )}
                          {model.input?.includes("image") && (
                            <Image className="h-3 w-3 text-chart-2 shrink-0" title="Vision" />
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {model.id}
                        </span>
                      </div>
                      {model.contextWindow && (
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0 bg-secondary px-1.5 py-0.5 rounded">
                          {formatContextWindow(model.contextWindow)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Presence entries */}
      {isConnected && presenceEntries.length > 0 && (
        <div className="rounded-lg bg-card border border-border p-3 sm:p-5">
          <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-3 sm:mb-4">
            Connected Clients
          </h2>
          <div className="space-y-2">
            {presenceEntries.map((entry, i) => (
              <div
                key={entry.instanceId ?? i}
                className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 rounded-md bg-secondary/50"
              >
                <div className="w-2 h-2 rounded-full bg-primary animate-glow-pulse shrink-0" />
                <span className="text-xs sm:text-sm font-mono text-foreground truncate">
                  {entry.clientId ?? "unknown"}
                </span>
                {entry.mode && (
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    ({entry.mode})
                  </span>
                )}
                {entry.version && (
                  <span className="text-[10px] font-mono text-muted-foreground hidden md:inline">
                    v{entry.version}
                  </span>
                )}
                {entry.connectedAtMs && (
                  <span
                    className="text-[10px] font-mono text-muted-foreground hidden lg:inline"
                    title="Connected since"
                  >
                    {new Date(entry.connectedAtMs).toLocaleTimeString()}
                  </span>
                )}
                {entry.platform && (
                  <span className="text-xs text-muted-foreground ml-auto shrink-0">
                    {entry.platform}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disconnected state */}
      {!isConnected && (
        <div className="rounded-lg bg-card border border-border p-3 sm:p-5">
          <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-4">
            Connection
          </h2>
          <p className="text-sm text-muted-foreground">
            {connectionStatus === "connecting"
              ? "Connecting to gateway..."
              : "Not connected to gateway. The UI will automatically reconnect."}
          </p>
        </div>
      )}
    </div>
  );
}
