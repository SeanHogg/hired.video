/**
 * The studio project DTO — the ONE shape every project read/write route
 * returns (list, single read, save-draft, upload, status/visibility, clone,
 * public subject list). Split out of routes/studio.ts (W2-3a).
 */
import { schema } from "../../db/index.js";
import { cdnUrl } from "../../utils/cdn.js";
import { normalizeStoryboard, VideoScriptSchema } from "./video-script.js";
import { projectStateDto } from "./project-state.js";
import type { StudioProjectRow } from "../../repositories/studioProjectColumns.js";

type VideoRow = typeof schema.videos.$inferSelect;

export type StudioStatus = "Draft" | "Processing" | "Exported" | "Publishing" | "Completed" | "Published" | "Failed";

export function asIso(value: Date | string | null | undefined): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

export function mapStudioStatus(raw: string): StudioStatus {
  const v = raw.toLowerCase();
  if (v === "draft" || v === "pending") return "Draft";
  if (v === "exported") return "Exported";
  if (v === "publishing") return "Publishing";
  if (v === "published") return "Published";
  if (v === "completed") return "Completed";
  if (v === "publish_failed" || v === "failed") return "Failed";
  return "Processing";
}

export function toProjectDto(
  project: StudioProjectRow,
  linkedVideo?: VideoRow | null,
  analytics?: { viewCount: number; ctaClickCount: number },
  subjects?: Array<{ kind: string; id: string }>,
  publicationCount?: number,
) {
  const storyboard = normalizeStoryboard(project.storyboard);
  // The saved project name (`name` column, set by save-draft) is the display
  // title so users see their chosen project name, not raw resume text.
  const meta = project.storyboard as Record<string, unknown> | null;
  const savedName = project.name ?? undefined;
  const savedPrompt = meta?._prompt as string | undefined;
  const savedJobDescription = meta?._jobDescription as string | undefined;
  const savedPurpose = project.purpose ?? undefined;
  // SEO fields — surfaced via the editor "Details" drawer.
  const savedMetaDescription = meta?._metaDescription as string | undefined;
  // Prefer the dedicated `slug` column (migration 0141); fall back to the
  // JSONB mirror for any row that hasn't been re-saved since the migration.
  const savedSlug = project.slug ?? (meta?._slug as string | undefined);
  const savedKeywords = Array.isArray(meta?._keywords) ? (meta!._keywords as string[]) : undefined;
  const savedSocialCardImage = meta?._socialCardImage as string | undefined;
  // If the storyboard is a VideoScript (saved by save-draft), expose it as `script`
  const maybeScript = VideoScriptSchema.safeParse(project.storyboard);
  const script = maybeScript.success ? maybeScript.data : null;
  // Strip fake yt_ IDs — only expose real YouTube data
  const isFakeYt = linkedVideo?.youtubeVideoId?.startsWith("yt_");
  return {
    id: project.id,
    userId: project.userId,
    title: savedName || project.resumeText?.slice(0, 80) || "My Video Resume",
    status: mapStudioStatus(project.status),
    youtubeVideoId: isFakeYt ? null : (linkedVideo?.youtubeVideoId ?? null),
    videoUrl: (isFakeYt ? null : linkedVideo?.youtubeUrl) ?? (linkedVideo?.r2Key ? cdnUrl(linkedVideo.r2Key) : null),
    thumbnailUrl: linkedVideo?.thumbnailUrl ?? null,
    // The hosted MP4 itself (null before the first render). Every render
    // uploads under a new key, so a caller waiting for a FRESH render (the
    // Chrome extension after updating a project) watches this change.
    renderUrl: linkedVideo?.r2Key ? cdnUrl(linkedVideo.r2Key) : null,
    storyboard,
    script,
    // Editor surface discriminator + Timeline JSON for kind='nle' projects.
    kind: (project.kind as "scene" | "nle" | null) ?? "scene",
    // Output axis (#894) — see `shared/media-kinds.ts`. Pre-0099 rows fall
    // back to 'video'.
    mediaKind: (project.mediaKind as "video" | "podcast" | "voice" | "animation" | "game" | "comic" | "image" | null) ?? "video",
    // Runtime state (`state`, shaped by mediaKind) under its per-kind field
    // name (shared/studio-project-state.ts); every other kind's field null.
    ...projectStateDto(project),
    prompt: savedPrompt ?? null,
    jobDescription: savedJobDescription ?? null,
    resumeText: project.resumeText ?? null,
    viewCount: analytics?.viewCount ?? 0,
    ctaClickCount: analytics?.ctaClickCount ?? 0,
    purpose: savedPurpose ?? (script?.video?.purpose as string | undefined) ?? null,
    // Project-level visibility is authoritative post-#665; the video row's
    // privacyStatus is the fallback for legacy rows pre-dating migration 0083.
    isPublic: project.isPublic || linkedVideo?.privacyStatus === "public",
    metaDescription: savedMetaDescription ?? null,
    slug: savedSlug ?? null,
    keywords: savedKeywords ?? [],
    socialCardImage: savedSocialCardImage ?? null,
    // Many-to-many subject links via studio_project_subjects (migration 0061).
    subjects: subjects ?? [],
    // Distinct channels the project is published to. Filled by the LIST
    // read; single-project reads leave it 0 (per-project list is …/publications).
    publicationCount: publicationCount ?? 0,
    creationDateTime: asIso(project.createdAt),
    updateDateTime: asIso(project.updatedAt),
    // Content revision for the autosave's stale-write check (#2242).
    revision: project.revision ?? 0,
  };
}

export type StudioProjectDto = ReturnType<typeof toProjectDto>;
