import { FileText, RotateCcw, Trash2, Archive, Search, MessageSquare } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/custom/data";
import { useGateway } from "@/hooks/use-gateway";
import { useGatewayStore } from "@/store/gateway-store";

type SessionEntry = {
  key: string;
  agentId?: string;
  model?: string;
  thinkingLevel?: string;
  derivedTitle?: string;
  lastMessage?: string;
  lastActivityMs?: number;
  messageCount?: number;
  createdMs?: number;
};

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function SessionsPage() {
  const { sendRpc } = useGateway();
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const result = await sendRpc<{ entries?: SessionEntry[] }>("sessions.list", {
        includeDerivedTitles: true,
        includeLastMessage: true,
      });
      setSessions(result?.entries ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [sendRpc]);

  useEffect(() => {
    if (isConnected) loadSessions();
  }, [isConnected, loadSessions]);

  const handleReset = useCallback(
    async (key: string) => {
      setActionLoading(key);
      try {
        await sendRpc("sessions.reset", { key });
        await loadSessions();
      } finally {
        setActionLoading(null);
      }
    },
    [sendRpc, loadSessions],
  );

  const handleDelete = useCallback(
    async (key: string) => {
      setActionLoading(key);
      try {
        await sendRpc("sessions.delete", { key });
        await loadSessions();
      } finally {
        setActionLoading(null);
      }
    },
    [sendRpc, loadSessions],
  );

  const handleCompact = useCallback(
    async (key: string) => {
      setActionLoading(key);
      try {
        await sendRpc("sessions.compact", { key });
        await loadSessions();
      } finally {
        setActionLoading(null);
      }
    },
    [sendRpc, loadSessions],
  );

  const filtered = search
    ? sessions.filter(
        (s) =>
          s.key.toLowerCase().includes(search.toLowerCase()) ||
          s.derivedTitle?.toLowerCase().includes(search.toLowerCase()),
      )
    : sessions;

  const columns: Column<SessionEntry>[] = [
    {
      key: "key",
      header: "Session",
      sortable: true,
      render: (row) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-sm">{row.derivedTitle || row.key}</span>
          {row.derivedTitle && (
            <span className="text-[11px] text-muted-foreground font-mono">{row.key}</span>
          )}
        </div>
      ),
    },
    {
      key: "model",
      header: "Model",
      sortable: true,
      className: "w-40 hidden md:table-cell",
      render: (row) => (
        <span className="text-xs font-mono text-muted-foreground">{row.model ?? "—"}</span>
      ),
    },
    {
      key: "thinkingLevel",
      header: "Thinking",
      className: "w-24 hidden lg:table-cell",
      render: (row) => (
        <span className="text-xs font-mono text-muted-foreground">{row.thinkingLevel ?? "—"}</span>
      ),
    },
    {
      key: "lastActivityMs",
      header: "Last Active",
      sortable: true,
      className: "w-28 hidden sm:table-cell",
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.lastActivityMs ? formatRelativeTime(row.lastActivityMs) : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-28",
      render: (row) => (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              handleReset(row.key);
            }}
            disabled={actionLoading === row.key}
            title="Reset session"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              handleCompact(row.key);
            }}
            disabled={actionLoading === row.key}
            title="Compact transcript"
          >
            <Archive className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(row.key);
            }}
            disabled={actionLoading === row.key}
            title="Delete session"
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-mono font-semibold">Sessions</h1>
          <span className="text-xs font-mono text-muted-foreground">{sessions.length} total</span>
        </div>
        <Button variant="outline" size="sm" onClick={loadSessions} disabled={loading}>
          <RotateCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search sessions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full max-w-sm rounded-md border border-input bg-transparent pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] placeholder:text-muted-foreground"
        />
      </div>

      {!isConnected ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Connect to the gateway to view sessions</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyField="key"
          emptyMessage={search ? "No matching sessions" : "No sessions found"}
          className="[&_tr]:group"
        />
      )}
    </div>
  );
}
