/**
 * StorageManagement — SuperAdmin R2 inspection + cleanup tools.
 *
 * Two tabs:
 *   • Usage by user — sorted-by-bytes leaderboard, plus a grand total.
 *   • Orphaned objects — keys that exist in R2 but have no row in `videos`,
 *     each row with a delete button so admins can claw back stranded
 *     storage.
 *
 * Both feeds come from /api/admin/r2/* — see admin-r2.ts. The backend
 * enforces SuperAdmin via shared middleware so the page itself doesn't
 * gate any actions; AdminLayout already drops users without read on the
 * `storage` resource.
 */

import { useEffect, useState, useCallback } from "react";
import { Loader2, Trash2, RefreshCw, AlertTriangle, HardDrive, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (view === "usage") {
        setUsage(await adminStorageService.getUsage());
      } else {
        setOrphans(await adminStorageService.getOrphans());
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

  async function handleDelete(key: string, sizeBytes: number) {
    if (!window.confirm(`Delete this R2 object? It frees ${formatBytes(sizeBytes)} and cannot be undone.`)) return;
    setDeletingKey(key);
    try {
      const res = await adminStorageService.deleteObject(key);
      // Pop the row out of the local state so the UI updates without
      // waiting for a refetch.
      setOrphans((prev) =>
        prev
          ? {
              ...prev,
              orphans: prev.orphans.filter((o) => o.key !== key),
              orphanCount: prev.orphanCount - 1,
              totalOrphanBytes: prev.totalOrphanBytes - res.freedBytes,
            }
          : prev,
      );
      toast({ title: "Deleted", description: `Freed ${formatBytes(res.freedBytes)}.` });
    } catch (e) {
      toast({ title: "Delete failed", description: String(e), variant: "destructive" });
    } finally {
      setDeletingKey(null);
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
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
          deletingKey={deletingKey}
          onDelete={handleDelete}
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
      <div className="grid grid-cols-3 gap-4 mb-4">
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
            <TableRow key={row.userId ?? "other"}>
              <TableCell className="font-mono text-xs">
                {row.name || row.email || (
                  <span className="text-muted-foreground italic">{row.userId ?? "uncategorized"}</span>
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
  deletingKey,
  onDelete,
}: {
  orphans: Orphans;
  deletingKey: string | null;
  onDelete: (key: string, size: number) => void;
}) {
  if (orphans.orphanCount === 0) {
    return (
      <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-6 text-center">
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          No orphaned objects — every R2 key has a matching `videos` row.
        </p>
      </div>
    );
  }

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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>R2 key</TableHead>
            <TableHead className="text-right">Size</TableHead>
            <TableHead className="text-right">Uploaded</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orphans.orphans.map((o) => (
            <TableRow key={o.key}>
              <TableCell className="font-mono text-[11px] break-all">{o.key}</TableCell>
              <TableCell className="text-right font-mono text-xs">{formatBytes(o.size)}</TableCell>
              <TableCell className="text-right font-mono text-[10px] text-muted-foreground">
                {new Date(o.uploaded).toLocaleString()}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-destructive hover:text-destructive"
                  disabled={deletingKey === o.key}
                  onClick={() => onDelete(o.key, o.size)}
                >
                  {deletingKey === o.key ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
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
