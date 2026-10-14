/**
 * Inline-body registry — the DOM half of the linked-content and
 * engagement-asset registries. `lib/studio/editor-v2/linked-content` and
 * `lib/studio/editor-v2/engagement-assets` own the per-kind metadata
 * (labels, icons, fetchers); lib/ never imports components/, so the
 * per-kind React body that renders the entity inside the canvas widget
 * lives here, keyed by the same kind union.
 *
 * Each body is lazy-loaded — it pulls in a heavy renderer
 * (DeclarativeResumeRenderer / DeclarativeJobRenderer / Markdown / form
 * field UI / thumbnail loader …) we only want when a card actually mounts.
 *
 * `Record<Kind, …>` keeps both maps exhaustive: adding a kind to either
 * lib registry fails typecheck here until its body exists.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { LinkedContentKind } from "@/lib/studio/editor-v2/linked-content";
import type { EngagementAssetKind } from "@/lib/studio/editor-v2/engagement-assets";

/** Renders a linked entity using its OWN renderer (e.g.
 *  `<DeclarativeResumeRenderer/>` for resumes) so the embedded card looks
 *  like a thumbnail of the entity's published page. Owns its own fetch +
 *  loading / error states; `LinkedContentBody` provides the chrome. */
export const LINKED_CONTENT_BODIES: Record<
  LinkedContentKind,
  LazyExoticComponent<ComponentType<{ id: string }>>
> = {
  resume: lazy(() => import("./ResumeInlineBody")),
  job: lazy(() => import("./JobInlineBody")),
  article: lazy(() => import("./ArticleInlineBody")),
  profile: lazy(() => import("./ProfileInlineBody")),
  company: lazy(() => import("./CompanyInlineBody")),
  video: lazy(() => import("./VideoInlineBody")),
  template: lazy(() => import("./TemplateInlineBody")),
};

/** Renders a card preview of a bound engagement artifact (form fields
 *  summary, chapter timestamp, thumbnail variant, top reviewer comment).
 *  Owns its own fetch + loading / error states; `EngagementAssetBody`
 *  provides the chrome. */
export const ENGAGEMENT_ASSET_BODIES: Record<
  EngagementAssetKind,
  LazyExoticComponent<ComponentType<{ projectId: string; assetId: string }>>
> = {
  "video-form": lazy(() => import("./VideoFormInlineBody")),
  "chapter-marker": lazy(() => import("./ChapterMarkerInlineBody")),
  "thumbnail-stamp": lazy(() => import("./ThumbnailStampInlineBody")),
  "review-pin": lazy(() => import("./ReviewPinInlineBody")),
};
