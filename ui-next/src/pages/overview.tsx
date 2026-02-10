import {
  Radio,
  FileText,
  Timer,
  Shield,
  Activity,
  Server,
  Key,
  Layers,
  Hash,
  RefreshCw,
  Plug,
  Info,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { ConnectionStatus } from "@/components/ui/custom/status/connection-status";
import { StatCard } from "@/components/ui/custom/status/stat-card";
import { useGateway } from "@/hooks/use-gateway";
import { loadSettings, saveSettings } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway-store";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type CronStatusResult = {
  enabled: boolean;
  jobs: number;
  nextWakeAtMs?: number | null;
};

type SessionsListResult = {
  count: number;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ${minutes % 60}m`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function formatAgo(ms: number | null): string {
  if (!ms) {
    return "n/a";
  }
  const diff = Date.now() - ms;
  if (diff < 1000) {
    return "0s ago";
  }
  const secs = Math.floor(diff / 1000);
  if (secs < 60) {
    return `${secs}s ago`;
  }
  const mins = Math.floor(secs / 60);
  if (mins < 60) {
    return `${mins}m ago`;
  }
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function formatNextWake(ms: number | null | undefined): string {
  if (!ms) {
    return "n/a";
  }
  const diff = ms - Date.now();
  if (diff <= 0) {
    return "now";
  }
  const secs = Math.floor(diff / 1000);
  if (secs < 60) {
    return `${secs}s`;
  }
  const mins = Math.floor(secs / 60);
  if (mins < 60) {
    return `${mins}m`;
  }
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export function OverviewPage() {
  const { sendRpc } = useGateway();
  const connectionStatus = useGatewayStore((s) => s.connectionStatus);
  const hello = useGatewayStore((s) => s.hello);
  const presenceEntries = useGatewayStore((s) => s.presenceEntries);
  const lastError = useGatewayStore((s) => s.lastError);

  const isConnected = connectionStatus === "connected";
  const features = hello?.features;

  // --- Gateway Access form state ---
  const [settings, setSettings] = useState(() => loadSettings());
  const [password, setPassword] = useState(() => loadSettings().password);

  // --- Overview data ---
  const [sessionsCount, setSessionsCount] = useState<number | null>(null);
  const [cronStatus, setCronStatus] = useState<CronStatusResult | null>(null);
  const [channelsLastRefresh, setChannelsLastRefresh] = useState<number | null>(null);

  // --- Uptime timer ---
  const [connectedSince] = useState(() => Date.now());
  const [uptimeStr, setUptimeStr] = useState("0s");

  useEffect(() => {
    if (!isConnected) {
      return;
    }
    const update = () => setUptimeStr(formatUptime(Date.now() - connectedSince));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [isConnected, connectedSince]);

  // --- Load overview data on connect ---
  const loadOverviewData = useCallback(async () => {
    try {
      const [sessResult, cronResult] = await Promise.all([
        sendRpc<SessionsListResult>("sessions.list", { limit: 1 }).catch(() => null),
        sendRpc<CronStatusResult>("cron.status", {}).catch(() => null),
      ]);
      if (sessResult) {
        setSessionsCount(sessResult.count ?? null);
      }
      if (cronResult) {
        setCronStatus(cronResult);
      }
      setChannelsLastRefresh(Date.now());
    } catch {
      // silently fail
    }
  }, [sendRpc]);

  useEffect(() => {
    if (isConnected) {
      loadOverviewData();
    }
  }, [isConnected, loadOverviewData]);

  // --- Gateway Access handlers ---
  const handleConnect = () => {
    const next = { ...settings, password };
    saveSettings(next);
    window.location.reload();
  };

  const handleRefresh = () => {
    if (isConnected) {
      loadOverviewData();
    }
  };

  // --- Auth error detection ---
  const isAuthError =
    lastError &&
    (lastError.toLowerCase().includes("unauthorized") ||
      lastError.toLowerCase().includes("connect failed"));
  const isSecureContextError =
    lastError &&
    (lastError.toLowerCase().includes("secure context") ||
      lastError.toLowerCase().includes("device identity required")) &&
    location.protocol !== "https:";

  return (
    <div className="space-y-4 sm:space-y-6">
      <ConnectionStatus status={connectionStatus} protocol={hello?.protocol} error={lastError} />

      {/* Top row: Gateway Access + Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gateway Access */}
        <div className="rounded-lg bg-card border border-border p-4 sm:p-5">
          <h2 className="text-sm font-semibold mb-1">Gateway Access</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Where the dashboard connects and how it authenticates.
          </p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">WebSocket URL</label>
              <input
                type="text"
                className="w-full rounded-md border border-border bg-secondary/30 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="ws://127.0.0.1:18789"
                value={settings.gatewayUrl}
                onChange={(e) => setSettings({ ...settings, gatewayUrl: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Gateway Token</label>
              <input
                type="text"
                className="w-full rounded-md border border-border bg-secondary/30 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="OPENCLAW_GATEWAY_TOKEN"
                value={settings.token}
                onChange={(e) => setSettings({ ...settings, token: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Password (not stored)
              </label>
              <input
                type="password"
                className="w-full rounded-md border border-border bg-secondary/30 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="system or shared password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Default Session Key
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-border bg-secondary/30 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                value={settings.sessionKey}
                onChange={(e) => setSettings({ ...settings, sessionKey: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleConnect}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plug className="h-3.5 w-3.5" />
              Connect
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-1.5 text-sm font-medium hover:bg-secondary/50 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <span className="text-xs text-muted-foreground">
              Click Connect to apply connection changes.
            </span>
          </div>
        </div>

        {/* Snapshot */}
        <div className="rounded-lg bg-card border border-border p-4 sm:p-5">
          <h2 className="text-sm font-semibold mb-1">Snapshot</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Latest gateway handshake information.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="rounded-md border border-border p-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                Status
              </span>
              <span
                className={cn(
                  "text-lg font-semibold",
                  isConnected ? "text-primary" : "text-destructive",
                )}
              >
                {isConnected ? "Connected" : "Disconnected"}
              </span>
            </div>
            <div className="rounded-md border border-border p-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                Uptime
              </span>
              <span className="text-lg font-semibold">{isConnected ? uptimeStr : "n/a"}</span>
            </div>
            <div className="rounded-md border border-border p-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                Tick Interval
              </span>
              <span className="text-lg font-semibold">
                {hello?.policy?.tickIntervalMs
                  ? `${(hello.policy.tickIntervalMs / 1000).toFixed(0)}s`
                  : "n/a"}
              </span>
            </div>
            <div className="rounded-md border border-border p-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                Last Channels Refresh
              </span>
              <span className="text-lg font-semibold">{formatAgo(channelsLastRefresh)}</span>
            </div>
          </div>

          {/* Error / info callouts */}
          {isAuthError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-destructive font-medium">{lastError}</p>
                  {!settings.token.trim() && !password.trim() ? (
                    <p className="text-xs text-muted-foreground">
                      This gateway requires auth. Add a token or password, then click Connect.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Auth failed. Update the token or password, then click Connect.
                    </p>
                  )}
                  <a
                    href="https://docs.openclaw.ai/web/dashboard"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    Docs: Control UI auth
                  </a>
                </div>
              </div>
            </div>
          )}

          {isSecureContextError && (
            <div className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm mt-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    This page is HTTP, so the browser blocks device identity. Use HTTPS (Tailscale
                    Serve) or open http://127.0.0.1:18789 on the gateway host.
                  </p>
                  <div className="flex gap-3">
                    <a
                      href="https://docs.openclaw.ai/gateway/tailscale"
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      Docs: Tailscale Serve
                    </a>
                    <a
                      href="https://docs.openclaw.ai/web/control-ui#insecure-http"
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      Docs: Insecure HTTP
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!lastError && isConnected && (
            <div className="rounded-md border border-border bg-secondary/20 p-3 text-sm">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">
                  Use Channels to link WhatsApp, Telegram, Discord, Signal, or iMessage.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stat cards: Instances, Sessions, Cron */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
        <StatCard
          icon={<Radio className="w-4 h-4" />}
          label="Instances"
          value={isConnected ? String(presenceEntries.length) : "--"}
          subtitle="Presence beacons in the last 5 minutes."
        />
        <StatCard
          icon={<FileText className="w-4 h-4" />}
          label="Sessions"
          value={sessionsCount != null ? String(sessionsCount) : "n/a"}
          subtitle="Recent session keys tracked by the gateway."
        />
        <StatCard
          icon={<Timer className="w-4 h-4" />}
          label="Cron"
          value={cronStatus == null ? "n/a" : cronStatus.enabled ? "Enabled" : "Disabled"}
          subtitle={`Next wake ${formatNextWake(cronStatus?.nextWakeAtMs)}`}
        />
      </div>

      {/* Connection Details (trimmed) */}
      {isConnected && hello && (
        <div className="rounded-lg bg-card border border-border p-3 sm:p-5">
          <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-3 sm:mb-4">
            Connection Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
            <DetailRow icon={Server} label="Protocol" value={`v${hello.protocol}`} />
            <DetailRow icon={Activity} label="Uptime" value={uptimeStr} valueClass="text-primary" />
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

      {/* Notes */}
      <div className="rounded-lg bg-card border border-border p-4 sm:p-5">
        <h2 className="text-sm font-semibold mb-1">Notes</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Quick reminders for remote control setups.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <span className="text-sm font-medium block">Tailscale serve</span>
              <span className="text-xs text-muted-foreground">
                Prefer serve mode to keep the gateway on loopback with tailnet auth.
              </span>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <span className="text-sm font-medium block">Session hygiene</span>
              <span className="text-xs text-muted-foreground">
                Use /new or sessions.patch to reset context.
              </span>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <span className="text-sm font-medium block">Cron reminders</span>
              <span className="text-xs text-muted-foreground">
                Use isolated sessions for recurring runs.
              </span>
            </div>
          </div>
        </div>
      </div>

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
