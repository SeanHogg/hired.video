/**
 * Load ONE bound engagement artifact (form, chapter, thumbnail, review
 * thread) by kind + id — the single fetch behind both the canvas card
 * (components/studio/v2/inline-bodies/*InlineBody) and the playback
 * overlay (components/video/EngagementZonesOverlay).
 *
 * Two sources, chosen in one place (`useEngagementAudience`):
 *   • owner  — the per-kind owner listings, one react-query entry per
 *              (kind, project): a card on the stage and its playback
 *              control cost one request, not two;
 *   • public — ONE react-query entry per project for the public read
 *              (`getPublicEngagementAssets`), shared by every kind, so a
 *              signed-out viewer costs one request per project, not three.
 *              Review threads are never public: a review pin resolves to
 *              null there and renders nothing interactive.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { EngagementAssetKind } from "@/lib/studio/editor-v2/engagement-assets";
import {
  getChapters,
  getProjectComments,
  getPublicEngagementAssets,
  listThumbnails,
  listVideoForms,
  type PublicEngagementAssets,
  type PublicThumbnail,
  type PublicVideoForm,
  type ReviewComment,
  type VideoChapter,
} from "@/lib/services/studio-features-service";
import { useEngagementAudience } from "./engagement-audience";

export type LoadedEngagementAsset =
  | { kind: "video-form"; form: PublicVideoForm }
  | { kind: "chapter-marker"; chapter: VideoChapter }
  | { kind: "thumbnail-stamp"; thumbnail: PublicThumbnail }
  | { kind: "review-pin"; root: ReviewComment; replies: ReviewComment[] };

/** The viewer-safe shape of each kind — the owner listings return
 *  supersets of these, so both sources feed the same consumers. */
interface RowsByKind {
  "video-form": PublicVideoForm[];
  "chapter-marker": VideoChapter[];
  "thumbnail-stamp": PublicThumbnail[];
  "review-pin": ReviewComment[];
}
type RowsOf<K extends EngagementAssetKind> = RowsByKind[K];
type ProjectRows = RowsByKind[EngagementAssetKind];

/** A form playback may show. The owner listing also returns inactive forms
 *  (the editor's card says "turned off" for them); the submit route 404s
 *  those, so PLAYBACK treats them as unavailable, matching the public read
 *  (whose rows carry no flag — they are all active). */
export function isPlayableForm(form: { isActive?: boolean }): boolean {
  return form.isActive !== false;
}

const OWNER_LIST_FOR_KIND: { [K in EngagementAssetKind]: (projectId: string) => Promise<RowsByKind[K]> } = {
  "video-form": listVideoForms,
  "chapter-marker": getChapters,
  "thumbnail-stamp": listThumbnails,
  "review-pin": getProjectComments,
};

/** Where each kind sits in the public payload; null = never public. */
const PUBLIC_ROWS_FOR_KIND: {
  [K in EngagementAssetKind]: ((assets: PublicEngagementAssets) => RowsByKind[K]) | null;
} = {
  "video-form": (assets) => assets.forms,
  "chapter-marker": (assets) => assets.chapters,
  "thumbnail-stamp": (assets) => assets.thumbnails,
  "review-pin": null,
};

/** Pick the bound artifact out of its project listing (pure). Null when
 *  the id isn't in the listing (deleted / not visible to this viewer). */
export function selectEngagementAsset(
  kind: EngagementAssetKind,
  rows: ProjectRows,
  assetId: string,
): LoadedEngagementAsset | null {
  switch (kind) {
    case "video-form": {
      const form = (rows as PublicVideoForm[]).find((f) => f.id === assetId);
      return form ? { kind, form } : null;
    }
    case "chapter-marker": {
      const chapter = (rows as VideoChapter[]).find((c) => c.id === assetId);
      return chapter ? { kind, chapter } : null;
    }
    case "thumbnail-stamp": {
      const thumbnail = (rows as PublicThumbnail[]).find((t) => t.id === assetId);
      return thumbnail ? { kind, thumbnail } : null;
    }
    case "review-pin": {
      const comments = rows as ReviewComment[];
      const root = comments.find((c) => c.id === assetId);
      if (!root) return null;
      return { kind, root, replies: comments.filter((c) => c.parentId === root.id) };
    }
  }
}

