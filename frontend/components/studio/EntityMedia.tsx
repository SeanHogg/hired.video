/**
 * EntityMedia — shared horizontal scroller showing the studio projects
 * linked to a given entity (a resume, profile, job, company, skills demo,
 * etc.) plus a `+ Create <Subject Label>` chip that deep-links into the
 * studio with the subject pre-bound.
 *
 * Renamed from EntityVideos (#894 follow-up): the studio now produces
 * eight `mediaKind`s (video / podcast / voice / animation / game / comic
 * / image / cad) and any of them can be linked to any entity. The header
 * count now reads "X items" when the rail mixes kinds, or kind-pluralised
 * ("3 Games", "5 Reels") when uniform — never the hardcoded "X Videos".
 * Thumbnails are kind-dispatched via `<VideoProjectThumbnail>` (which
 * already routed by `mediaKind` long before this rename), so a Photoshop
 * tile reads as a drawing, a memory-match game as a game state, etc.
 *
 * Collapsed-by-default / expand-to-load (universal across every entity
 * card — resume / job / company / profile): the rail lives behind a single
 * toggle and the projects fetch is DEFERRED until the viewer expands it.
 * Mounting one EntityMedia per card on a grid (e.g. the People directory)
 * otherwise fired an N+1 of `/studio/projects/public` requests on page
 * load, most returning nothing for entities with no public media. The
 * fetch now costs zero until the viewer opts in.
 *
 * Self-contained per the DRY rule:
 *   • Owns its own data fetch. Owners hit the auth'd
 *     `studioService.getProjects({ kind, id })` so they see drafts +
 *     analytics + private projects; everyone else (non-owners +
 *     anonymous viewers on public cards) hits
 *     `studioService.getPublicProjects({ kind, id })` so they receive
 *     the owner's `isPublic=true` clips (#323).
 *   • Owns the create-chip gate — given the entity's `ownerUserId`, it
 *     compares to the authenticated viewer and only renders the chip
 *     when they match. Anonymous viewers and authenticated non-owners
 *     never see it. Callers don't pass `viewerCanCreate` booleans.
 *   • Owns the URL formatting — owners click the tile to jump to the
 *     editor (`/studio?projectId=…`); non-owners land on the public
 *     watch page (`/v/<projectId>`), which mounts `<ProjectPlayer>`
 *     and dispatches per mediaKind. Owners get the Edit pencil; non-
 *     owners don't.
 *   • Owns the kind-pluralised header label so callers don't reimplement
 *     "count items by kind" pluralisation per surface.
 *
 * Drops into:
 *   • Resume card — `<EntityMedia subject={{ kind: "resume", id }} ownerUserId={resume.userId} />`
 *   • Profile / Job / Company / Skills Demo / Article cards — same shape.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Loader2, Pencil, Play, Plus } from "lucide-react";
import {
  formatStudioSubject,
  STUDIO_SUBJECT_LABEL,
  type StudioSubject,
} from "@shared/studio-subject";
import { type MediaKind } from "@shared/media-kinds";
import { useApiReady } from "@/lib/auth";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import { useEntityOwnership } from "@/lib/use-entity-ownership";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import MediaKindBadge from "./shared/MediaKindBadge";
import VideoProjectThumbnail from "./shared/VideoProjectThumbnail";

interface EntityMediaProps {
  subject: StudioSubject;
  /** Owner of the entity (job poster, resume owner, profile user, company
   *  account owner, etc.). EntityMedia hands this to `useEntityOwnership`
   *  and only renders the `+ Create …` chip when the auth'd viewer
   *  matches. Pass null/undef when there's no clear single owner — the
   *  chip stays hidden. */
  ownerUserId?: string | null;
  /** Wrapper className for callers that want to control margins / borders. */
  className?: string;
}

