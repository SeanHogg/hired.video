/**
 * Zod schema for the `GET /api/studio/public/:videoId` wire payload
 * (ready | pending, discriminated by `pending`). Consumed by
 * `StudioVideoSurface` (lazy mode), the public watch page and the
 * `public-payload` adapter.
 */
import { z } from "zod";

// ─── API payload schema ─────────────────────────────────────────────────────
// Shape returned by `GET /api/studio/public/:videoId`. Two variants
// discriminated by `pending`: ready (full payload) and pending
// (project exists but not yet public).

const CtaHotzoneSchema = z.object({
  startSec: z.number(),
  endSec: z.number(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  url: z.string(),
});

export const PublicVideoReadySchema = z.object({
  pending: z.literal(false),
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  videoUrl: z.string().nullable().optional(),
  youtubeUrl: z.string().nullable().optional(),
  youtubeVideoId: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  ownerAvatar: z.string().nullable().optional(),
  resumeId: z.string().nullable().optional(),
  // The V2 playback state (Timeline JSON). `resolvePublicCanvasState`
  // hydrates it into the CanvasState <CanvasStatePreview/> renders.
  timelineSpec: z.unknown().optional().nullable(),
  // A project saved by the deleted V1 editor: its stored VideoScript
  // (meta stripped server-side), converted to CanvasState at read time.
  // Null for every V2 project.
  legacyScript: z.unknown().optional().nullable(),
  kind: z.string().nullable().optional(),
  // Output-axis discriminator (#894). Set on every payload from
  // `/api/studio/public/:videoId` since the mediaKind extension —
  // older payloads (legacy direct uploads / cached intermediaries)
  // surface as undefined and default to 'video' downstream. Drives
  // the public watch page's ProjectPlayer dispatch so non-video
  // kinds (image, game, animation, cad) render their own surface
  // instead of the legacy "Video is being processed" fallback.
  mediaKind: z.string().nullable().optional(),
  // Parallel-column canvas-runtime state. Each kind owns its own
  // JSONB column per the canvas-runtime extensibility model in
  // PRD §1.2 — non-video watch surfaces read these to mount the
  // right runtime (GameStage / first-layer image / first-frame
  // animation) on the /v/<id> page.
  gameState: z.unknown().optional().nullable(),
  imageState: z.unknown().optional().nullable(),
  animationState: z.unknown().optional().nullable(),
  cadState: z.unknown().optional().nullable(),
  // Comic state column carried for parity (#1217). Dormant today
  // because comic authoring rides the CanvasState path; surfaced
  // here so the public payload round-trips it for the day a comic
  // adds runtime-only fields outside the canvas state.
  comicState: z.unknown().optional().nullable(),
  aspect: z.string().nullable().optional(),
  resolution: z.string().nullable().optional(),
  ctaHotzones: z.array(CtaHotzoneSchema).optional().default([]),
  // SEO meta authored in the project Details drawer (Meta tab). The
  // public watch page overlays these onto the og: / twitter: / keywords
  // tags; null/empty means "fall back to the video's title/description/
  // thumbnail". Schema accepts undefined for backwards compatibility
  // with older payloads that haven't been redeployed.
  metaDescription: z.string().nullable().optional(),
  keywords: z.array(z.string()).optional().default([]),
  socialCardImage: z.string().nullable().optional(),
  createdAt: z.string(),
});

const PublicVideoPendingSchema = z.object({
  pending: z.literal(true),
  // The project's id — the watch page offers its owner Publish / Edit.
  id: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  ownerAvatar: z.string().nullable().optional(),
});

export const PublicVideoSchema = z.discriminatedUnion("pending", [
  PublicVideoReadySchema,
  PublicVideoPendingSchema,
]);

export type PublicVideoReady = z.infer<typeof PublicVideoReadySchema>;
export type PublicVideoPayload = z.infer<typeof PublicVideoSchema>;

export function isReady(v: PublicVideoPayload): v is PublicVideoReady {
  return v.pending === false;
}
