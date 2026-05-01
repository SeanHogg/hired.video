/**
 * EntityVideos — shared horizontal scroller showing the studio videos
 * linked to a given entity (a resume, profile, job, company, skills demo,
 * etc.) plus a `+ Create Video` chip that deep-links into the studio
 * with the subject pre-bound.
 *
 * Self-contained per the DRY rule:
 *   • Owns its own data fetch (`studioService.getProjects({ kind, id })`).
 *   • Owns its visibility — returns null while loading the empty state
 *     ONLY if no `+ Create Video` chip should ever surface (i.e. when
 *     `viewerCanCreate` is false). Otherwise the chip is always shown so
 *     users can spawn a new video even when none exist yet.
 *   • Owns the URL formatting (`/studio?subject=kind:id&new=1`) via the
 *     shared `formatStudioSubject` helper.
 *
 * Drops into:
 *   • Resume card — `<EntityVideos subject={{ kind: "resume", id }} />`
 *   • Profile / Job / Company / Skills Demo cards — same shape.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Pencil, Play, Plus } from "lucide-react";
import {
  formatStudioSubject,
  STUDIO_SUBJECT_LABEL,
  type StudioSubject,
} from "@shared/studio-subject";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import { cn } from "@/lib/utils";

interface EntityVideosProps {
  subject: StudioSubject;
  /** When false, the `+ Create Video` chip is hidden. Used for surfaces
   *  where the viewer doesn't own the entity (e.g. someone else's profile
   *  page) — they can still see + watch existing videos but not author one. */
  viewerCanCreate?: boolean;
  /** Wrapper className for callers that want to control margins / borders. */
  className?: string;
}

export default function EntityVideos({
  subject,
  viewerCanCreate = true,
  className,
}: EntityVideosProps) {
  const [videos, setVideos] = useState<StudioProject[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setVideos(null);
    studioService
      .getProjects({ kind: subject.kind, id: subject.id })
      .then((res) => {
        if (cancelled) return;
        setVideos(res.data ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setVideos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [subject.kind, subject.id]);

  // Hide the section entirely on surfaces where the viewer can't create
  // AND no videos exist — there's nothing to render.
  if (!viewerCanCreate && (videos?.length ?? 0) === 0 && videos !== null) {
    return null;
  }

  const subjectLabel = STUDIO_SUBJECT_LABEL[subject.kind];
  const newVideoHref = `/studio?subject=${formatStudioSubject(subject)}&new=1`;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {videos?.length === 1
            ? "1 Video"
            : `${videos?.length ?? 0} Videos`}
        </h4>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
        {/* Create chip — first so it's always reachable, even when there's
            an empty list. Uses the same width/aspect as the video tiles
            below so the strip reads as one consistent rail. */}
        {viewerCanCreate && (
          <Link
            to={newVideoHref}
            className="snap-start shrink-0 w-48 rounded-md border-2 border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 transition-colors p-3 flex flex-col items-center justify-center gap-1.5 text-primary"
            title={`Create ${subjectLabel}`}
          >
            <div className="rounded-full bg-primary/10 p-1.5">
              <Plus className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium leading-tight text-center">
              Create {subjectLabel}
            </span>
          </Link>
        )}

        {videos === null && (
          <div className="snap-start shrink-0 w-48 rounded-md border bg-muted/30 p-3 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        )}

        {videos?.map((v) => {
          const editHref = `/studio?projectId=${encodeURIComponent(v.id)}`;
          const watchHref = v.videoUrl ?? editHref;
          return (
            <div
              key={v.id}
              className="snap-start shrink-0 w-48 rounded-md border bg-background hover:bg-muted/40 transition-colors flex flex-col"
            >
              {/* Thumbnail / play target. Falls back to a gradient if the
                  project hasn't been rendered yet. */}
              <Link
                to={watchHref}
                className="relative aspect-video rounded-t-md overflow-hidden bg-gradient-to-br from-brand-purple/30 to-brand-blue/30 group"
                title={v.title}
              >
                {v.thumbnailUrl ? (
                  <img
                    src={v.thumbnailUrl}
                    alt={v.title}
                    className="w-full h-full object-cover"
                  />
                ) : null}
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Play className="w-6 h-6 text-white fill-white" />
                </div>
              </Link>
              <div className="flex items-center justify-between gap-1 p-2">
                <span className="text-xs font-medium truncate" title={v.title}>
                  {v.title}
                </span>
                <Link
                  to={editHref}
                  className="shrink-0 p-0.5 rounded hover:text-primary text-muted-foreground transition-colors"
                  title="Edit in Studio"
                >
                  <Pencil className="w-3 h-3" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
