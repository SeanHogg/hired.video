/**
 * Voice-clone marketplace write use cases (create, edit/publish, claim,
 * checkout pre-flight, play counter, delete, cart checkout, purchase grant).
 * Owns storage side effects, consent/publish rules and the fee split; SQL lives
 * in repositories/voiceClonesRepository.ts (+ the batch license helpers in
 * studioFeaturesRepository.ts). Read use cases live in ./voice-clones.ts.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { bumpSearchVersion } from "../../utils/search-cache.js";
import { cdnUrl } from "../../utils/cdn.js";
import { slugify } from "../../../../shared/slugify.js";
import { deleteR2Keys } from "../storage/r2-delete.js";
import { putObject } from "../storage/object-store.js";
import { findLicensedVoiceCloneIds, grantFreeVoiceCloneLicenses } from "../../repositories/studioFeaturesRepository.js";
import {
  deleteOwnedVoiceClone,
  deleteVoiceCloneLicensesFor,
  findOwnedVoiceClone,
  findVoiceCloneById,
  findVoiceClonesByIds,
  hasVoiceCloneLicense,
  incrementVoiceClonePlayCount,
  incrementVoiceClonePurchaseCount,
  insertVoiceClone,
  insertVoiceCloneLicense,
  updateOwnedVoiceClone,
  type VoiceCloneInsert,
  type VoiceCloneRow,
} from "../../repositories/voiceClonesRepository.js";
import { UsersRepository } from "../../repositories/usersRepository.js";
import { PLATFORM_FEE_BPS_DEFAULT } from "../../routes/studio-features/voice-clone-shared.js";

/**
 * The platform fee bps to snapshot onto a listing for `userId` (#157): the
 * superadmin per-creator override, else `PLATFORM_FEE_BPS_DEFAULT`. Existing
 * listings keep their stored `platform_fee_bps`.
 */
async function resolveCreatorFeeBps(userId: string): Promise<number> {
  const override = await new UsersRepository(getDb()).findCreatorPlatformFeeBpsOverride(userId);
  return override ?? PLATFORM_FEE_BPS_DEFAULT;
}

export interface CreateVoiceCloneInput {
  name: string;
  description: string | null;
  language: string | null;
  gender: string | null;
  accent: string | null;
  audio: { bytes: ArrayBuffer; type: string };
}

/** Upload the reference sample, create a private clone and self-license it. */
export async function createVoiceClone(userId: string, input: CreateVoiceCloneInput): Promise<VoiceCloneRow> {
  const db = getDb();
  const id = crypto.randomUUID();

  const ext = (input.audio.type.split("/")[1] || "webm").replace(/[^a-z0-9]/gi, "");
  const sampleKey = `studio/voice-clones/${userId}/${id}.${ext}`;
  const uploaded = await putObject(sampleKey, input.audio.bytes, input.audio.type || "audio/webm", { userId, cloneId: id });
  if (!uploaded) throw new DomainError(503, "STORAGE_UNAVAILABLE", "Failed to store voice sample");

  const clone = await insertVoiceClone(db, {
    id,
    userId,
    name: input.name,
    description: input.description,
    sampleAudioUrl: cdnUrl(sampleKey),
    sampleAudioKey: sampleKey,
    language: input.language,
    gender: input.gender,
    accent: input.accent,
    visibility: "private",
    status: "ready",
  });

  // Auto-grant the owner a usage license so they can use their own voice.
  await insertVoiceCloneLicense(db, { userId, voiceCloneId: clone.id, source: "owner" });

  bumpSearchVersion();
  return clone;
}

export interface UpdateVoiceCloneInput {
  name?: string;
  description?: string | null;
  language?: string | null;
  gender?: string | null;
  accent?: string | null;
  visibility?: "private" | "unlisted" | "public";
  priceCents?: number;
  currency?: string;
  consentAccepted?: boolean;
  previewAudioBase64?: string;
  previewAudioMime?: string;
}

export interface ConsentRequestMeta {
  ip: string | null;
  userAgent: string | null;
}

