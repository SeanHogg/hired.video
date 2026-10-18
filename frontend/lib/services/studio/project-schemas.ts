// Studio project + publication DTO schemas — split out of studio-service.ts
// (which re-exports everything here under the same names).
import { z } from "zod";
import { MEDIA_KINDS } from "@shared/media-kinds";
import { STUDIO_SUBJECT_KINDS } from "@shared/studio-subject";
import { StoryboardSchema, VideoScriptSchema, studioPurposeSchema } from "./script-schemas";

// ─── Studio project types ─────────────────────────────────────────────────────

export enum StudioProjectStatus {
  Draft = "Draft",
  Processing = "Processing",
  Exported = "Exported",
  Publishing = "Publishing",
  Completed = "Completed",
  Published = "Published",
  Failed = "Failed",
}

export const StudioProjectSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  status: z.nativeEnum(StudioProjectStatus),
  youtubeVideoId: z.string().nullish(),
  videoUrl: z.string().nullish(),
  thumbnailUrl: z.string().nullish(),
  storyboard: StoryboardSchema.nullish(),
  script: VideoScriptSchema.nullable().optional(),
  // 'scene' = legacy template editor (storyboard/script). 'nle' = power-user
  // multi-track timeline editor (timelineSpec). See migration 0067 +
  // shared/timeline.ts. Default 'scene' so any pre-0067 row still routes
  // to the scene editor without explicit migration.
  kind: z.enum(["scene", "nle"]).default("scene").optional(),
  // Output axis (#894) — what the finished project becomes. Drives the
  // export menu, publish destinations, and per-template "Exports as
  // MP4 / MP3+RSS / GIF" panel. See `@shared/media-kinds`. Default
  // 'video' for every pre-#894 row.
  mediaKind: z.enum(MEDIA_KINDS).default("video").optional(),
  // Frame-accurate Timeline JSON for kind='nle' projects. The shape is
  // validated client-side by callers that consume it (the NLE canvas);
  // server stores verbatim. See shared/timeline.ts.
  timelineSpec: z.unknown().nullish(),
  // Game runtime state for mediaKind='game' projects (#927). Parallel
  // to `timelineSpec` — each canvas runtime owns its own JSONB column
  // per the canvas-runtime extensibility model (PRD §1.2). Validated
  // client-side by `<GameStage>`; server stores verbatim. See
  // shared/game-state.ts.
  gameState: z.unknown().nullish(),
  // Image runtime state for mediaKind='image' projects (#932). Same
  // parallel-column pattern as gameState. Validated client-side by
  // <DrawingStage>; server stores verbatim. See shared/image-state.ts.
  imageState: z.unknown().nullish(),
  // Animation runtime state for mediaKind='animation' projects (#1003).
  // Same parallel-column pattern. Validated client-side by
  // <AnimationStage>; server stores verbatim. See
  // shared/animation-state.ts.
  animationState: z.unknown().nullish(),
  // CAD runtime state for mediaKind='cad' projects (#930). Same
  // parallel-column pattern. Validated client-side by <CadStage>;
  // server stores verbatim. See shared/cad-state.ts.
  cadState: z.unknown().nullish(),
  // 3D CAD runtime state for mediaKind='cad_3d' projects (#930 Phase 2).
  // Validated client-side by <Cad3DStage>; server stores verbatim. See
  // shared/cad-3d-state.ts.
  cad3dState: z.unknown().nullish(),
  // Comic runtime state for mediaKind='comic' projects (#929 / #1217).
  // Dormant today (comic authoring rides the CanvasState path) but
  // mirrored on the DTO + schema so the per-kind parallel-column
  // pattern is total. Removes the foot-gun where a future comic-only
  // field silently round-trips to nothing.
  comicState: z.unknown().nullish(),
  // Interactive-comic (Comic+) branching choice graph for
  // mediaKind='interactive_comic' projects (#1960 / #2126). Validated
  // client-side by <InteractiveComicStage>; server stores verbatim. See
  // shared/interactive-comic-state.ts.
  interactiveComicState: z.unknown().nullish(),
  // Document runtime state for mediaKind='document' projects (#1912).
  // Same parallel-column pattern. Validated client-side by <DocumentStage>;
  // server stores verbatim. See document-state.ts.
  documentState: z.unknown().nullish(),
  prompt: z.string().nullish(),
  jobDescription: z.string().nullish(),
  resumeText: z.string().nullish(),
  purpose: studioPurposeSchema.nullish(),
  viewCount: z.number().optional().default(0),
  ctaClickCount: z.number().optional().default(0),
  // Distinct channels the project is published to — filled by the LIST read
  // (GET /api/studio/projects, one grouped query); 0 elsewhere.
  publicationCount: z.number().int().nonnegative().optional().default(0),
  isPublic: z.boolean().optional().default(false),
  // SEO metadata — editable via the editor "Details" drawer. Persisted
  // server-side inside the storyboard JSONB (no migration); see
  // toProjectDto in api/src/routes/studio.ts.
  metaDescription: z.string().nullish(),
  slug: z.string().nullish(),
  keywords: z.array(z.string()).default([]).optional(),
  socialCardImage: z.string().nullish(),
  // Many-to-many subject links via studio_project_subjects (migration 0061).
  // A video can be associated with multiple entities at once (e.g. a
  // personal-brand video linked to a target job AND a resume).
  subjects: z.array(z.object({
    kind: z.enum(STUDIO_SUBJECT_KINDS),
    id:   z.string(),
  })).default([]).optional(),
  creationDateTime: z.string(),
  updateDateTime: z.string(),
  // Content revision (#2242): bumped by every save-draft. An autosave sends
  // the revision it was based on; a stale one is refused with 409.
  revision: z.number().int().nonnegative().optional(),
});

export type StudioProject = z.infer<typeof StudioProjectSchema>;

// ─── Publication records (#1920) ────────────────────────────────────────────
// "Where has this project been published?" — one record per destination,
// mirroring the api `PublicationRecord` (publication-service.ts). `destination`
// is a shared `PublishDestinationId`; `externalUrl` is the view/preview link
// (YouTube watch URL, LinkedIn post, on-platform /m/ link).

export const StudioPublicationSchema = z.object({
  id: z.string().optional(),
  destination: z.string(),
  externalId: z.string().nullish(),
  externalUrl: z.string().nullish(),
  status: z.enum(["published", "failed", "pending"]),
  publishedAt: z.string(),
  updatedAt: z.string(),
  /** Fitted cut posted; null/absent = the master. */
  renderVariantId: z.string().nullish(),
});
export type StudioPublication = z.infer<typeof StudioPublicationSchema>;
