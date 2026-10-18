/**
 * Reference management use cases (#1677) behind /api/references: owner CRUD
 * on reference contacts, the public non-PII summaries, and the NDA-gated,
 * revocable share packets. Throws DomainError (404 / 400) — the global
 * handler maps it onto the error envelope.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { getOrSetIsolateCached } from "../../utils/isolate-cache.js";
import {
  invalidatePublicReferences,
  publicReferencesCacheKey,
} from "../profile/public-references-cache.js";
import { syncLinkedReferences } from "../resume/linked-references.js";
import * as contacts from "../../repositories/referenceContactsRepository.js";
import type {
  ReferenceContactFields,
  ReferenceContactRow,
  ReferenceContactSummary,
} from "../../repositories/referenceContactsRepository.js";
import {
  findReferenceShareByToken,
  insertReferenceShare,
  listReferenceShares,
  markReferenceShareNdaAccepted,
  recordReferenceShareView,
  revokeReferenceShare,
  type ReferenceShareRow,
} from "../../repositories/referenceSharesRepository.js";
import { findRoleAndProfileSections } from "../../repositories/usersProfileRepository.js";
import {
  isProfileSectionVisible,
  type StoredProfileSections,
} from "../../../../shared/profile-sections.js";

export interface ContactInput {
  name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  relationship?: string;
  notes?: string;
}

export interface ShareInput {
  contactIds: string[];
  sharedWithEmail: string;
  label?: string;
  requireNda?: boolean;
  expiresInDays?: number;
}

export interface SharedPacketView {
  label: string | null;
  requireNda: boolean;
  unlocked: boolean;
  contacts: ReferenceContactRow[];
}

const contactNotFound = () => new DomainError(404, "NOT_FOUND", "contact not found");
const shareUnavailable = () => new DomainError(404, "NOT_FOUND", "this reference link is no longer available");

function newToken(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}

// ── Owner: contacts ────────────────────────────────────────────────────

export function listContacts(ownerUserId: string): Promise<ReferenceContactRow[]> {
  return contacts.listReferenceContacts(ownerUserId);
}

export async function createContact(
  ownerUserId: string,
  d: ContactInput & { name: string },
): Promise<ReferenceContactRow> {
  const row = await contacts.insertReferenceContact(ownerUserId, {
    name: d.name,
    title: d.title ?? null,
    company: d.company ?? null,
    email: d.email || null,
    phone: d.phone ?? null,
    relationship: d.relationship ?? null,
    notes: d.notes ?? null,
  });
  invalidatePublicReferences(ownerUserId);
  return row;
}

export async function updateContact(
  ownerUserId: string,
  id: string,
  body: ContactInput,
): Promise<ReferenceContactRow> {
  // The contact as it was: the live-link sweep refreshes only résumé items
  // still showing this text and unlinks hand-edited ones (#2258).
  const previous = await contacts.findOwnedReferenceContactSnapshot(ownerUserId, id);
  if (!previous) throw contactNotFound();
  // A partial update that omits `email` keeps it; only an explicit "" clears it.
  const patch: ReferenceContactFields = {
    ...body,
    ...(body.email !== undefined ? { email: body.email || null } : {}),
  };
  const row = await contacts.updateOwnedReferenceContact(ownerUserId, id, patch);
  if (!row) throw contactNotFound();
  invalidatePublicReferences(ownerUserId);
  // Live link (#2258): every résumé item pulled from this contact now shows it.
  await syncLinkedReferences(getDb(), ownerUserId, row, previous);
  return row;
}

export async function deleteContact(ownerUserId: string, id: string): Promise<void> {
  await contacts.deleteOwnedReferenceContact(ownerUserId, id);
  invalidatePublicReferences(ownerUserId);
}

// ── Public: profile reference summaries ────────────────────────────────

/**
 * Non-PII summaries for the user's profile References section — empty unless
 * the owner opted the `references` section in. Isolate-cached (60s — short,
 * because a hidden section must stop showing promptly in OTHER isolates
 * too), invalidated here on every contact mutation / section / role change.
 */
export function listPublicSummaries(userId: string): Promise<ReferenceContactSummary[]> {
  return getOrSetIsolateCached({
    key: publicReferencesCacheKey(userId),
    ttlSeconds: 60,
    loader: async () => {
      const owner = await findRoleAndProfileSections(userId);
      if (!owner) return [];
      const visible = isProfileSectionVisible(
        (owner.sections ?? null) as StoredProfileSections | null,
        owner.role,
        "references",
      );
      if (!visible) return [];
      return contacts.listReferenceContactSummaries(userId);
    },
  });
}

// ── Owner: shares ──────────────────────────────────────────────────────

export function listShares(ownerUserId: string): Promise<ReferenceShareRow[]> {
  return listReferenceShares(ownerUserId);
}

export async function createShare(ownerUserId: string, d: ShareInput): Promise<ReferenceShareRow> {
  // Confirm every contact belongs to the owner — never let a share grant
  // someone else's contacts.
  const ownedCount = await contacts.countOwnedReferenceContacts(ownerUserId, d.contactIds);
  if (ownedCount !== d.contactIds.length) {
    throw new DomainError(400, "VALIDATION_ERROR", "one or more contacts not found");
  }
  const expiresAt = d.expiresInDays ? new Date(Date.now() + d.expiresInDays * 86400_000) : null;
  return insertReferenceShare({
    ownerUserId,
    token: newToken(),
    sharedWithEmail: d.sharedWithEmail,
    contactIds: d.contactIds,
    label: d.label ?? null,
    requireNda: d.requireNda ?? true,
    expiresAt,
  });
}

export async function revokeShare(ownerUserId: string, id: string): Promise<ReferenceShareRow> {
  const row = await revokeReferenceShare(id, ownerUserId);
  if (!row) throw new DomainError(404, "NOT_FOUND", "share not found");
  return row;
}

// ── Recipient: public token view ───────────────────────────────────────

/** The share when reachable (not revoked, not expired), else a 404. */
async function reachableShare(token: string): Promise<ReferenceShareRow> {
  const share = await findReferenceShareByToken(token);
  if (!share || share.revokedAt) throw shareUnavailable();
  if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) throw shareUnavailable();
  return share;
}

/** Open a shared packet: metadata, plus the contacts once unlocked. */
export async function openSharedPacket(token: string): Promise<SharedPacketView> {
  const share = await reachableShare(token);
  const unlocked = !share.requireNda || !!share.ndaAcceptedAt;
  // Stamp first-view for the owner's audit trail.
  if (!share.firstViewedAt) await recordReferenceShareView(share.id);
  return {
    label: share.label,
    requireNda: share.requireNda,
    unlocked,
    contacts: unlocked ? await contacts.findReferenceContactsByIds(share.contactIds) : [],
  };
}

/** Accept the NDA (idempotent) and return the unlocked packet. */
export async function acceptSharedPacketNda(token: string): Promise<SharedPacketView> {
  const share = await reachableShare(token);
  if (!share.ndaAcceptedAt) await markReferenceShareNdaAccepted(share.id);
  return {
    label: share.label,
    requireNda: share.requireNda,
    unlocked: true,
    contacts: await contacts.findReferenceContactsByIds(share.contactIds),
  };
}
