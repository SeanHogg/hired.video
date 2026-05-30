/**
 * #743 — Job-side picker for an existing Studio Project (recruiter
 * pitch / job-ad / company-promo video). Lists the caller's Studio
 * Projects filtered by `purpose` and writes the chosen project id to
 * `job_items.video_project_id`.
 *
 * Self-gates: returns null when the caller has no studio projects of
 * the relevant purposes — so the JobCreatePage doesn't have to know
 * whether the user has any video content to attach (DRY rule).
 */

import { useEffect, useState } from "react";
import { Video, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api-client";

interface StudioProject {
  id: string;
  title: string | null;
  purpose?: string | null;
  mediaKind?: string | null;
  thumbnailUrl?: string | null;
  durationSec?: number | null;
}

interface JobStudioVideoPickerFieldProps {
  value: string;
  onChange: (id: string | null) => void;
}

const JOB_PURPOSES = ["job_ad", "recruiter_brand", "company_promo"];

export default function JobStudioVideoPickerField({
  value,
  onChange,
}: JobStudioVideoPickerFieldProps) {
  const [projects, setProjects] = useState<StudioProject[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get("/api/studio/projects?mediaKind=video")
      .then((res) => {
        if (cancelled) return;
        const body = (res as any).data?.data ?? (res as any).data ?? {};
        const all = (body.items ?? body.projects ?? []) as StudioProject[];
        const filtered = all.filter((p) =>
          !p.purpose || JOB_PURPOSES.includes(p.purpose ?? ""),
        );
        setProjects(filtered);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return null;
  if (!projects || projects.length === 0) return null;

  const selected = projects.find((p) => p.id === value) ?? null;

  return (
    <div className="space-y-2">
      <Label>Video (Optional)</Label>
      {selected ? (
        <div className="flex items-center gap-3 rounded-md border p-2">
          {selected.thumbnailUrl ? (
            <img
              src={selected.thumbnailUrl}
              alt=""
              className="h-16 w-28 object-cover rounded"
            />
          ) : (
            <div className="h-16 w-28 rounded bg-muted flex items-center justify-center">
              <Video className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{selected.title ?? "Untitled video"}</div>
            <div className="text-xs text-muted-foreground capitalize">
              {selected.purpose ?? "video"}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(null)}
            aria-label="Remove video"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <Video className="h-4 w-4 mr-2" />
              Attach recruiter video
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Pick a Studio video</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange(p.id);
                    setDialogOpen(false);
                  }}
                  className="w-full flex items-center gap-3 rounded-md border p-2 text-left hover:bg-muted"
                >
                  {p.thumbnailUrl ? (
                    <img src={p.thumbnailUrl} alt="" className="h-14 w-24 object-cover rounded" />
                  ) : (
                    <div className="h-14 w-24 rounded bg-muted flex items-center justify-center">
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Video className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.title ?? "Untitled video"}</div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {p.purpose ?? "video"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
      <p className="text-xs text-muted-foreground">
        Attach a recruiter pitch or employer-brand video built in Studio. Shown on the job detail page.
      </p>
    </div>
  );
}
