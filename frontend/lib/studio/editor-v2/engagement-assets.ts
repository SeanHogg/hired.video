/**
 * Engagement asset registry — single source of truth for "what kinds
 * of per-project authored engagement artifacts can be embedded as a
 * draggable widget on the v2 canvas?"
 *
 * Mirrors `LINKED_CONTENT_REGISTRY`'s shape, but is **project-scoped**
 * instead of user-scoped: every artifact (form, chapter, thumbnail,
 * review thread) belongs to a single studio project, not to the
 * authoring user's library. `listForProject(projectId)` is the seam
 * the palette section uses to enumerate the active project's assets.
 *
 * Adding a new engagement kind (NPS prompt, CTA poll, etc.) is one
 * entry here + one inline-body component under
 * `components/studio/v2/inline-bodies/`. No `WidgetKind` change, no
 * drag-protocol change, no canvas drop-handler change.
 *
 * Closes the orphan-binding half of [[project_gap_register]] #1579 —
 * authored engagement artifacts now have a canvas presence rather than
 * existing only as server-side rows the viewer never sees.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { ClipboardList, Image as ImageIcon, ListOrdered, MessageCircle } from "lucide-react";

import {
  listVideoForms,
  getChapters,
  listThumbnails,
  getProjectComments,
} from "@/lib/services/studio-features-service";

// Per-kind inline body components are lazy-loaded — each body pulls
// in renderer dependencies (form-field UI, thumbnail image loader,
// comment-thread formatter) we don't want on every page that imports
// this registry (e.g. the drag protocol shared across studio surfaces).
const VideoFormInlineBody = lazy(
  () => import("@/components/studio/v2/inline-bodies/VideoFormInlineBody"),
);
const ChapterMarkerInlineBody = lazy(
  () => import("@/components/studio/v2/inline-bodies/ChapterMarkerInlineBody"),
);
const ThumbnailStampInlineBody = lazy(
  () => import("@/components/studio/v2/inline-bodies/ThumbnailStampInlineBody"),
);
const ReviewPinInlineBody = lazy(
  () => import("@/components/studio/v2/inline-bodies/ReviewPinInlineBody"),
);

/** Engagement artifact kinds that can be embedded on the v2 canvas.
 *  Adding a new kind = one entry in `ENGAGEMENT_ASSET_REGISTRY` + one
 *  component under `components/studio/v2/inline-bodies/`. */
export type EngagementAssetKind =
  | "video-form"
  | "chapter-marker"
  | "thumbnail-stamp"
  | "review-pin";

/** Tile metadata for the palette section (one row per asset attached
 *  to the active project). Same shape pattern as
 *  `LinkedContentSummary`, but the registry's `listForProject` is the
 *  source instead of user-scoped `listForUser`. */
export interface EngagementAssetSummary {
  kind: EngagementAssetKind;
  id: string;
  title: string;
  /** Secondary line — e.g. `@5.0s · 2 fields` for forms, `@0:23` for
   *  chapter markers. Optional. */
  subtitle?: string;
}

interface EngagementAssetMeta {
  /** Singular display label ("Form", "Chapter", …). */
  label: string;
  /** Palette section heading ("Your forms", "Your chapters", …). */
  sectionLabel: string;
  /** Lucide icon used in the palette tile + empty-state body. */
  icon: ComponentType<{ className?: string }>;
  /** List the assets attached to the active project. Errors are
   *  swallowed by the caller — the section just renders the empty
   *  state with a "create one from the dialogs below" hint. */
  listForProject: (projectId: string) => Promise<EngagementAssetSummary[]>;
  /** Lazy-loaded canvas body — renders a card preview of the bound
   *  artifact (form fields summary, chapter timestamp + thumbnail,
   *  thumbnail variant image, top reviewer comment). Owns its own
   *  fetch + loading / error states; the outer EngagementAssetBody
   *  just provides the chrome (bg colour, drag-select target) so
   *  adding a new kind is one lazy import here + one component file. */
  InlineBody: LazyExoticComponent<
    ComponentType<{ projectId: string; assetId: string }>
  >;
}

