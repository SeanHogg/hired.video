/**
 * EntityVideos — shared horizontal scroller showing the studio videos
 * linked to a given entity (a resume, profile, job, company, skills demo,
 * etc.) plus a `+ Create Video` chip that deep-links into the studio
 * with the subject pre-bound.
 *
 * Self-contained per the DRY rule:
 *   • Owns its own data fetch (`studioService.getProjects({ kind, id })`).
 *   • Owns the create-chip gate — given the entity's `ownerUserId`, it
 *     compares to the authenticated viewer and only renders the chip
 *     when they match. Anonymous viewers and authenticated non-owners
 *     never see it. Callers don't pass `viewerCanCreate` booleans.
 *   • Owns the URL formatting (`/studio?subject=kind:id&new=1`) via the
 *     shared `formatStudioSubject` helper.
 *
 * Drops into:
 *   • Resume card — `<EntityVideos subject={{ kind: "resume", id }} ownerUserId={resume.userId} />`
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
import { useApiReady } from "@/lib/auth";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import { useEntityOwnership } from "@/lib/use-entity-ownership";
import { cn } from "@/lib/utils";
import VideoProjectThumbnail from "./shared/VideoProjectThumbnail";
import UnpublishedEditsBadge from "./shared/UnpublishedEditsBadge";

interface EntityVideosProps {
  subject: StudioSubject;
  /** Owner of the entity (job poster, resume owner, profile user, company
   *  account owner, etc.). EntityVideos hands this to `useEntityOwnership`
   *  and only renders the `+ Create Video` chip when the auth'd viewer
   *  matches. Pass null/undef when there's no clear single owner — the
   *  chip stays hidden. */
  ownerUserId?: string | null;
  /** Wrapper className for callers that want to control margins / borders. */
  className?: string;
}

export default function EntityVideos({
  subject,
  ownerUserId,
  className,
}: EntityVideosProps) {
  const apiReady = useApiReady();
  const [videos, setVideos] = useState<StudioProject[] | null>(null);

  // Owner-only gate routed through the shared hook so this predicate
  // doesn't drift from the cards that wrap us. The studio API also
  // enforces ownership server-side, so bypassing this client check
  // still 403s.
  const { isOwner: viewerCanCreate } = useEntityOwnership({ ownerUserId });

  useEffect(() => {
    // The endpoint requires auth + a verified account; anonymous viewers on
    // public Job / Company / Profile cards (where this component mounts via
    // JobCard etc.) would otherwise fire a 401 on every render. Treat a
    // not-ready state as "no videos exist for this viewer".
    if (!apiReady) {
      setVideos([]);
      return;
    }
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
  }, [apiReady, subject.kind, subject.id]);

  // Hide the section entirely when the viewer can't create AND no videos
  // exist — there's nothing to render. Anonymous viewers (api-not-ready)
  // hit this branch automatically since the fetch above short-circuits
  // to an empty array for them.
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
          // Edit always opens the canonical /studio/<id> URL so the
          // editor sees the latest project state — not a stale baked
          // videoUrl that would serve old content.
          const openHref = `/studio?projectId=${encodeURIComponent(v.id)}`;
          return (
            <div
              key={v.id}
              className="snap-start shrink-0 w-48 rounded-md border bg-background hover:bg-muted/40 transition-colors flex flex-col"
            >
              {/* Thumbnail via the shared VideoProjectThumbnail — single
                  source of truth for project tiles, so the resume page
                  rail always matches the chooser grid. The component
                  renders the live first scene from `timelineSpec`,
                  bypassing the baked thumbnailUrl that goes stale on
                  every edit. */}
              <Link
                to={openHref}
                className="relative aspect-video rounded-t-md overflow-hidden group"
                title={v.title}
              >
                <VideoProjectThumbnail project={v} />
                {/* Self-gating — only the owner sees this when their
                    edits haven't been published yet. */}
                <UnpublishedEditsBadge
                  project={v}
                  className="absolute left-1.5 top-1.5 z-10"
                />
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Play className="w-6 h-6 text-white fill-white" />
                </div>
              </Link>
              <div className="flex items-center justify-between gap-1 p-2">
                <span className="text-xs font-medium truncate" title={v.title}>
                  {v.title}
                </span>
                <Link
                  to={openHref}
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
