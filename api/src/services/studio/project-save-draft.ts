/**
 * POST /api/studio/save-draft — save or update a project's name + script
 * (or editor state) without requiring a video export. Split out of
 * routes/studio.ts (W2-3a).
 *
 * Rules kept verbatim from the original handler:
 *  - prior storyboard meta (SEO fields) carries forward unless the request
 *    sets it; a save without `script` keeps the prior script keys;
 *  - the per-kind state field the project's mediaKind owns is written to
 *    `state` (shared/studio-project-state.ts); the prior render stamp
 *    carries onto it;
 *  - optimistic concurrency (#2242): a stale `baseRevision` → 409;
 *  - slug: explicit → uniquified, prior → kept, else derived from the name;
 *  - `subjects`, when present, replace-all (candidate links force unlisted,
 *    an edit of a live project re-checks candidate consent);
 *  - delegated personal work earns the editor a creator credit.
 */
import { z } from "zod";
import { getDb, type Db } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { STALE_REVISION_CODE } from "../../../../shared/autosave.js";
import { STUDIO_SUBJECT_KINDS } from "../../../../shared/studio-subject.js";
import { MEDIA_KINDS } from "../../../../shared/media-kinds.js";
import { STUDIO_STATE_FIELDS, stateFromFields } from "../../../../shared/studio-project-state.js";
import { slugify, SLUG_PATTERN } from "../../../../shared/slugify.js";
import { OptionalUrlSchema, UuidLikeSchema } from "../../../../shared/validation.js";
import { MediaRepository } from "../../repositories/mediaRepository.js";
import {
  findProjectById,
  insertProject,
  updateProjectIfRevision,
  type StudioProjectPatch,
} from "../../repositories/studioProjectsRepository.js";
import { ensureCreatorCredit, replaceProjectSubjects } from "../../repositories/studioProjectSubjectsRepository.js";
import { enforceCandidateVideoConsent } from "../candidate-consent/candidate-consent-deps.js";
import { assertCanWrite } from "./workspace.js";
import { resolveWorkspaceFromBody } from "./workspace-request.js";
import { studioPurposeSchema } from "./video-script.js";
import { carryBakedStamp } from "./baked-stamp.js";
import { storyboardScriptKeys } from "./storyboard-meta.js";
import type { StudioProjectDto } from "./project-dto.js";
import { forceProjectUnlisted, loadProjectSubjects } from "./project-visibility.js";
import { invalidatePublicProjectsForSubjects } from "./public-projects-cache.js";
import { bumpPublicWatchCache } from "./public-watch-cache.js";
import { loadProjectDto } from "./project-queries.js";

/** Request body. Editor-state blobs are validated client-side against their
 *  shared/*-state.ts shapes and stored verbatim (the runtime is the schema
 *  authority). SEO fields live in the storyboard JSONB as `_`-prefixed keys;
 *  the per-kind state fields map onto the one `state` column. */
export const SaveDraftBodySchema = z.object({
  name:           z.string().min(1).max(200).default("My Video Resume"),
  resumeText:     z.string().default(""),
  script:         z.any().optional(),
  projectId:      UuidLikeSchema.optional(),
  prompt:         z.string().max(2000).optional(),
  jobDescription: z.string().max(4000).optional(),
  purpose:        studioPurposeSchema.optional(),
  // 'scene' = legacy storyboard editor, 'nle' = v2 canvas / NLE timeline.
  kind:           z.enum(["scene", "nle"]).optional(),
  // Output axis (#894); the column default 'video' keeps old clients working.
  mediaKind:      z.enum(MEDIA_KINDS).optional(),
  timelineSpec:   z.any().optional(),
  gameState:      z.any().optional(),
  imageState:     z.any().optional(),
  animationState: z.any().optional(),
  cadState:       z.any().optional(),
  cad3dState:     z.any().optional(),
  documentState:  z.any().optional(),
  interactiveComicState: z.any().optional(),
  // Omitted → links untouched; present → replace-all.
  subjects:       z.array(z.object({
    kind: z.enum(STUDIO_SUBJECT_KINDS),
    id:   z.string().min(1).max(200),
  })).optional(),
  metaDescription:  z.string().max(300).optional(),
  // "" = carry forward the prior slug (clearing the field must not fail).
  slug:             z.union([z.string().max(80).regex(SLUG_PATTERN, "slug must be kebab-case"), z.literal("")]).optional(),
  keywords:         z.array(z.string().max(40)).max(20).optional(),
  socialCardImage:  OptionalUrlSchema,
  // Revision the client's copy is based on (#2242); omitted = deliberate overwrite.
  baseRevision:     z.number().int().nonnegative().optional(),
});

