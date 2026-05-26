/**
 * StorageManagement — SuperAdmin R2 inspection + cleanup tools.
 *
 * Two tabs:
 *   • Usage by user — sorted-by-bytes leaderboard, plus a grand total.
 *   • Orphaned objects — keys with no owning DB row AND no live user. Each
 *     row gets a checkbox; the column header has a select-all checkbox.
 *     A single bulk-delete button drives both individual + multi-row deletes
 *     so there's only one delete code path to reason about.
 *
 * Both feeds come from /api/admin/r2/* — see admin-r2.ts. The backend
 * enforces SuperAdmin via shared middleware so the page itself doesn't
 * gate any actions; AdminLayout already drops users without read on the
 * `storage` resource.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { Loader2, Trash2, RefreshCw, AlertTriangle, HardDrive, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import {
  adminStorageService,
  type Usage,
  type Orphans,
} from "@/lib/services/admin-storage-service";

type ViewTab = "usage" | "orphans";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function StorageManagement() {
  const { toast } = useToast();
  const [view, setView] = useState<ViewTab>("usage");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [orphans, setOrphans] = useState<Orphans | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (view === "usage") {
        setUsage(await adminStorageService.getUsage());
      } else {
        setOrphans(await adminStorageService.getOrphans());
        setSelectedKeys(new Set());
      }
    } catch (e) {
      toast({ title: "Load failed", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [view, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const deleteKeys = useCallback(async (keys: string[]) => {
    if (keys.length === 0) return;
    const sizeBytes = orphans
      ? orphans.orphans.filter((o) => keys.includes(o.key)).reduce((a, o) => a + o.size, 0)
      : 0;
    const noun = keys.length === 1 ? "this object" : `${keys.length} objects`;
    if (!window.confirm(`Delete ${noun}? It frees ${formatBytes(sizeBytes)} and cannot be undone.`)) return;
    setBulkBusy(true);
    try {
      const res = await adminStorageService.bulkDeleteObjects(keys);
      const deletedSet = new Set(res.results.filter((r) => r.deleted).map((r) => r.key));
      setOrphans((prev) =>
        prev
          ? {
              ...prev,
              orphans: prev.orphans.filter((o) => !deletedSet.has(o.key)),
              orphanCount: prev.orphanCount - res.deletedCount,
              totalOrphanBytes: prev.totalOrphanBytes - res.totalFreedBytes,
            }
          : prev,
      );
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        for (const k of deletedSet) next.delete(k);
        return next;
      });
      const failed = res.requested - res.deletedCount;
      toast({
        title: `Deleted ${res.deletedCount} of ${res.requested}`,
        description: failed
          ? `Freed ${formatBytes(res.totalFreedBytes)}. ${failed} failed — see console for keys.`
          : `Freed ${formatBytes(res.totalFreedBytes)}.`,
        variant: failed ? "destructive" : "default",
      });
      if (failed) console.warn("[storage] bulk-delete partial failures:", res.results.filter((r) => !r.deleted));
    } catch (e) {
      toast({ title: "Delete failed", description: String(e), variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  }, [orphans, toast]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <HardDrive className="w-5 h-5" /> R2 storage
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inspect what each user is storing and delete orphaned objects to claw back space.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex gap-1 mb-4 border-b">
        <TabButton active={view === "usage"} onClick={() => setView("usage")} icon={Users}>
          Usage by user
        </TabButton>
        <TabButton active={view === "orphans"} onClick={() => setView("orphans")} icon={AlertTriangle}>
          Orphaned objects {orphans ? <Badge variant="destructive" className="ml-1.5 text-[10px]">{orphans.orphanCount}</Badge> : null}
        </TabButton>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      )}

      {!loading && view === "usage" && usage && (
        <UsageTab usage={usage} />
      )}

      {!loading && view === "orphans" && orphans && (
        <OrphansTab
          orphans={orphans}
          selectedKeys={selectedKeys}
          onSelectionChange={setSelectedKeys}
          bulkBusy={bulkBusy}
          onDelete={deleteKeys}
        />
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, children }: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 transition-colors ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
      onClick={onClick}
    >
      <Icon className="w-4 h-4" />
      {children}
    </button>
  );
}

function UsageTab({ usage }: { usage: Usage }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <SummaryCard label="Total bytes" value={formatBytes(usage.totalBytes)} />
        <SummaryCard label="Objects" value={usage.objectCount.toLocaleString()} />
        <SummaryCard label="Users with storage" value={usage.breakdown.length.toString()} />
      </div>
      {usage.truncated && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Showing the first {usage.objectCount.toLocaleString()} objects. Increase `?limit=` to see more.
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead className="text-right">Objects</TableHead>
            <TableHead className="text-right">Bytes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {usage.breakdown.map((row) => (
            <TableRow key={`${row.bucketKind ?? "user"}:${row.userId ?? "n/a"}`}>
              <TableCell className="font-mono text-xs">
                {row.name || row.email || (
                  <span className="text-muted-foreground italic">
                    {row.bucketKind === "shared"
                      ? "shared (stock library)"
                      : row.bucketKind === "other"
                        ? "unrecognised key prefix"
                        : row.userId ?? "uncategorized"}
                  </span>
                )}
                {row.email && row.name && (
                  <span className="text-muted-foreground ml-2">{row.email}</span>
                )}
              </TableCell>
              <TableCell className="text-right font-mono text-xs">{row.objectCount.toLocaleString()}</TableCell>
              <TableCell className="text-right font-mono text-xs">{formatBytes(row.bytes)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}

function OrphansTab({
  orphans,
  selectedKeys,
  onSelectionChange,
  bulkBusy,
  onDelete,
}: {
  orphans: Orphans;
  selectedKeys: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
  bulkBusy: boolean;
  onDelete: (keys: string[]) => void;
}) {
  if (orphans.orphanCount === 0) {
    return (
      <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-6 text-center">
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          No orphaned objects — every R2 key has a live owning user or DB row.
        </p>
      </div>
    );
  }

  const allKeys = orphans.orphans.map((o) => o.key);
  const allChecked = selectedKeys.size > 0 && selectedKeys.size === allKeys.length;
  const someChecked = selectedKeys.size > 0 && !allChecked;
  const headerState: boolean | "indeterminate" = allChecked ? true : someChecked ? "indeterminate" : false;
  // When the DB-key UNION failed for any table, the orphan list is provably
  // incomplete — bulk delete is gated until the underlying drift is resolved.
  // Per-row delete stays open so admins can still reclaim keys they've
  // sanity-checked individually.
  const bulkBlocked = !!(orphans.dbErrors && orphans.dbErrors.length > 0);

  const selectedBytes = useMemo(
    () => orphans.orphans.filter((o) => selectedKeys.has(o.key)).reduce((a, o) => a + o.size, 0),
    [orphans.orphans, selectedKeys],
  );

  const toggleAll = (next: boolean | "indeterminate") => {
    onSelectionChange(next === true ? new Set(allKeys) : new Set());
  };

  const toggleRow = (key: string, next: boolean | "indeterminate") => {
    const copy = new Set(selectedKeys);
    if (next === true) copy.add(key); else copy.delete(key);
    onSelectionChange(copy);
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <SummaryCard label="Orphaned objects" value={orphans.orphanCount.toLocaleString()} />
        <SummaryCard label="Reclaimable bytes" value={formatBytes(orphans.totalOrphanBytes)} />
      </div>
      {orphans.truncated && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Showing the first batch of orphans. Re-run after deleting to load more.
        </div>
      )}
      {orphans.dbErrors && orphans.dbErrors.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive mb-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium mb-1">
              Orphan list may be incomplete — {orphans.dbErrors.length} R2-key {orphans.dbErrors.length === 1 ? "column" : "columns"} failed to load.
              Do NOT bulk-delete until resolved.
            </p>
            <ul className="list-disc list-inside font-mono text-[10px] opacity-80">
              {orphans.dbErrors.map((e) => (
                <li key={e.label}>
                  <span className="font-semibold">{e.label}</span>: {e.error}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-2 gap-2">
        <p className="text-xs text-muted-foreground">
          {bulkBlocked
            ? "Bulk delete disabled while DB-key tables are missing — per-row delete still available for keys you've sanity-checked."
            : selectedKeys.size > 0
              ? `${selectedKeys.size} selected · ${formatBytes(selectedBytes)}`
              : "Select rows to delete, or use the trash icon to delete one."}
        </p>
        <Button
          variant="destructive"
          size="sm"
          disabled={selectedKeys.size === 0 || bulkBusy || bulkBlocked}
          onClick={() => onDelete(Array.from(selectedKeys))}
        >
          {bulkBusy ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
          )}
          Delete selected
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <Checkbox
                aria-label="Select all orphans"
                checked={headerState}
                onCheckedChange={toggleAll}
                disabled={bulkBusy}
              />
            </TableHead>
            <TableHead>R2 key</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="text-right">Size</TableHead>
            <TableHead className="text-right">Uploaded</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orphans.orphans.map((o) => (
            <TableRow key={o.key} data-selected={selectedKeys.has(o.key) || undefined}>
              <TableCell>
                <Checkbox
                  aria-label={`Select ${o.key}`}
                  checked={selectedKeys.has(o.key)}
                  onCheckedChange={(v) => toggleRow(o.key, v)}
                  disabled={bulkBusy}
                />
              </TableCell>
              <TableCell className="font-mono text-[11px] break-all">{o.key}</TableCell>
              <TableCell className="text-[11px] text-muted-foreground">{o.reason ?? "—"}</TableCell>
              <TableCell className="text-right font-mono text-xs">{formatBytes(o.size)}</TableCell>
              <TableCell className="text-right font-mono text-[10px] text-muted-foreground">
                {new Date(o.uploaded).toLocaleString()}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-destructive hover:text-destructive"
                  disabled={bulkBusy}
                  onClick={() => onDelete([o.key])}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold mt-1 font-mono">{value}</p>
    </div>
  );
}
