"use client";

/**
 * EntityVersionHistoryDialog — shared "Version History" dialog used by
 * Studio projects (#131) and Resumes (#155). Both surfaces back a snapshots
 * table with the same shape (versionNumber, label, isAutosave, createdAt),
 * so the UI is identical; only the API URLs differ. The caller hands over
 * a `VersionHistoryAdapter` that wraps its own REST endpoints, plus the
 * current in-memory document so "Snapshot now" can write the right blob.
 *
 * Extracted in #155 — replaces a near-duplicate of the studio dialog that
 * was about to be copy-pasted into the resume editor.
 */

import { useEffect, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export interface VersionMeta {
  id: string;
  versionNumber: number;
  label: string | null;
  isAutosave: boolean;
  createdAt: string;
}

export interface VersionHistoryAdapter {
  /** List all snapshots for the parent entity, newest first. */
  list: () => Promise<VersionMeta[]>;
  /** Restore the named snapshot into the live entity. Resolves once the
   *  parent component has rehydrated state. */
  restore: (versionId: string) => Promise<void>;
  /** Write a manual snapshot of the current in-memory document. */
  snapshot: () => Promise<void>;
}

interface Props {
  /** Controlled open state — host owns it so the trigger can live in
   *  whichever menu / button it likes. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Friendly noun for dialog copy: "Resume", "Project", etc. */
  entityLabel: string;
  adapter: VersionHistoryAdapter;
  /** When false (e.g. the live document is empty), Snapshot is disabled. */
  canSnapshot?: boolean;
  /** Retention copy. Studio + resumes share 50-cap / 30-day; surfaced so
   *  the copy stays in lockstep with the server enforcement. */
  retentionHint?: string;
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function EntityVersionHistoryDialog({
  open,
  onOpenChange,
  entityLabel,
  adapter,
  canSnapshot = true,
  retentionHint = "Autosaved every 30 seconds. 50 versions kept, 30-day retention on autosaves.",
}: Props) {
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [snapping, setSnapping] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    adapter
      .list()
      .then(setVersions)
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, [open, adapter]);

  async function handleRestore(versionId: string) {
    setRestoringId(versionId);
    try {
      await adapter.restore(versionId);
      const fresh = await adapter.list();
      setVersions(fresh);
    } finally {
      setRestoringId(null);
    }
  }

  async function handleSnapshot() {
    setSnapping(true);
    try {
      await adapter.snapshot();
      const fresh = await adapter.list();
      setVersions(fresh);
    } finally {
      setSnapping(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Version History</DialogTitle>
          <DialogDescription>{retentionHint}</DialogDescription>
        </DialogHeader>

        <div className="flex justify-end mb-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSnapshot}
            disabled={snapping || !canSnapshot}
          >
            {snapping ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Snapshot now
          </Button>
        </div>

        <div className="max-h-[420px] overflow-y-auto -mx-2">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              No saved versions of this {entityLabel.toLowerCase()} yet. Edits
              are autosaved 30 seconds after the last change.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 px-2">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono">v{v.versionNumber}</span>
                      {v.isAutosave ? (
                        <Badge variant="outline" className="h-4 px-1 text-[9px]">auto</Badge>
                      ) : (
                        <Badge className="h-4 px-1 text-[9px]">manual</Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {v.label ?? (v.isAutosave ? "autosave" : "snapshot")} ·{" "}
                      {formatRelative(v.createdAt)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    disabled={restoringId === v.id}
                    onClick={() => handleRestore(v.id)}
                    title={`Restore this ${entityLabel.toLowerCase()} version`}
                  >
                    {restoringId === v.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <>
                        <RotateCcw className="w-3 h-3 mr-1" /> Restore
                      </>
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
