/**
 * ReferenceSharesRepository — NDA-gated reference packets (#1677). Thin
 * wrapper over shareLinksRepository (`share_links`, subject_type
 * 'reference_packet', subject = the owner's user id) keeping the legacy
 * reference_shares row shape the /api/references API returns.
 */
import * as shareLinks from "./shareLinksRepository.js";
import type { ShareLinkRow } from "./shareLinksRepository.js";

const KIND = "reference_packet";

export interface ReferenceShareRow {
  id: string;
  ownerUserId: string;
  token: string;
  sharedWithEmail: string;
  contactIds: string[];
  label: string | null;
  requireNda: boolean;
  ndaAcceptedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  firstViewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toReferenceShare(row: ShareLinkRow): ReferenceShareRow {
  return {
    id: row.id,
    ownerUserId: row.subjectId,
    token: row.shareToken,
    sharedWithEmail: row.recipientEmail ?? "",
    contactIds: row.contactIds ?? [],
    label: row.label,
    requireNda: row.requireNda ?? true,
    ndaAcceptedAt: row.ndaAcceptedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    firstViewedAt: row.firstViewedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The owner's shares, newest first. */
export async function listReferenceShares(ownerUserId: string): Promise<ReferenceShareRow[]> {
  return (await shareLinks.listShareLinks(KIND, { subjectId: ownerUserId })).map(toReferenceShare);
}

export async function insertReferenceShare(values: {
  ownerUserId: string;
  token: string;
  sharedWithEmail: string;
  contactIds: string[];
  label: string | null;
  requireNda: boolean;
  expiresAt: Date | null;
}): Promise<ReferenceShareRow> {
  return toReferenceShare(
    await shareLinks.insertShareLink(KIND, {
      subjectId: values.ownerUserId,
      createdBy: values.ownerUserId,
      shareToken: values.token,
      recipientEmail: values.sharedWithEmail,
      contactIds: values.contactIds,
      label: values.label,
      requireNda: values.requireNda,
      expiresAt: values.expiresAt,
    }),
  );
}

/** Revoke one of the owner's shares; null when it isn't theirs / doesn't exist. */
export async function revokeReferenceShare(id: string, ownerUserId: string): Promise<ReferenceShareRow | null> {
  const row = await shareLinks.updateShareLink(KIND, id, { revokedAt: new Date() }, { subjectId: ownerUserId });
  return row ? toReferenceShare(row) : null;
}

export async function findReferenceShareByToken(token: string): Promise<ReferenceShareRow | null> {
  const row = await shareLinks.findShareLinkByToken(KIND, token);
  return row ? toReferenceShare(row) : null;
}

/** Stamp the recipient's first open (kept on later opens). */
export async function recordReferenceShareView(id: string): Promise<void> {
  await shareLinks.recordShareLinkView(id);
}

export async function markReferenceShareNdaAccepted(id: string): Promise<void> {
  await shareLinks.updateShareLink(KIND, id, { ndaAcceptedAt: new Date() });
}
