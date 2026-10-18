/**
 * Voice-clone marketplace read use cases (owner list, usable library, public
 * catalog, creator profile tab, single listing). Owns the access rules —
 * owner / public / licensee, the #314 creator paywall, and hiding the raw
 * sample URL from anyone who hasn't licensed the voice. SQL lives in
 * repositories/voiceClonesRepository.ts.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { filterVisibleCreators, isCreatorVisible } from "../creators/visibility.js";
import {
  findMarketplaceVoiceClones,
  findVoiceCloneById,
  hasVoiceCloneLicense,
  listLicensedVoiceClones,
  listPublicVoiceClonesByCreator,
  listVoiceClonesOwnedBy,
  type VoiceCloneMarketplaceFilter,
  type VoiceCloneRow,
} from "../../repositories/voiceClonesRepository.js";

const notFound = () => new DomainError(404, "NOT_FOUND", "Voice clone not found");

/** The caller's own clones (owner view). */
export function listOwnVoiceClones(userId: string): Promise<VoiceCloneRow[]> {
  return listVoiceClonesOwnedBy(getDb(), userId);
}

/** Every clone the caller can synthesize with — only the synthesis-relevant
 *  fields. Sample URL is the load-bearing bit: the client fetches it as the
 *  VibeVoice reference. */
export async function listVoiceCloneLibrary(userId: string) {
  const rows = await listLicensedVoiceClones(getDb(), userId);
  return rows.map((r) => ({
    id: r.clone.id,
    name: r.clone.name,
    description: r.clone.description,
    sampleAudioUrl: r.clone.sampleAudioUrl,
    previewAudioUrl: r.clone.previewAudioUrl,
    language: r.clone.language,
    gender: r.clone.gender,
    accent: r.clone.accent,
    licenseSource: r.license.source,
    isOwner: r.clone.userId === userId,
  }));
}

/** Public catalog page — free creators' clones hidden (#314 paywall). */
export async function browseVoiceCloneMarketplace(filter: VoiceCloneMarketplaceFilter) {
  const { page, limit } = filter;
  const { rows, total } = await findMarketplaceVoiceClones(getDb(), filter);
  const visible = await filterVisibleCreators(rows.map((r) => r.creatorId));
  const items = rows.filter((r) => visible.has(r.creatorId));
  return {
    items,
    // `total` is the unfiltered count from `count(*)`; consumers showing
    // pagination chrome will see slight skips when a free creator's
    // listing is excluded from the page. Acceptable until we move the
    // visibility join into the SQL.
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    hasNextPage: page * limit < total,
    hasPreviousPage: page > 1,
  };
}

/** Public clones authored by `creatorId` (profile Voice tab). Hidden creators
 *  (#314 paywall) yield an empty list so the consumer renders an empty state. */
export async function listCreatorPublicVoiceClones(creatorId: string): Promise<{ items: unknown[] }> {
  if (!(await isCreatorVisible(creatorId))) return { items: [] };
  return { items: await listPublicVoiceClonesByCreator(getDb(), creatorId) };
}

/** Anonymous-readable public listing — SAFE projection; 404 on anything not
 *  public or whose creator is hidden by the #314 paywall. */
export async function getPublicVoiceClone(id: string) {
  const clone = await findVoiceCloneById(getDb(), id);
  if (!clone || clone.visibility !== "public") throw notFound();
  if (!(await isCreatorVisible(clone.userId))) throw notFound();
  return { ...clone, sampleAudioUrl: null, sampleAudioKey: null };
}

/** Single clone for owner / public / licensee; the raw sample URL is hidden
 *  from non-licensees so they can't bypass purchase. */
export async function getVoiceCloneForViewer(id: string, viewerId: string | undefined) {
  const db = getDb();
  const clone = await findVoiceCloneById(db, id);
  if (!clone) throw notFound();

  const isOwner = !!viewerId && clone.userId === viewerId;
  const isPublic = clone.visibility === "public";
  const isLicensee = viewerId ? await hasVoiceCloneLicense(db, viewerId, id) : false;

  if (!isOwner && !isPublic && !isLicensee) {
    throw new DomainError(403, "FORBIDDEN", "You do not have access to this voice");
  }
  return isOwner || isLicensee
    ? clone
    : { ...clone, sampleAudioUrl: null, sampleAudioKey: null };
}
