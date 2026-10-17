/**
 * Résumé write contract for the consolidated `/api/resumes` surface.
 *
 *   POST  /api/resumes      { source, ... } — every way a résumé is created
 *   PATCH /api/resumes/:id  { archived?, isMaster?, isActive?, privacy?, parentId?, status? }
 *
 * `source` picks the creation strategy (server registry in
 * api/src/services/resume/create). A multipart body is always `file`.
 */
import { z } from "zod";
import { ResumeContentSchema, ResumePrivacySchema, ResumeStatusSchema } from "./resume.js";

export const RESUME_CREATE_SOURCES = ["blank", "file", "text", "clone", "variation", "job"] as const;
export type ResumeCreateSource = (typeof RESUME_CREATE_SOURCES)[number];

export const ResumeCreateSourceSchema = z.enum(RESUME_CREATE_SOURCES);

/** `clone` — copy one of the caller's résumés. */
export const CloneResumeRequestSchema = z.object({ sourceId: z.string().min(1) });

/** `text` — pre-extracted plain text (Chrome extension / paste). */
export const TextResumeRequestSchema = z.object({
  text: z.string(),
  title: z.string().optional(),
});

/** `variation` — save content as a version of `sourceId`'s master. Without
 *  `content` the source's own content is copied; `resumeData` (markdown) is
 *  parsed onto it for imports that have no structured JSON. */
export const VariationResumeRequestSchema = z.object({
  sourceId: z.string().min(1),
  content: ResumeContentSchema.partial().optional(),
  title: z.string().trim().max(250).optional(),
  name: z.string().optional(),
  description: z.string().max(500).optional(),
  resumeData: z.string().optional(),
});

/** State flips on one résumé. `isMaster`/`isActive` are per-owner
 *  singletons (setting one clears the others); `parentId: null` detaches a
 *  version; `isMaster: true` + `parentId: null` promotes it. */
export const ResumeStatePatchSchema = z
  .object({
    archived: z.boolean().optional(),
    isMaster: z.literal(true).optional(),
    isActive: z.literal(true).optional(),
    privacy: ResumePrivacySchema.optional(),
    parentId: z.null().optional(),
    status: ResumeStatusSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Send at least one field to change" });
export type ResumeStatePatch = z.infer<typeof ResumeStatePatchSchema>;

/** `GET /api/resumes` list shapes. */
export const RESUME_LIST_VIEWS = ["full", "summary", "groups"] as const;
export type ResumeListView = (typeof RESUME_LIST_VIEWS)[number];
