import {
  Radio,
  RotateCcw,
  Loader2,
  Monitor,
  Smartphone,
  Globe,
  Server,
  Clock,
  Wifi,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useGateway } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway-store";

type PresenceEntry = {
  host?: string | null;
  ip?: string | null;
  instanceId?: string | null;
  deviceId?: string | null;
  clientId?: string | null;
  platform?: string | null;
  deviceFamily?: string | null;
  modelIdentifier?: string | null;
  version?: string | null;
  mode?: string | null;
  reason?: string | null;
  lastInputSeconds?: number | null;
  roles?: Array<string | null> | null;
  scopes?: Array<string | null> | null;
  text?: string | null;
  ts?: number | null;
  connectedAtMs?: number | null;
  [key: string]: unknown;
};

function formatAge(ts?: number | null): string {
  if (!ts) return "n/a";
  const diff = Date.now() - ts;
  if (diff < 0) return "just now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatLastInput(seconds?: number | null): string {
  if (seconds == null) return "n/a";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function deviceIcon(entry: PresenceEntry) {
  const family = (entry.deviceFamily ?? "").toLowerCase();
  const platform = (entry.platform ?? "").toLowerCase();
  const mode = (entry.mode ?? "").toLowerCase();

  if (mode === "gateway" || mode === "self") return Server;
  if (family.includes("phone") || family.includes("iphone") || family.includes("android"))
    return Smartphone;
  if (mode === "webchat" || mode === "web") return Globe;
  return Monitor;
}

function presenceSummary(entry: PresenceEntry): string {
  const parts: string[] = [];
  if (entry.host) parts.push(entry.host);
  if (entry.ip) parts.push(`(${entry.ip})`);
  if (entry.mode) parts.push(entry.mode);
  if (entry.version) parts.push(`v${entry.version}`);
  return parts.join(" ") || "Unknown instance";
}

export function InstancesPage() {
  const { sendRpc } = useGateway();
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");
  const storePresence = useGatewayStore((s) => s.presenceEntries);

  const [entries, setEntries] = useState<PresenceEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const loadPresence = useCallback(async () => {
    setLoading(true);
    setLastError(null);
    try {
      const result = await sendRpc<PresenceEntry[] | { presence?: PresenceEntry[] }>(
        "system-presence",
        {},
      );
      const list = Array.isArray(result) ? result : (result?.presence ?? []);
      setEntries(list);
    } catch (e) {
      setLastError((e as Error).message);
      // Fall back to store presence if RPC fails
      setEntries(storePresence as PresenceEntry[]);
    } finally {
      setLoading(false);
    }
  }, [sendRpc, storePresence]);

  useEffect(() => {
    if (isConnected) {
      loadPresence();
    }
  }, [isConnected, loadPresence]);

  // Also update from store when presence events arrive
  useEffect(() => {
    if (storePresence.length > 0 && entries.length === 0) {
      setEntries(storePresence as PresenceEntry[]);
    }
  }, [storePresence, entries.length]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-4">
        <div className="flex items-center gap-3">
          <Radio className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Instances</h1>
            <p className="text-xs text-muted-foreground">
              Presence beacons from the gateway and connected clients
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {entries.length > 0 && (
            <span className="text-xs font-mono text-muted-foreground">
              {entries.length} instance{entries.length !== 1 ? "s" : ""}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={loadPresence} disabled={loading}>
            <RotateCcw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {lastError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 text-destructive px-4 py-3 text-sm mb-4">
          {lastError}
        </div>
      )}

      {/* Content */}
      {!isConnected ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          <Radio className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Connect to the gateway to view instances</p>
        </div>
      ) : loading && entries.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          <Wifi className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No instances reported yet</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-3">
          {entries.map((entry, i) => {
            const Icon = deviceIcon(entry);
            const roles = (entry.roles ?? []).filter(Boolean) as string[];
            const scopes = (entry.scopes ?? []).filter(Boolean) as string[];
            const scopesLabel =
              scopes.length > 3
                ? `${scopes.length} scopes`
                : scopes.length > 0
                  ? scopes.join(", ")
                  : null;

            return (
              <div
                key={entry.instanceId ?? entry.clientId ?? i}
                className="rounded-lg border border-border bg-card p-4 space-y-3"
              >
                {/* Top row: icon + host + meta */}
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-2 rounded-md bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {entry.host ?? entry.clientId ?? "Unknown"}
                      </span>
                      <div className="w-2 h-2 rounded-full bg-chart-2 shrink-0" />
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {presenceSummary(entry)}
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatAge(entry.ts ?? entry.connectedAtMs)}
                    </div>
                    {entry.lastInputSeconds != null && (
                      <p className="text-[10px] text-muted-foreground">
                        Last input: {formatLastInput(entry.lastInputSeconds)}
                      </p>
                    )}
                    {entry.reason && (
                      <p className="text-[10px] text-muted-foreground">{entry.reason}</p>
                    )}
                  </div>
                </div>

                {/* Chips row */}
                <div className="flex flex-wrap gap-1.5">
                  {entry.mode && <Chip>{entry.mode}</Chip>}
                  {roles.map((role) => (
                    <Chip key={role} variant="role">
                      {role}
                    </Chip>
                  ))}
                  {scopesLabel && <Chip variant="scope">{scopesLabel}</Chip>}
                  {entry.platform && <Chip variant="info">{entry.platform}</Chip>}
                  {entry.deviceFamily && <Chip variant="info">{entry.deviceFamily}</Chip>}
                  {entry.modelIdentifier && <Chip variant="info">{entry.modelIdentifier}</Chip>}
                  {entry.version && <Chip variant="info">v{entry.version}</Chip>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Small chip/badge component for instance metadata */
function Chip({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "role" | "scope" | "info";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        variant === "default" && "bg-primary/10 text-primary",
        variant === "role" && "bg-chart-4/10 text-chart-4",
        variant === "scope" && "bg-chart-5/10 text-chart-5",
        variant === "info" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
