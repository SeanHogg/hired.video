/**
 * #743 — Job-side picker for an existing Studio Project (recruiter pitch /
 * job-ad / company-promo video), written to `job_items.video_project_id`.
 * Restored from the retired JobCreatePage (#1915) into the studio's job
 * inspector; reads through `studioService` (no inline fetch) and is
 * localized.
 *
 * Self-gates: renders nothing when the viewer has no studio videos of a
 * job-relevant purpose, so the host never has to know.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { studioService, type StudioProject } from "@/lib/services/studio-service";

/** The video purposes a job can attach (unset purpose = a plain video). */
const JOB_PURPOSES: ReadonlySet<string> = new Set(["job_ad", "recruiter_brand", "company_promo"]);

export function isJobVideo(p: Pick<StudioProject, "mediaKind" | "purpose">): boolean {
  return (p.mediaKind ?? "video") === "video" && (!p.purpose || JOB_PURPOSES.has(p.purpose));
}

interface JobStudioVideoPickerFieldProps {
  value: string;
  onChange: (id: string) => void;
}

function Thumb({ project }: { project: StudioProject }) {
  return project.thumbnailUrl ? (
    <img src={project.thumbnailUrl} alt="" className="h-14 w-24 shrink-0 rounded object-cover" />
  ) : (
    <div className="flex h-14 w-24 shrink-0 items-center justify-center rounded bg-muted">
      <Video className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

export default function JobStudioVideoPickerField({ value, onChange }: JobStudioVideoPickerFieldProps) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<StudioProject[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    studioService
      .getProjects()
      .then((res) => !cancelled && setProjects((res.data ?? []).filter(isJobVideo)))
      .catch(() => !cancelled && setProjects([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!projects || projects.length === 0) return null;
  const selected = projects.find((p) => p.id === value) ?? null;

  return (
    <div className="space-y-2">
      <Label>{t("studio.jobInspector.video")}</Label>
      {selected ? (
        <div className="flex min-w-0 items-center gap-3 rounded-md border border-border p-2">
          <Thumb project={selected} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {selected.title || t("studio.jobInspector.untitledVideo")}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange("")}
            aria-label={t("studio.jobInspector.removeVideo")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="w-full justify-start">
              <Video className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("studio.jobInspector.attachVideo")}
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("studio.jobInspector.pickVideo")}</DialogTitle>
            </DialogHeader>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                  className="flex w-full min-w-0 items-center gap-3 rounded-md border border-border p-2 text-left hover:bg-muted"
                >
                  <Thumb project={p} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {p.title || t("studio.jobInspector.untitledVideo")}
                  </span>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
      <p className="text-xs text-muted-foreground">{t("studio.jobInspector.videoHint")}</p>
    </div>
  );
}
