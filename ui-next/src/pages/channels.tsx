import {
  Link2,
  RotateCcw,
  LogOut,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useGateway } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway-store";

type ChannelAccount = {
  accountId: string;
  name?: string;
  enabled?: boolean;
  configured?: boolean;
  linked?: boolean;
  running?: boolean;
  connected?: boolean;
  lastError?: string | null;
  mode?: string;
  probe?: unknown;
  lastProbeAt?: number | null;
  bot?: { username?: string };
  [key: string]: unknown;
};

type ChannelInfo = {
  id: string;
  label: string;
  configured: boolean;
  accounts: ChannelAccount[];
  summary: Record<string, unknown>;
};

/** The actual shape returned by channels.status RPC */
type ChannelsStatusResponse = {
  channelOrder?: string[];
  channelLabels?: Record<string, string>;
  channels?: Record<string, unknown>;
  channelAccounts?: Record<string, ChannelAccount[]>;
  channelDefaultAccountId?: Record<string, string>;
};

const channelIcons: Record<string, string> = {
  whatsapp: "📱",
  telegram: "✈️",
  discord: "🎮",
  slack: "💬",
  signal: "🔒",
  imessage: "💬",
  web: "🌐",
  matrix: "🔗",
  msteams: "👥",
  voice: "🎙️",
  zalo: "💬",
};

/** Transform the Record-based RPC response into an array for rendering */
function transformResponse(result: ChannelsStatusResponse): ChannelInfo[] {
  const order = result.channelOrder ?? Object.keys(result.channels ?? {});
  const labels = result.channelLabels ?? {};
  const channelSummaries = result.channels ?? {};
  const accountsByChannel = result.channelAccounts ?? {};

  return order.map((id) => {
    const summary = (channelSummaries[id] ?? {}) as Record<string, unknown>;
    const accounts = Array.isArray(accountsByChannel[id]) ? accountsByChannel[id] : [];
    const hasConfigured = accounts.some((a) => a.configured);

    return {
      id,
      label: labels[id] ?? id,
      configured: hasConfigured || Boolean(summary.configured),
      accounts,
      summary,
    };
  });
}