export default function EntityMedia({
  subject,
  ownerUserId,
  className,
}: EntityMediaProps) {
  const apiReady = useApiReady();
  const [items, setItems] = useState<StudioProject[] | null>(null);
  // Collapsed by default — the projects fetch below is gated on this so a
  // closed panel costs zero API calls. This is universal across every
  // entity that mounts EntityMedia (resume / job / company / profile
  // cards): the rail lives behind an expand toggle so a grid of N cards
  // no longer fires an N+1 of `/studio/projects/public` requests, most of
  // which return nothing for entities with no public media.
  const [open, setOpen] = useState(false);

  // Owner-only gate routed through the shared hook so this predicate
  // doesn't drift from the cards that wrap us. The studio API also
  // enforces ownership server-side, so bypassing this client check
  // still 403s.
  const { isOwner: viewerCanCreate } = useEntityOwnership({ ownerUserId });

  useEffect(() => {
    // Lazy gate: we don't touch the network until the panel is expanded.
    // Leaving `items` at null keeps a closed panel in its "not yet loaded"
    // state (no loader, no request).
    if (!open) return;
    let cancelled = false;
    setItems(null);
    // Owners hit the auth'd `/projects` endpoint so they see drafts,
    // analytics, and private projects too. Everyone else (incl. anon
    // viewers on public listing pages — #323) hits `/projects/public`
    // so they receive the owner's public clips. The owner branch waits
    // for `apiReady` because the auth'd endpoint 401s without a token;
    // the public branch fires immediately since it accepts anonymous.
    const fetcher = viewerCanCreate
      ? apiReady
        ? studioService.getProjects({ kind: subject.kind, id: subject.id })
        : null
      : studioService.getPublicProjects({ kind: subject.kind, id: subject.id });
    if (!fetcher) {
      setItems([]);
      return;
    }
    fetcher
      .then((res) => {
        if (cancelled) return;
        // Drop `document`-kind projects: a canvas document IS the entity
        // itself (the resume / article authored on the document canvas),
        // not a media attachment, so it must never show in the attachments
        // rail. Without this the resume's own studio document rendered as a
        // bogus "Document" tile alongside real videos/images.
        setItems((res.data ?? []).filter((p) => p.mediaKind !== "document"));
      })
      .catch(() => {
        if (cancelled) return;
        setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [apiReady, viewerCanCreate, subject.kind, subject.id, open]);

  // Header reads "X items" — fully kind-agnostic so a rail with one
  // video doesn't claim "1 Video" when the very next attachment might
  // be a Photoshop drawing or a game. Per-tile `<MediaKindBadge>`
  // overlays already convey kind for each item; the rail header is
  // a count, not a taxonomy label.
  const headerLabel = itemsHeaderLabel(items);

  const subjectLabel = STUDIO_SUBJECT_LABEL[subject.kind];
  const newItemHref = `/studio?subject=${formatStudioSubject(subject)}&new=1`;
  // Collapsed trigger can't show a count (we haven't fetched yet), so it
  // names the subject; once expanded + loaded it switches to the live
  // "X items" count.
  const triggerLabel = items === null ? `${subjectLabel} media` : headerLabel;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn("space-y-2", className)}
    >
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors">
        <span>{triggerLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
        {/* Create chip — first so it's always reachable, even when there's
            an empty list. Uses the same width/aspect as the tiles below
            so the strip reads as one consistent rail. */}
        {viewerCanCreate && (
          <Link
            to={newItemHref}
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

        {items === null && (
          <div className="snap-start shrink-0 w-48 rounded-md border bg-muted/30 p-3 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        )}

        {/* Expanded + loaded + empty + can't create — nothing to show but
            the panel is already open, so say so rather than render a blank
            rail. Owners always see the Create chip above instead. */}
        {items !== null && items.length === 0 && !viewerCanCreate && (
          <p className="text-xs text-muted-foreground py-2">No media yet.</p>
        )}

        {items?.map((v) => {
          // Owners click the tile to jump into the editor (the canonical
          // /studio/<id> URL so the editor sees the latest project state,
          // not a stale baked videoUrl). Non-owners — incl. anonymous
          // viewers on public listing pages — land on the public watch
          // page at /v/<id>, which mounts <ProjectPlayer> and dispatches
          // per mediaKind (so a Photoshop drawing renders as an image,
          // a memory-match game as a game, etc. — #323).
          const openHref = viewerCanCreate
            ? `/studio?projectId=${encodeURIComponent(v.id)}`
            : `/v/${encodeURIComponent(v.id)}`;
          const itemKind = (v.mediaKind ?? "video") as MediaKind;
          return (
            <div
              key={v.id}
              className="snap-start shrink-0 w-48 rounded-md border bg-background hover:bg-muted/40 transition-colors flex flex-col"
            >
              {/* Thumbnail via the shared VideoProjectThumbnail — single
                  source of truth for project tiles, so the entity rail
                  always matches the chooser grid. The component dispatches
                  on mediaKind (game state preview / first drawn layer /
                  first animation frame / live Timeline scene), bypassing
                  the baked thumbnailUrl that goes stale on every edit.
                  MediaKindBadge self-gates: a "Video" chip is suppressed,
                  every other kind surfaces so the rail visibly mixes. */}
              <Link
                to={openHref}
                className="relative aspect-video rounded-t-md overflow-hidden group"
                title={v.title}
              >
                <VideoProjectThumbnail project={v} />
                <MediaKindBadge
                  mediaKind={itemKind}
                  className="absolute top-1 left-1"
                />
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Play className="w-6 h-6 text-white fill-white" />
                </div>
              </Link>
              <div className="flex items-center justify-between gap-1 p-2">
                <span className="text-xs font-medium truncate" title={v.title}>
                  {v.title}
                </span>
                {viewerCanCreate && (
                  <Link
                    to={openHref}
                    className="shrink-0 p-0.5 rounded hover:text-primary text-muted-foreground transition-colors"
                    title="Edit in Studio"
                  >
                    <Pencil className="w-3 h-3" />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Header label — always "X items" regardless of the kind mix. The
 *  studio is multi-kind now (a resume may link a video + a Photoshop
 *  drawing + a podcast), so the rail counts attachments without
 *  taxonomising them; the per-tile `<MediaKindBadge>` carries kind
 *  for each individual item. Exported so a future test can lock this
 *  in without exporting the whole component shape. */
export function itemsHeaderLabel(items: StudioProject[] | null): string {
  const count = items?.length ?? 0;
  return `${count} item${count === 1 ? "" : "s"}`;
}