export const ENGAGEMENT_ASSET_REGISTRY: Record<EngagementAssetKind, EngagementAssetMeta> = {
  "video-form": {
    label: "Form",
    sectionLabel: "Your forms",
    icon: ClipboardList,
    listForProject: async (projectId) => {
      const forms = await listVideoForms(projectId).catch(() => []);
      return forms.map((f) => ({
        kind: "video-form" as const,
        id: f.id,
        title: f.title || "Untitled form",
        subtitle: `@${f.positionSeconds.toFixed(1)}s · ${f.fields.length} field${
          f.fields.length === 1 ? "" : "s"
        }${f.requireToContinue ? " · gated" : ""}`,
      }));
    },
    InlineBody: VideoFormInlineBody,
  },
  "chapter-marker": {
    label: "Chapter",
    sectionLabel: "Your chapters",
    icon: ListOrdered,
    listForProject: async (projectId) => {
      const chapters = await getChapters(projectId).catch(() => []);
      return chapters
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((c) => ({
          kind: "chapter-marker" as const,
          id: c.id,
          title: c.title || "Untitled chapter",
          subtitle: `@${c.startSeconds.toFixed(1)}s`,
        }));
    },
    InlineBody: ChapterMarkerInlineBody,
  },
  "thumbnail-stamp": {
    label: "Thumbnail",
    sectionLabel: "Your thumbnails",
    icon: ImageIcon,
    listForProject: async (projectId) => {
      const thumbnails = await listThumbnails(projectId).catch(() => []);
      return thumbnails.map((t) => ({
        kind: "thumbnail-stamp" as const,
        id: t.id,
        title: t.headlineText || (t.isSelected ? "Live thumbnail" : "Thumbnail variant"),
        subtitle: [
          t.isSelected ? "LIVE" : null,
          t.score != null ? `score ${t.score.toFixed(2)}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
      }));
    },
    InlineBody: ThumbnailStampInlineBody,
  },
  "review-pin": {
    label: "Review pin",
    sectionLabel: "Your review threads",
    icon: MessageCircle,
    listForProject: async (projectId) => {
      const comments = await getProjectComments(projectId).catch(() => []);
      // Group by top-level comment (parentId === null). Each top-level
      // is one pin; the InlineBody renders the thread.
      const roots = comments.filter((c) => c.parentId === null);
      return roots.map((c) => ({
        kind: "review-pin" as const,
        id: c.id,
        title: c.body.slice(0, 60) || "(empty comment)",
        subtitle: [
          c.authorName,
          c.timestampSec != null ? `@${c.timestampSec.toFixed(1)}s` : null,
          c.resolved ? "resolved" : "open",
        ]
          .filter(Boolean)
          .join(" · "),
      }));
    },
    InlineBody: ReviewPinInlineBody,
  },
};

/** Every kind registered above. Drives the palette section ordering +
 *  the inspector's "switch kind" picker (when shipped). */
export const ENGAGEMENT_ASSET_KINDS = Object.keys(
  ENGAGEMENT_ASSET_REGISTRY,
) as EngagementAssetKind[];

const REF_SEPARATOR = ":";

/** Pack `(kind, id)` into a single dataTransfer payload string. Mirrors
 *  `encodeLinkedContentRef`'s `kind:id` shape so the drag-protocol
 *  layer stays a flat `data: string` channel. */
export function encodeEngagementAssetRef(
  kind: EngagementAssetKind,
  id: string,
): string {
  return `${kind}${REF_SEPARATOR}${id}`;
}

export function parseEngagementAssetRef(
  ref: string,
): { kind: EngagementAssetKind; id: string } | null {
  const idx = ref.indexOf(REF_SEPARATOR);
  if (idx <= 0) return null;
  const kind = ref.slice(0, idx);
  const id = ref.slice(idx + 1);
  if (!id) return null;
  if (!isEngagementAssetKind(kind)) return null;
  return { kind, id };
}

export function isEngagementAssetKind(value: string): value is EngagementAssetKind {
  return Object.prototype.hasOwnProperty.call(ENGAGEMENT_ASSET_REGISTRY, value);
}

export function getEngagementAssetMeta(kind: EngagementAssetKind): EngagementAssetMeta {
  return ENGAGEMENT_ASSET_REGISTRY[kind];
}

/** Conservative card colour fallback when no theme stamping is
 *  applied. Same warm-ivory + indigo accent we use for linked-content
 *  cards so the two card families read as siblings on the canvas. */
export interface EngagementAssetColors {
  bgColor: string;
  textColor: string;
  accentColor: string;
  accentTextColor: string;
}

export const DEFAULT_ENGAGEMENT_ASSET_COLORS: EngagementAssetColors = {
  bgColor: "#ffffff",
  textColor: "#0f172a",
  accentColor: "#4f46e5",
  accentTextColor: "#ffffff",
};