function accountStatus(acc: ChannelAccount) {
  if (acc.connected || acc.running) {
    return { icon: CheckCircle2, color: "text-chart-2", bg: "bg-chart-2/10", label: "Connected" };
  }
  if (acc.lastError) {
    return { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10", label: "Error" };
  }
  if (acc.configured && acc.enabled !== false) {
    return { icon: AlertTriangle, color: "text-chart-5", bg: "bg-chart-5/10", label: "Configured" };
  }
  if (acc.enabled === false) {
    return { icon: XCircle, color: "text-muted-foreground", bg: "bg-muted/10", label: "Disabled" };
  }
  return { icon: XCircle, color: "text-muted-foreground", bg: "bg-muted/10", label: "Inactive" };
}

function channelStatus(ch: ChannelInfo) {
  if (!ch.configured) {
    return {
      icon: XCircle,
      color: "text-muted-foreground",
      bg: "bg-muted/10",
      label: "Not configured",
    };
  }
  const hasConnected = ch.accounts.some((a) => a.connected || a.running);
  if (hasConnected) {
    return { icon: CheckCircle2, color: "text-chart-2", bg: "bg-chart-2/10", label: "Active" };
  }
  const hasError = ch.accounts.some((a) => a.lastError);
  if (hasError) {
    return { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10", label: "Error" };
  }
  return { icon: AlertTriangle, color: "text-chart-5", bg: "bg-chart-5/10", label: "Configured" };
}

export function ChannelsPage() {
  const { sendRpc } = useGateway();
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [probing, setProbing] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState<string | null>(null);

  const loadChannels = useCallback(
    async (probe = false) => {
      if (probe) setProbing(true);
      else setLoading(true);
      try {
        const result = await sendRpc<ChannelsStatusResponse>("channels.status", {
          probe,
          timeoutMs: probe ? 15_000 : undefined,
        });
        if (result) {
          setChannels(transformResponse(result));
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
        setProbing(false);
      }
    },
    [sendRpc],
  );

  useEffect(() => {
    if (isConnected) loadChannels();
  }, [isConnected, loadChannels]);

  const handleLogout = useCallback(
    async (channel: string, accountId?: string) => {
      const key = `${channel}:${accountId ?? ""}`;
      setLogoutLoading(key);
      try {
        await sendRpc("channels.logout", { channel, accountId });
        await loadChannels();
      } finally {
        setLogoutLoading(null);
      }
    },
    [sendRpc, loadChannels],
  );

  const configuredChannels = channels.filter((c) => c.configured);
  const unconfiguredChannels = channels.filter((c) => !c.configured);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link2 className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-mono font-semibold">Channels</h1>
          <span className="text-xs font-mono text-muted-foreground">
            {configuredChannels.length} configured
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => loadChannels(true)} disabled={probing}>
            {probing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            {probing ? "Probing..." : "Probe All"}
          </Button>
        </div>
      </div>

      {!isConnected ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          <Link2 className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Connect to the gateway to view channels</p>
        </div>
      ) : (
        <>
          {/* Configured channels */}
          <div className="grid gap-4">
            {configuredChannels.map((ch) => {
              const status = channelStatus(ch);
              const StatusIcon = status.icon;
              return (
                <div
                  key={ch.id}
                  className="rounded-lg border border-border bg-card overflow-hidden"
                >
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
                    <span className="text-lg">{channelIcons[ch.id] ?? "📡"}</span>
                    <div className="flex-1">
                      <h3 className="text-sm font-mono font-semibold">{ch.label}</h3>
                    </div>
                    <div
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-mono",
                        status.bg,
                        status.color,
                      )}
                    >
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </div>
                  </div>

                  {ch.accounts.length > 0 ? (
                    <div className="divide-y divide-border/30">
                      {ch.accounts.map((acc, i) => {
                        const accSt = accountStatus(acc);
                        const AccIcon = accSt.icon;
                        const logoutKey = `${ch.id}:${acc.accountId}`;
                        const displayName =
                          acc.name ||
                          acc.bot?.username ||
                          (acc.accountId !== "default" ? acc.accountId : null) ||
                          "Default Account";

                        return (
                          <div
                            key={acc.accountId ?? i}
                            className="flex items-center gap-3 px-4 py-2.5"
                          >
                            <AccIcon className={cn("h-3.5 w-3.5 shrink-0", accSt.color)} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-mono truncate">{displayName}</span>
                                <span
                                  className={cn(
                                    "text-[10px] font-mono px-1.5 py-0.5 rounded",
                                    accSt.bg,
                                    accSt.color,
                                  )}
                                >
                                  {accSt.label}
                                </span>
                              </div>
                              {acc.lastError && (
                                <p className="text-xs text-destructive mt-0.5 truncate">
                                  {acc.lastError}
                                </p>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => handleLogout(ch.id, acc.accountId)}
                              disabled={logoutLoading === logoutKey}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <LogOut className="h-3 w-3" />
                              Logout
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-4 py-3 text-xs text-muted-foreground">
                      No accounts configured
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Unconfigured channels */}
          {unconfiguredChannels.length > 0 && (
            <div>
              <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-3">
                Available Channels
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {unconfiguredChannels.map((ch) => (
                  <div
                    key={ch.id}
                    className="rounded-lg border border-border/50 bg-card/50 px-4 py-3 flex items-center gap-3 opacity-50"
                  >
                    <span className="text-lg">{channelIcons[ch.id] ?? "📡"}</span>
                    <span className="text-sm font-mono">{ch.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {channels.length === 0 && !loading && (
            <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
              <Link2 className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No channel data available</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
