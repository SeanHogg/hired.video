/**
 * Creator Program enrollment use cases: opt in, toggle one program, leave
 * the program, read / update the creator profile fields.
 *
 * `is_active` and the marketplace `categories` array are always derived from
 * the per-program flags (shared/creator-programs.ts) — never user-editable.
 */
import { getDb, type Db } from "../../db/index.js";
import {
  CREATOR_PROGRAMS,
  PROGRAM_TERMS_KIND,
  programFlagColumn,
  programsToCategories,
  activeFlagsToPrograms,
  deriveIsActive,
  type CreatorProgram,
  type CreatorProgramFlags,
} from "../../../../shared/creator-programs.js";
import { findAcceptedCurrentLegalDocKinds } from "../legal/legal-acceptance.js";
import {
  findActiveEnrollment,
  insertEnrollment,
  updateEnrollment,
  setUserProvidesServices,
  type CreatorProfilePatch,
  type CreatorProfileRow,
} from "../../repositories/creatorProfilesRepository.js";
import { ok, fail, type CreatorResult } from "./result.js";

export const DEFAULT_PLATFORM_FEE_BPS = 500; // 5% (+ CC processing passed to buyer at checkout)

export interface OptInInput {
  programs: CreatorProgram[];
  displayName?: string;
  tagline?: string;
  bio?: string;
  languages?: string[];
}

async function missingProgramTerms(db: Db, userId: string, programs: CreatorProgram[]): Promise<CreatorProgram[]> {
  // One batched lookup across every program's terms doc.
  const accepted = await findAcceptedCurrentLegalDocKinds(
    db,
    userId,
    programs.map((p) => PROGRAM_TERMS_KIND[p]),
  );
  return programs.filter((p) => !accepted.has(PROGRAM_TERMS_KIND[p]));
}

// Apply a program flag flip to the active enrollment row, recomputing
// `is_active` and the marketplace `categories` array atomically. Enabling
// Video sets `videoActive=true` AND adds `promo_video` to categories;
// disabling reverses it.
async function setProgramFlag(
  db: Db,
  existing: CreatorProfileRow,
  program: CreatorProgram,
  enable: boolean,
): Promise<CreatorProfileRow> {
  const next: CreatorProgramFlags = {
    videoActive: existing.videoActive,
    voiceActive: existing.voiceActive,
    servicesActive: existing.servicesActive,
    articlesActive: existing.articlesActive,
    coursesActive: existing.coursesActive,
    templatesActive: existing.templatesActive,
    [programFlagColumn(program)]: enable,
  };
  return updateEnrollment(db, existing.id, {
    ...next,
    isActive: deriveIsActive(next),
    categories: programsToCategories(activeFlagsToPrograms(next)),
    updatedAt: new Date(),
  });
}

/**
 * Start a new enrollment. Gates: ≥1 program, current per-program terms
 * accepted, no open enrollment row. A paid subscription is NOT required —
 * visibility is gated downstream by `isCreatorVisible(userId)`.
 */
export async function optInCreator(userId: string, input: OptInInput): Promise<CreatorResult<CreatorProfileRow>> {
  const { programs } = input;
  if (programs.length === 0) {
    return fail(400, "VALIDATION_ERROR", `Select at least one program (${CREATOR_PROGRAMS.join(", ")})`);
  }
  const db = getDb();
  const missing = await missingProgramTerms(db, userId, programs);
  if (missing.length > 0) {
    return fail(
      400,
      "TERMS_NOT_ACCEPTED",
      `Accept the current terms for: ${missing.join(", ")}. POST /api/legal/accept for each program kind first.`,
    );
  }
  if (await findActiveEnrollment(db, userId)) {
    return fail(
      409,
      "ALREADY_ENROLLED",
      "Active enrollment exists. Toggle programs via /me/programs/:program or cancel all via /me/cancel.",
    );
  }

  const now = new Date();
  const flags: CreatorProgramFlags = {
    videoActive: programs.includes("video"),
    voiceActive: programs.includes("voice"),
    servicesActive: programs.includes("services"),
    articlesActive: programs.includes("articles"),
    coursesActive: programs.includes("courses"),
    templatesActive: programs.includes("templates"),
  };
  const created = await insertEnrollment(db, {
    userId,
    ...flags,
    isActive: deriveIsActive(flags),
    displayName: input.displayName ?? null,
    tagline: input.tagline ?? null,
    bio: input.bio ?? null,
    categories: programsToCategories(activeFlagsToPrograms(flags)),
    languages: input.languages ?? [],
    platformFeeBps: DEFAULT_PLATFORM_FEE_BPS,
  });
  await setUserProvidesServices(db, userId, true, now);
  return ok(created, 201);
}

/** Enable one program on the open enrollment (requires its current terms). */
export async function enableCreatorProgram(userId: string, program: CreatorProgram): Promise<CreatorResult<CreatorProfileRow>> {
  const db = getDb();
  const existing = await findActiveEnrollment(db, userId);
  if (!existing) return fail(404, "NOT_FOUND", "No active enrollment. Use /opt-in first.");
  const missing = await missingProgramTerms(db, userId, [program]);
  if (missing.length > 0) {
    return fail(400, "TERMS_NOT_ACCEPTED", `Accept the current ${program} program terms first.`);
  }
  return ok(await setProgramFlag(db, existing, program, true));
}

/** Disable one program; the enrollment row stays open (ended_at null). */
export async function disableCreatorProgram(userId: string, program: CreatorProgram): Promise<CreatorResult<CreatorProfileRow>> {
  const db = getDb();
  const existing = await findActiveEnrollment(db, userId);
  if (!existing) return fail(404, "NOT_FOUND", "No active enrollment");
  return ok(await setProgramFlag(db, existing, program, false));
}

/** Leave the program entirely: close the row and clear every flag. */
export async function cancelCreatorEnrollment(userId: string): Promise<CreatorResult<CreatorProfileRow>> {
  const db = getDb();
  const existing = await findActiveEnrollment(db, userId);
  if (!existing) return fail(404, "NOT_FOUND", "No active enrollment");
  const now = new Date();
  const updated = await updateEnrollment(db, existing.id, {
    endedAt: now,
    videoActive: false,
    voiceActive: false,
    servicesActive: false,
    articlesActive: false,
    coursesActive: false,
    templatesActive: false,
    isActive: false,
    categories: [],
    updatedAt: now,
  });
  await setUserProvidesServices(db, userId, false, now);
  return ok(updated);
}

export async function getOwnCreatorProfile(userId: string): Promise<CreatorProfileRow | null> {
  return findActiveEnrollment(getDb(), userId);
}

const PROFILE_PATCH_FIELDS = [
  "displayName", "tagline", "bio", "languages",
  "defaultPriceCents", "extraRevisionPriceCents", "averageDeliveryDays",
] as const;

/** Profile-only PATCH: name / tagline / bio / languages / pricing. */
export async function updateOwnCreatorProfile(
  userId: string,
  body: Record<string, unknown>,
): Promise<CreatorResult<CreatorProfileRow>> {
  const db = getDb();
  const existing = await findActiveEnrollment(db, userId);
  if (!existing) return fail(404, "NOT_FOUND", "Opt in first via /opt-in");
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of PROFILE_PATCH_FIELDS) {
    if (k in body) patch[k] = body[k];
  }
  return ok(await updateEnrollment(db, existing.id, patch as CreatorProfilePatch));
}