export type SaveDraftInput = z.infer<typeof SaveDraftBodySchema>;


/** A project name → public-URL-safe slug (stable id-derived fallback). */
function makeProjectSlug(name: string, projectId: string | undefined): string {
  return slugify(name, { fallback: projectId ? `video-${projectId.slice(0, 8)}` : "video" });
}

/** `baseSlug`, or `baseSlug-N` (next free suffix) when another project holds
 *  it. Indexed point lookup on `studio_projects.slug` (#661); the partial
 *  unique index stays authoritative for races. */
async function ensureUniqueProjectSlug(db: Db, baseSlug: string, selfProjectId: string | undefined): Promise<string> {
  const { baseTaken, maxSuffix } = await new MediaRepository(db).findProjectSlugCollision(baseSlug, selfProjectId);
  if (!baseTaken) return baseSlug;
  const next = Math.max(2, (maxSuffix ?? 1) + 1);
  // Pathological fallback — random suffix rather than overflow the 9-digit window.
  if (next >= 1_000_000_000) return `${baseSlug}-${Date.now().toString(36).slice(-6)}`;
  return `${baseSlug}-${next}`;
}

/** kind / mediaKind / runtime state. The state is the per-kind field the
 *  effective mediaKind owns (the request's, else the row's). */
function editorKindPatch(
  input: SaveDraftInput,
  prior: { mediaKind: string | null; state: unknown } | null,
): StudioProjectPatch {
  const { kind, mediaKind, timelineSpec, interactiveComicState } = input;
  const touched =
    kind !== undefined || mediaKind !== undefined || interactiveComicState !== undefined ||
    STUDIO_STATE_FIELDS.some((k) => input[k] !== undefined);
  if (!touched) return {};
  const patch: StudioProjectPatch = { kind: kind ?? (timelineSpec !== undefined ? "nle" : undefined) };
  if (mediaKind !== undefined) patch.mediaKind = mediaKind;
  const state = stateFromFields(mediaKind ?? prior?.mediaKind ?? undefined, input);
  if (state !== undefined) patch.state = carryBakedStamp(prior?.state ?? null, state);
  if (interactiveComicState !== undefined) patch.interactiveComicState = interactiveComicState;
  return patch;
}

async function resolveSlug(
  db: Db,
  input: SaveDraftInput,
  priorSlug: string | null,
): Promise<string | null> {
  const { slug, name, projectId } = input;
  const explicitSlug = slug !== undefined && slug !== null && slug !== "" ? slug : (priorSlug ?? undefined);
  // User edited the slug field — uniquify against any other project.
  if (explicitSlug && slug !== undefined && slug !== priorSlug) return ensureUniqueProjectSlug(db, explicitSlug, projectId);
  // Existing slug carried forward — no need to re-uniquify.
  if (explicitSlug) return explicitSlug;
  if (name) return ensureUniqueProjectSlug(db, makeProjectSlug(name, projectId), projectId);
  return null;
}

const staleRevision = (details?: unknown) =>
  new DomainError(409, STALE_REVISION_CODE, "A newer copy of this project was saved elsewhere", details);
const projectNotFound = () => new DomainError(404, "NOT_FOUND", "Project not found");

export interface SaveDraftResult {
  dto: StudioProjectDto;
  /** true when this save inserted a new project (201), false for an update (200). */
  created: boolean;
}

