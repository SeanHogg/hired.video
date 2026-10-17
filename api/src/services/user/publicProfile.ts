/**
 * Public-facing user reads behind `/api/users`: the People directory
 * (`GET /public`), a profile by id-or-slug (`GET /:id`, visibility-gated)
 * and a user's résumé list (`GET /:id/resumes`).
 */
import { DomainError } from "../../domains/errors.js";
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { getOrSetCached } from "../../utils/edge-cache.js";
import { USER_LIST_FIELDS, parseFields, projectRows } from "../../../../shared/projection.js";
import { isSuperAdmin } from "../../middleware/superAdmin.js";
import { projectUserResumes } from "../../handlers/resume-serializer.js";
import { getProfilePitch } from "../pitch/pitchService.js";
import type { JwtPayload } from "../../types/index.js";
import { resolveUserRef } from "./resolveUserRef.js";
import { cardRowToDto, toUserProfileDto } from "./userDtos.js";
import { countPublicDirectory, findPublicDirectoryCardRows } from "../../repositories/userCardsRepository.js";
import {
  findActiveCreator,
  findPrivacyFlags,
  findProfileCols,
  findPublicIdentity,
  findPublicVideos,
} from "../../repositories/usersProfileRepository.js";

/** GET /public — one page of the public People directory + global total. */
export async function listPublicUsers(page: number, limit: number, fieldsQuery: string | undefined) {
  const offset = (page - 1) * limit;
  const items = (await findPublicDirectoryCardRows(limit, offset)).map(cardRowToDto);

  // `?fields=id,fullName,avatar,headline,...` projection (gap #1370) — the
  // /people directory card view only needs a handful of fields; clipping the
  // payload here saves the skills JSON + creator-program flags on every
  // call. Field names are `toPublicUserCardDto` DTO keys (see USER_LIST_FIELDS
  // note). Detail endpoints still return the full row.
  const fields = parseFields(fieldsQuery, USER_LIST_FIELDS);
  const projected = projectRows(items as unknown as Array<Record<string, unknown>>, fields);

  // Real global count (NOT the current page size) so the frontend pagination
  // UI shows the correct number of pages (#904). The directory's membership
  // changes only on signup/verify/visibility edits, so a short read-through
  // TTL is plenty and avoids a COUNT(*) on every page request.
  const total = await getOrSetCached({
    key: "users:public:count",
    ttlSeconds: 60,
    loader: countPublicDirectory,
  });
  return { items: projected, total, page, limit };
}

/** GET /:id/resumes — the user's résumés (public ones unless the caller owns them). */
export async function listUserResumes(ref: string, callerId: string | undefined) {
  const db = getDb();
  const targetUserId = await resolveUserRef(db, ref);
  if (!targetUserId) return [];

  const isOwner = callerId === targetUserId;
  // Filter + project via the shared serializer — keeps the wire shape
  // documented + tested in one place. The projection MUST include
  // `isMaster`, `slug`, etc. so the profile page can find the master
  // resume; see resume-serializer.test.ts (`projectUserResumes`).
  const all = await buildRepos(db).resumes.findAllForOwner(targetUserId);
  return projectUserResumes(all, { isOwner });
}

/** GET /:id — profile by id or custom slug; visibility-conditional. */
export async function getPublicProfile(ref: string, caller: JwtPayload | undefined) {
  const db = getDb();

  // `:id` is the public user ref — a UUID or a customUrlSlug. Resolve once
  // via the shared seam, then fetch identity + profile uniformly by userId.
  const targetUserId = await resolveUserRef(db, ref);
  const me = targetUserId ? await findPublicIdentity(targetUserId) : null;
  if (!me) throw new DomainError(404, "NOT_FOUND", "User not found");
  const profile = await findProfileCols(me.id);

  const visibility = profile?.profileVisibility ?? "public";
  const isOwner = caller?.sub === me.id;
  const callerIsSuperAdmin = isSuperAdmin(caller);

  // Fetched up-front (not in the enrich Promise.all below) because two of
  // these flags participate in the visibility gates that follow:
  //   • profileVisibleToPublic — Settings → Privacy → "Public Profile"
  //     toggle. When false, other authenticated users can't see the
  //     profile (only owner / SuperAdmin / connections fall through).
  //   • promoteWithoutAuth — Settings → Privacy → "Promote Services &
  //     Content Without Authentication". When true, anonymous viewers can
  //     also reach the page even if profileVisibleToPublic is true (the
  //     anonymous gate is the page-level AuthOverlay, not the API).
  const privacyRow = await findPrivacyFlags(me.id);
  const profileVisibleToPublic = privacyRow?.profileVisibleToPublic ?? true;

  // Private profiles are only visible to the owner (SuperAdmins bypass)
  if (visibility === "private" && !isOwner && !callerIsSuperAdmin) {
    throw new DomainError(403, "FORBIDDEN", "This profile is private");
  }

  // Unverified accounts are hidden from everyone except the owner and
  // SuperAdmins. Returning 404 (rather than a verification-specific error)
  // avoids leaking the existence of half-created accounts to anonymous
  // callers — same shape as if the user simply didn't exist.
  if (!me.emailVerified && !isOwner && !callerIsSuperAdmin) {
    throw new DomainError(404, "NOT_FOUND", "User not found");
  }

  // Connections-only profiles require authentication at minimum
  if (visibility === "connections" && !caller) {
    throw new DomainError(401, "UNAUTHORIZED", "Authentication required to view this profile");
  }

  // "Public Profile" toggle off → hide from other authenticated users.
  // Anonymous callers are governed by promoteWithoutAuth (the page-level
  // AuthOverlay) and are not blocked here so a creator can keep their
  // profile open to anonymous promotion traffic while keeping it hidden
  // from random signed-in users — the two axes are independent.
  if (!profileVisibleToPublic && caller && !isOwner && !callerIsSuperAdmin) {
    throw new DomainError(403, "FORBIDDEN", "This profile is private");
  }

  // Enrich with public resume and video counts for "Hire Me" profile page.
  // The resume list goes through ResumeRepository; we filter to public
  // rows + project to ids in memory rather than widen the repo for this
  // one caller's shape.
  const { resumes: resumeRepo, pitches: pitchRepo } = buildRepos(db);
  // The current video pitch (#2133) rides the same fan-out — one indexed
  // query. The owner's "videoResume" section toggle is enforced HERE
  // (#2391): a visitor gets `pitch: null` when it is hidden; the owner
  // always gets their own.
  const [publicResumes, publicVideos, creatorRow, pitch] = await Promise.all([
    resumeRepo.findAllForOwner(me.id).then((rows) =>
      rows.filter((r) => r.privacyLevel <= 0).map((r) => ({ id: r.id })),
    ),
    findPublicVideos(me.id),
    findActiveCreator(me.id),
    getProfilePitch({ id: me.id, role: me.role ?? null }, pitchRepo, { isOwner }),
  ]);

  return {
    ...toUserProfileDto(me, profile ?? null, { isOwner, privacy: privacyRow ?? null }, creatorRow ?? null),
    publicResumeCount: publicResumes.length,
    publicVideos,
    pitch,
  };
}