export const engagementAssetQueryKey = (kind: EngagementAssetKind, projectId: string) =>
  ["studio-engagement-assets", kind, projectId] as const;

/** The one public-read entry per project, shared by every kind. */
export const publicEngagementQueryKey = (projectId: string) =>
  ["studio-engagement-public", projectId] as const;

const STALE_MS = 60_000;

/** One project's listing for `kind` — the shared query every engagement
 *  consumer reads. `undefined` while loading (or while auth bootstraps),
 *  `null` when disabled, failed, or not visible to this audience (a
 *  private project, a review pin on a public surface). */
export function useEngagementAssetRows<K extends EngagementAssetKind>(
  kind: K,
  projectId: string | null | undefined,
  enabled = true,
): RowsOf<K> | null | undefined {
  const audience = useEngagementAudience();
  const on = enabled && !!projectId;
  const pickPublic = PUBLIC_ROWS_FOR_KIND[kind] as ((assets: PublicEngagementAssets) => RowsOf<K>) | null;

  const owner = useQuery({
    queryKey: engagementAssetQueryKey(kind, projectId ?? ""),
    queryFn: () => OWNER_LIST_FOR_KIND[kind](projectId as string) as Promise<RowsOf<K>>,
    enabled: on && audience === "owner",
    staleTime: STALE_MS,
    retry: false,
  });
  const pub = useQuery({
    queryKey: publicEngagementQueryKey(projectId ?? ""),
    queryFn: () => getPublicEngagementAssets(projectId as string),
    enabled: on && audience === "public" && pickPublic !== null,
    staleTime: STALE_MS,
    retry: false,
  });

  if (!on) return null;
  if (audience === undefined) return undefined;
  if (audience === "owner") return owner.isError ? null : owner.data;
  if (!pickPublic || pub.isError) return null;
  return pub.data ? pickPublic(pub.data) : undefined;
}

/**
 * `undefined` while loading, `null` when the artifact can't be shown (no
 * project / id, missing row, the listing failed, or a kind this audience
 * can't see), otherwise the loaded artifact.
 */
export function useEngagementAsset(
  kind: EngagementAssetKind,
  projectId: string | null | undefined,
  assetId: string,
): LoadedEngagementAsset | null | undefined {
  const rows = useEngagementAssetRows(kind, projectId, !!assetId);
  if (rows === undefined) return undefined;
  if (rows === null) return null;
  return selectEngagementAsset(kind, rows, assetId);
}

/** Pure: an artifact as PLAYBACK may use it — an inactive form is
 *  unavailable (null). Everything else passes through unchanged. */
export function playableEngagementAsset(
  asset: LoadedEngagementAsset | null | undefined,
): LoadedEngagementAsset | null | undefined {
  if (asset?.kind === "video-form" && !isPlayableForm(asset.form)) return null;
  return asset;
}

/** `useEngagementAsset` for playback controls (the engagement overlay):
 *  an inactive form resolves to null, so it renders no control. */
export function usePlayableEngagementAsset(
  kind: EngagementAssetKind,
  projectId: string | null | undefined,
  assetId: string,
): LoadedEngagementAsset | null | undefined {
  return playableEngagementAsset(useEngagementAsset(kind, projectId, assetId));
}

/** The project's forms playback may gate on — inactive forms dropped. */
export function usePlayableFormRows(
  projectId: string | null | undefined,
  enabled = true,
): PublicVideoForm[] | null | undefined {
  const rows = useEngagementAssetRows("video-form", projectId, enabled);
  return useMemo(() => (rows ? rows.filter(isPlayableForm) : rows), [rows]);
}