/** `rawBody` carries the optional `workspace` selection (personal when absent). */
export async function saveProjectDraft(
  actorUserId: string,
  input: SaveDraftInput,
  rawBody: unknown,
): Promise<SaveDraftResult> {
  const { name, resumeText, script, projectId, prompt, jobDescription, purpose, subjects, metaDescription, keywords, socialCardImage, baseRevision } = input;
  const db = getDb();

  const prior = projectId ? await findProjectById(db, projectId) : null;
  const priorMeta: Record<string, unknown> =
    prior?.storyboard && typeof prior.storyboard === "object" ? (prior.storyboard as Record<string, unknown>) : {};
  // Prefer the indexed column; fall back to the JSONB mirror for pre-0141 rows.
  const priorSlug = prior ? (prior.slug ?? ((priorMeta._slug as string | undefined) ?? null)) : null;
  const kindPatch = editorKindPatch(input, prior);

  const priorRevision = prior?.revision ?? 0;
  if (projectId && baseRevision !== undefined && baseRevision !== priorRevision) {
    throw staleRevision({ revision: priorRevision });
  }
  const resolvedSlug = await resolveSlug(db, input, priorSlug);
  const seoMeta = {
    _metaDescription: metaDescription !== undefined ? metaDescription : priorMeta._metaDescription,
    _slug:            resolvedSlug,
    _keywords:        keywords        !== undefined ? keywords        : priorMeta._keywords,
    _socialCardImage: socialCardImage !== undefined ? socialCardImage : priorMeta._socialCardImage,
  };
  // A save without a `script` (V2 editor, Details drawer, publish stamp)
  // carries the prior script keys forward — dropping them wiped V1 scenes.
  // Name / purpose / revision are columns (migration 0610), not meta keys.
  const storyboardValue = {
    ...(script ?? storyboardScriptKeys(priorMeta)),
    _prompt: prompt, _jobDescription: jobDescription, ...seoMeta,
  };
  const metaColumns: StudioProjectPatch = {
    name,
    purpose: purpose ?? prior?.purpose ?? null,
    revision: projectId ? priorRevision + 1 : 1,
  };
  // Legacy `resume_id` denorm for resume-kind links (analytics joins read it).
  const resumeSubject = subjects?.find((s) => s.kind === "resume");
  const resumeIdPatch: StudioProjectPatch = resumeSubject ? { resumeId: resumeSubject.id } : {};

  const target = await resolveWorkspaceFromBody(actorUserId, rawBody);

  let savedId: string;
  // Public / on-profile before this save — an edit then re-checks consent.
  let wasLive = false;
  if (projectId) {
    // Assert against the row's actual ownership, not the client's selection.
    if (!prior) throw projectNotFound();
    await assertCanWrite(actorUserId, prior.userId, prior.companyId ?? null);
    const updated = await updateProjectIfRevision(db, projectId, {
      storyboard: storyboardValue,
      ...metaColumns,
      slug: resolvedSlug,
      resumeText: resumeText || name,
      userId: actorUserId, // record the editor for attribution
      ...resumeIdPatch,
      ...kindPatch,
    }, baseRevision === undefined ? undefined : priorRevision);
    if (!updated && baseRevision !== undefined) throw staleRevision();
    if (!updated) throw projectNotFound();
    savedId = updated.id;
    wasLive = updated.isPublic || updated.status === "published";
  } else {
    const created = await insertProject(db, {
      userId: target.ownerUserId,
      companyId: target.ownerCompanyId,
      resumeText: resumeText || name,
      storyboard: storyboardValue,
      ...metaColumns,
      slug: resolvedSlug,
      status: "draft",
      ...resumeIdPatch,
      ...kindPatch,
    });
    savedId = created.id;
  }

  // The subjects it had before a replace — their public lists change too.
  const subjectsBefore = subjects !== undefined ? await loadProjectSubjects(db, savedId) : [];
  if (subjects !== undefined) await replaceProjectSubjects(db, savedId, subjects);

  // A newly linked candidate forces unlisted; editing a live candidate video
  // re-checks the approval (shared/candidate-video-consent.ts).
  const linksNewCandidate = (subjects ?? []).some((s) =>
    s.kind === "talent_pool_candidate" && !subjectsBefore.some((b) => b.kind === s.kind && b.id === s.id));
  if (linksNewCandidate) await forceProjectUnlisted(savedId, db);
  else if (wasLive) await enforceCandidateVideoConsent(savedId);

  // Delegated (personal) work surfaces on the editor's own profile.
  if (target.ownerUserId !== actorUserId && target.ownerCompanyId == null) {
    await ensureCreatorCredit(db, savedId, actorUserId);
  }

  const dto = await loadProjectDto(db, savedId);
  if (!dto) throw projectNotFound();
  bumpPublicWatchCache(savedId, resolvedSlug, priorSlug);
  if (dto.isPublic || subjectsBefore.length > 0) {
    invalidatePublicProjectsForSubjects([...subjectsBefore, ...dto.subjects]);
  }
  return { dto, created: !projectId };
}
