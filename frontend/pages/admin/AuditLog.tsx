import React, { useState, useEffect, useCallback } from "react";
import { Search, RefreshCw, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiClient } from "@/lib/api-client";

type Severity = "info" | "warning" | "critical";

interface AuditLogEntry {
  id: string;
  actorId: string;
  impersonationSessionId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditResponse {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

const SEVERITY_STYLES: Record<Severity, string> = {
  info:     "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  warning:  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

// Derive severity from action type
function getSeverity(action: string): Severity {
  if (action.includes("SUSPENDED") || action.includes("DELETED")) return "critical";
  if (action.includes("IMPERSONATION") || action.includes("ROLE_CHANGED") || action.includes("STATUS_CHANGED") || action.includes("UPDATED")) return "warning";
  return "info";
}

function formatDetails(entry: AuditLogEntry): string {
  const meta = entry.metadata;
  if (!meta) return "";
  const parts: string[] = [];
  if (meta.fromRole && meta.toRole) parts.push(`Role: ${meta.fromRole} → ${meta.toRole}`);
  if (meta.status) parts.push(`Status: ${meta.status}`);
  if (meta.name) parts.push(`Name: ${meta.name}`);
  if (meta.moduleName) parts.push(`Module: ${meta.moduleName}`);
  if (meta.endReason) parts.push(`Reason: ${meta.endReason}`);
  if (meta.requiredRole) parts.push(`Required role: ${meta.requiredRole}`);
  return parts.join(", ") || JSON.stringify(meta);
}

export default function AuditLog() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const limit = 50;

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));

      const res = await apiClient.get<AuditResponse>(
        `/api/admin/impersonate/audit?${params.toString()}`
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  // Client-side filtering (search + action)
  const filtered = logs.filter((e) => {
    const matchSearch = !search || [
      e.action,
      e.actorId,
      e.targetId ?? "",
      e.targetType ?? "",
      formatDetails(e),
    ].some(s => s.toLowerCase().includes(search.toLowerCase()));
    const matchAction = actionFilter === "all" || e.action === actionFilter;
    return matchSearch && matchAction;
  });

  // Collect unique actions for the filter dropdown
  const uniqueActions = Array.from(new Set(logs.map(e => e.action))).sort();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-muted-foreground text-sm">Complete history of platform events and admin actions.</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={loadLogs} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search action, actor, or target..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); }}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="All Actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {uniqueActions.map((a) => (
              <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Error */}
      {error && (
        <div className="text-center text-destructive py-4">
          {error}
          <Button variant="ghost" size="sm" className="ml-2" onClick={loadLogs}>Retry</Button>
        </div>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                  Loading audit log...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No log entries found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((entry) => {
                const severity = getSeverity(entry.action);
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap font-mono">
                      {new Date(entry.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <p className="text-xs text-muted-foreground font-mono truncate max-w-[140px]" title={entry.actorId}>
                        {entry.actorId.slice(0, 8)}...
                      </p>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {entry.action}
                      </code>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {entry.targetType && <span className="text-xs opacity-60">{entry.targetType}: </span>}
                      <span className="font-mono text-xs truncate max-w-[120px] inline-block align-bottom" title={entry.targetId ?? ""}>
                        {entry.targetId ? `${entry.targetId.slice(0, 8)}...` : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize ${SEVERITY_STYLES[severity]}`}>
                        {severity}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate" title={formatDetails(entry)}>
                      {formatDetails(entry)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({total} entries)
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