/** Edit metadata, publish/unpublish (consent on first publish) and set price. */
export async function updateVoiceClone(
  userId: string,
  id: string,
  body: UpdateVoiceCloneInput,
  meta: ConsentRequestMeta,
): Promise<VoiceCloneRow | null> {
  const db = getDb();
  const existing = await findOwnedVoiceClone(db, id, userId);
  if (!existing) throw new DomainError(404, "NOT_FOUND", "Voice clone not found");

  const patch: Partial<VoiceCloneInsert> = { updatedAt: new Date() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  if (body.language !== undefined) patch.language = body.language;
  if (body.gender !== undefined) patch.gender = body.gender;
  if (body.accent !== undefined) patch.accent = body.accent;
  if (body.priceCents !== undefined) patch.priceCents = body.priceCents;
  if (body.currency !== undefined) patch.currency = body.currency;

  // Visibility transition: enforce consent on first publish.
  if (body.visibility !== undefined && body.visibility !== existing.visibility) {
    if (body.visibility === "public") {
      if (!body.consentAccepted && !existing.consentAgreedAt) {
        throw new DomainError(400, "CONSENT_REQUIRED", "You must accept the voice marketplace creator terms before publishing.");
      }
      if (body.consentAccepted && !existing.consentAgreedAt) {
        patch.consentAgreedAt = new Date();
        patch.consentIp = meta.ip;
        patch.consentUa = meta.userAgent;
      }
      // Generate slug on first publish.
      if (!existing.listingSlug) {
        patch.listingSlug = `${slugify(body.name ?? existing.name, { fallback: "voice" })}-${id.slice(0, 6)}`;
      }
      patch.platformFeeBps = existing.platformFeeBps ?? (await resolveCreatorFeeBps(userId));
    }
    patch.visibility = body.visibility;
  }

  // Optional preview audio upload (client renders a short sample with Kokoro/
  // VibeVoice and uploads it base64 so the marketplace catalog has audio).
  if (body.previewAudioBase64) {
    const mime = body.previewAudioMime || "audio/wav";
    const ext = mime.split("/")[1] || "wav";
    const previewKey = `studio/voice-clones/${userId}/${id}-preview.${ext}`;
    const buf = Uint8Array.from(atob(body.previewAudioBase64), (ch) => ch.charCodeAt(0)).buffer;
    if (await putObject(previewKey, buf, mime)) {
      // Reclaim the previous preview if the new key replaces (rather than
      // overwrites) it — different mimes write to different extensions.
      if (existing.previewAudioKey && existing.previewAudioKey !== previewKey) {
        await deleteR2Keys([existing.previewAudioKey]);
      }
      patch.previewAudioUrl = cdnUrl(previewKey);
      patch.previewAudioKey = previewKey;
    }
  }

  const updated = await updateOwnedVoiceClone(db, id, userId, patch);
  bumpSearchVersion();
  return updated;
}

/** A public listing or the matching DomainError (claim/checkout share these). */
async function requirePublicListing(id: string): Promise<VoiceCloneRow> {
  const clone = await findVoiceCloneById(getDb(), id);
  if (!clone) throw new DomainError(404, "NOT_FOUND", "Voice not found");
  if (clone.visibility !== "public") throw new DomainError(403, "FORBIDDEN", "Voice is not publicly listed");
  return clone;
}

/** Claim a free public listing. */
export async function claimFreeVoiceClone(userId: string, id: string): Promise<void> {
  const clone = await requirePublicListing(id);
  if (clone.priceCents > 0) throw new DomainError(402, "PAYMENT_REQUIRED", "This voice requires purchase");
  await insertVoiceCloneLicense(getDb(), { userId, voiceCloneId: id, source: "free" });
}

/** Validate a paid listing and return its cart line item. */
export async function buildVoiceCloneCartLine(userId: string, id: string) {
  const clone = await requirePublicListing(id);
  if (clone.userId === userId) throw new DomainError(409, "ALREADY_OWNED", "You already own this voice");
  if (await hasVoiceCloneLicense(getDb(), userId, id)) {
    throw new DomainError(409, "ALREADY_LICENSED", "You already have a license for this voice");
  }
  return {
    type: "voice_clone",
    voiceCloneId: clone.id,
    name: clone.name,
    priceCents: clone.priceCents,
    currency: clone.currency,
    creatorId: clone.userId,
    platformFeeBps: clone.platformFeeBps,
  };
}

export function recordVoiceClonePlay(id: string): Promise<void> {
  return incrementVoiceClonePlayCount(getDb(), id);
}

/** Owner-only delete: row, its licenses and both R2 audio objects. */
export async function deleteVoiceClone(userId: string, cloneId: string): Promise<void> {
  const db = getDb();
  const deleted = await deleteOwnedVoiceClone(db, cloneId, userId);
  if (!deleted) throw new DomainError(404, "NOT_FOUND", "Voice clone not found");
  await deleteVoiceCloneLicensesFor(db, cloneId);
  // Without this, every deleted clone leaks two objects (sample + preview).
  await deleteR2Keys([deleted.sampleAudioKey, deleted.previewAudioKey]);
  bumpSearchVersion();
}

export interface VoiceCloneCartInput {
  items: Array<{ voiceCloneId: string; expectedPriceCents: number }>;
  paymentRef?: string;
}

/** Validate every cart line against the live listing, then grant licenses. */
export async function checkoutVoiceCloneCart(userId: string, body: VoiceCloneCartInput) {
  const db = getDb();
  const ids = body.items.map((i) => i.voiceCloneId);
  const listings = await findVoiceClonesByIds(db, ids);
  const byId = new Map(listings.map((l) => [l.id, l]));

  // Existing licenses for the whole cart in ONE query.
  const alreadyLicensed = await findLicensedVoiceCloneIds(db, userId, ids);

  let paidTotal = 0;
  for (const item of body.items) {
    const clone = byId.get(item.voiceCloneId);
    if (!clone) throw new DomainError(404, "NOT_FOUND", `Voice ${item.voiceCloneId} not found`);
    if (clone.visibility !== "public") throw new DomainError(403, "FORBIDDEN", `Voice ${clone.name} is no longer listed`);
    if (clone.userId === userId) throw new DomainError(409, "ALREADY_OWNED", `You own ${clone.name}`);
    if (clone.priceCents !== item.expectedPriceCents) {
      throw new DomainError(409, "PRICE_CHANGED", `Price changed for ${clone.name}`, { current: clone.priceCents });
    }
    if (alreadyLicensed.has(clone.id)) throw new DomainError(409, "ALREADY_LICENSED", `You already own ${clone.name}`);
    paidTotal += clone.priceCents;
  }

  // Paid carts must come with a provider charge reference.
  if (paidTotal > 0 && !body.paymentRef) {
    throw new DomainError(402, "PAYMENT_REQUIRED", "paymentRef required for paid items");
  }

  // Free items: one multi-row insert for the whole cart.
  const freeIds = body.items
    .map((item) => byId.get(item.voiceCloneId)!)
    .filter((clone) => clone.priceCents === 0)
    .map((clone) => clone.id);
  await grantFreeVoiceCloneLicenses(db, userId, freeIds);

  const granted: Array<{ voiceCloneId: string; source: string }> = [];
  for (const item of body.items) {
    const clone = byId.get(item.voiceCloneId)!;
    if (clone.priceCents === 0) {
      granted.push({ voiceCloneId: clone.id, source: "free" });
    } else {
      await grantVoiceClonePurchaseLicense(clone.id, userId, clone.priceCents, body.paymentRef!);
      granted.push({ voiceCloneId: clone.id, source: "purchase" });
    }
  }
  return { granted };
}

/**
 * Grants a license to `userId` on a successful purchase (also the payment
 * webhook's grant path), splits the payment into creator/platform cuts from the
 * listing's `platformFeeBps`, and bumps `purchase_count`. Idempotent on
 * (user_id, voice_clone_id).
 */
export async function grantVoiceClonePurchaseLicense(
  voiceCloneId: string,
  userId: string,
  pricePaidCents: number,
  paymentRef: string,
): Promise<void> {
  const db = getDb();
  const clone = await findVoiceCloneById(db, voiceCloneId);
  if (!clone) return;
  const feeBps = clone.platformFeeBps ?? PLATFORM_FEE_BPS_DEFAULT;
  const platformCut = Math.round((pricePaidCents * feeBps) / 10_000);
  const creatorCut = pricePaidCents - platformCut;

  await insertVoiceCloneLicense(db, {
    userId,
    voiceCloneId,
    source: "purchase",
    pricePaidCents,
    creatorCutCents: creatorCut,
    platformCutCents: platformCut,
    paymentRef,
  });
  await incrementVoiceClonePurchaseCount(db, voiceCloneId);
}
