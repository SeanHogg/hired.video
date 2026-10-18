/**
 * Owner-scoped audience tagging use cases (#1644) behind
 * routes/content-audiences.ts: the OWNER of a piece of content reads /
 * replaces its own audience tags. Only kinds with a single owner column are
 * self-taggable; ownership is checked per request (DomainError 400/404/403).
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { ContentLocationOwnersRepository } from "../../repositories/contentLocationOwnersRepository.js";
import { findCourseOwnerId } from "../../repositories/coursesRepository.js";
import type {
  ContentAudienceInput,
  ContentAudienceKind,
  ResolvedContentAudience,
} from "../../../../shared/content-audiences.js";
import { AudienceService } from "./AudienceService.js";

/** Kinds a creator can self-tag. */
const SELF_TAGGABLE_KINDS: ReadonlySet<ContentAudienceKind> = new Set<ContentAudienceKind>([
  "article",
  "resume",
  "template",
  "learning_path",
  "video",
]);

/** The owning user id, or null when the entity doesn't exist (or has no owner). */
async function findOwner(kind: ContentAudienceKind, entityId: string): Promise<string | null> {
  const db = getDb();
  // learning_path rows are courses (owner = courses.user_id).
  if (kind === "learning_path") return findCourseOwnerId(db, entityId);
  const lookup = await new ContentLocationOwnersRepository(db).findOwner(kind, entityId);
  return lookup?.found ? lookup.ownerId : null;
}

/** Resolve a self-taggable kind and confirm the caller owns the entity. */
async function requireOwnedEntity(userId: string, rawKind: string, entityId: string): Promise<ContentAudienceKind> {
  const kind = rawKind as ContentAudienceKind;
  if (!SELF_TAGGABLE_KINDS.has(kind)) throw new DomainError(400, "VALIDATION_ERROR", "kind not self-taggable");
  const owner = await findOwner(kind, entityId);
  if (!owner) throw new DomainError(404, "NOT_FOUND", "entity not found");
  if (owner !== userId) throw new DomainError(403, "FORBIDDEN", "not your content");
  return kind;
}

export interface OwnedContentAudiences {
  kind: ContentAudienceKind;
  entityId: string;
  audiences: ResolvedContentAudience[];
}

export async function getOwnedContentAudiences(userId: string, rawKind: string, entityId: string): Promise<OwnedContentAudiences> {
  const kind = await requireOwnedEntity(userId, rawKind, entityId);
  const audiences = await new AudienceService({ db: getDb() }).resolveForEntity(kind, entityId);
  return { kind, entityId, audiences };
}

/** Replace the entity's tag set, then return the resolved tags. */
export async function setOwnedContentAudiences(
  userId: string,
  rawKind: string,
  entityId: string,
  audiences: ContentAudienceInput[],
): Promise<OwnedContentAudiences> {
  const kind = await requireOwnedEntity(userId, rawKind, entityId);
  const service = new AudienceService({ db: getDb() });
  await service.saveAudiences(kind, entityId, audiences);
  return { kind, entityId, audiences: await service.resolveForEntity(kind, entityId) };
}
