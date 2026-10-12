"use client";

/**
 * VersionHistoryDialog — gap #131 frontend.
 *
 * Lists `studio_project_versions` rows for the current project (autosaves
 * + manual snapshots). Restoring a version calls
 * `POST /projects/:id/versions/:vid/restore` and rehydrates the storyboard
 * via `onRestore` so StudioLayout re-renders without a page refresh.
 */

import { useEffect, useState } from "react";
import { Loader2, History, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  listProjectVersions,
  restoreProjectVersion,
  createProjectVersion,
  type ProjectVersionMeta,
} from "@/lib/services/studio-features-service";

interface Props {
  projectId: string | null;
  currentStoryboard: unknown;
  onRestore: (storyboard: unknown) => void;
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

export default function VersionHistoryDialog({ projectId, currentStoryboard, onRestore }: Props) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<ProjectVersionMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [snapping, setSnapping] = useState(false);

  useEffect(() => {
    if (!open || !projectId) return;
    setLoading(true);
    listProjectVersions(projectId)
      .then(setVersions)
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, [open, projectId]);

  async function handleRestore(versionId: string) {
    if (!projectId) return;
    setRestoringId(versionId);
    try {
      const result = await restoreProjectVersion(projectId, versionId);
      onRestore(result.storyboard);
      // Refresh list to show the new "restored from" entry
      const fresh = await listProjectVersions(projectId);
      setVersions(fresh);
    } finally {
      setRestoringId(null);
    }
  }

  async function handleSnapshot() {
    if (!projectId || !currentStoryboard) return;
    setSnapping(true);
    try {
      await createProjectVersion(projectId, currentStoryboard, { isAutosave: false, label: "manual snapshot" });
      const fresh = await listProjectVersions(projectId);
      setVersions(fresh);
    } finally {
      setSnapping(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={!projectId} title="Version history">
          <History className="w-3.5 h-3.5 mr-1" /> History
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Version History</DialogTitle>
          <DialogDescription>
            Autosaved every 30 seconds. 50 versions kept per project, 30-day retention.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end mb-2">
          <Button size="sm" variant="outline" onClick={handleSnapshot} disabled={snapping || !currentStoryboard}>
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
              No saved versions yet. Edits are autosaved 30 seconds after the last change.
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
                      {v.label} · {formatRelative(v.createdAt)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    disabled={restoringId === v.id}
                    onClick={() => handleRestore(v.id)}
                    title="Restore this version"
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
