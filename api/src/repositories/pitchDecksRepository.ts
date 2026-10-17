/**
 * PitchDecksRepository — recruiter-authored decks of redacted/branded
 * candidates (gap #99): `pitch_decks`, their ordered slides
 * (`pitch_deck_candidates`) and tokenized share links (`share_links`).
 *
 * Not to be confused with pitchRepository.ts (a candidate's own "current
 * video pitch"). Company scoping is the caller's job (services/recruit/*).
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import * as shareLinks from "./shareLinksRepository.js";
import type { ShareLinkPatch, ShareLinkRow } from "./shareLinksRepository.js";

const { pitchDecks, pitchDeckCandidates } = schema;

export type PitchDeckRow = typeof pitchDecks.$inferSelect;
export type PitchDeckInsert = typeof pitchDecks.$inferInsert;
export type PitchDeckSlideRow = typeof pitchDeckCandidates.$inferSelect;
export type PitchDeckSlideInsert = typeof pitchDeckCandidates.$inferInsert;

// ── decks ────────────────────────────────────────────────────────────────────

/** Decks of one company (when `companyId` is set) or of every company in
 *  `companyIds`, most recently updated first. */
export async function listPitchDecks(filter: { companyId?: string; companyIds: string[] }): Promise<PitchDeckRow[]> {
  return getDb()
    .select()
    .from(pitchDecks)
    .where(
      filter.companyId
        ? eq(pitchDecks.companyId, filter.companyId)
        : inArray(pitchDecks.companyId, filter.companyIds),
    )
    .orderBy(desc(pitchDecks.updatedAt));
}

export async function findPitchDeckById(id: string): Promise<PitchDeckRow | null> {
  const [row] = await getDb().select().from(pitchDecks).where(eq(pitchDecks.id, id)).limit(1);
  return row ?? null;
}

export async function insertPitchDeck(values: PitchDeckInsert): Promise<PitchDeckRow> {
  const [row] = await getDb().insert(pitchDecks).values(values).returning();
  return row;
}

export async function updatePitchDeck(id: string, patch: Partial<PitchDeckInsert>): Promise<PitchDeckRow | null> {
  const [row] = await getDb()
    .update(pitchDecks)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(pitchDecks.id, id))
    .returning();
  return row ?? null;
}

export async function deletePitchDeck(id: string): Promise<void> {
  await getDb().delete(pitchDecks).where(eq(pitchDecks.id, id));
}

// ── slides ───────────────────────────────────────────────────────────────────

/** A deck's slides in display order. */
export async function listPitchDeckSlides(deckId: string): Promise<PitchDeckSlideRow[]> {
  return getDb()
    .select()
    .from(pitchDeckCandidates)
    .where(eq(pitchDeckCandidates.deckId, deckId))
    .orderBy(asc(pitchDeckCandidates.displayOrder));
}

/** The slide, only when it belongs to `deckId`. */
export async function findPitchDeckSlide(slideId: string, deckId: string): Promise<PitchDeckSlideRow | null> {
  const [row] = await getDb()
    .select()
    .from(pitchDeckCandidates)
    .where(and(eq(pitchDeckCandidates.id, slideId), eq(pitchDeckCandidates.deckId, deckId)))
    .limit(1);
  return row ?? null;
}

export async function insertPitchDeckSlide(values: PitchDeckSlideInsert): Promise<PitchDeckSlideRow> {
  const [row] = await getDb().insert(pitchDeckCandidates).values(values).returning();
  return row;
}

export async function updatePitchDeckSlide(
  slideId: string,
  patch: Partial<PitchDeckSlideInsert>,
): Promise<PitchDeckSlideRow | null> {
  const [row] = await getDb()
    .update(pitchDeckCandidates)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(pitchDeckCandidates.id, slideId))
    .returning();
  return row ?? null;
}

export async function deletePitchDeckSlide(slideId: string): Promise<void> {
  await getDb().delete(pitchDeckCandidates).where(eq(pitchDeckCandidates.id, slideId));
}

// ── shares ───────────────────────────────────────────────────────────────────
// Thin wrapper over shareLinksRepository (`share_links`, subject_type
// 'pitch_deck', subject = the deck) keeping the legacy row shape the
// /api/recruit/pitch-decks/*/shares API returns.

const SHARE_KIND = "pitch_deck";

export interface PitchDeckShareRow {
  id: string;
  deckId: string;
  sharedByUserId: string | null;
  shareToken: string;
  recipientName: string | null;
  recipientEmail: string | null;
  expiresAt: Date | null;
  isActive: boolean;
  viewCount: number;
  lastViewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PitchDeckShareInsert {
  deckId: string;
  sharedByUserId: string;
  shareToken: string;
  recipientName: string | null;
  recipientEmail: string | null;
  expiresAt: Date | null;
}

export type PitchDeckSharePatch = Partial<
  Pick<PitchDeckShareRow, "recipientName" | "recipientEmail" | "expiresAt" | "isActive">
>;

function toDeckShare(row: ShareLinkRow): PitchDeckShareRow {
  return {
    id: row.id,
    deckId: row.subjectId,
    sharedByUserId: row.createdBy,
    shareToken: row.shareToken,
    recipientName: row.recipientName,
    recipientEmail: row.recipientEmail,
    expiresAt: row.expiresAt,
    isActive: row.revokedAt === null,
    viewCount: row.viewCount,
    lastViewedAt: row.lastViewedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const toDeckShareOrNull = (row: ShareLinkRow | null) => (row ? toDeckShare(row) : null);

/** A deck's share links, newest first. */
export async function listPitchDeckShares(deckId: string): Promise<PitchDeckShareRow[]> {
  return (await shareLinks.listShareLinks(SHARE_KIND, { subjectId: deckId })).map(toDeckShare);
}

export async function findPitchDeckShareById(id: string): Promise<PitchDeckShareRow | null> {
  return toDeckShareOrNull(await shareLinks.findShareLinkById(SHARE_KIND, id));
}

export async function findPitchDeckShareByToken(token: string): Promise<PitchDeckShareRow | null> {
  return toDeckShareOrNull(await shareLinks.findShareLinkByToken(SHARE_KIND, token));
}

export async function insertPitchDeckShare(values: PitchDeckShareInsert): Promise<PitchDeckShareRow> {
  return toDeckShare(
    await shareLinks.insertShareLink(SHARE_KIND, {
      subjectId: values.deckId,
      createdBy: values.sharedByUserId,
      shareToken: values.shareToken,
      recipientName: values.recipientName,
      recipientEmail: values.recipientEmail,
      expiresAt: values.expiresAt,
    }),
  );
}

export async function updatePitchDeckShare(
  id: string,
  patch: PitchDeckSharePatch,
): Promise<PitchDeckShareRow | null> {
  const values: ShareLinkPatch = {};
  if (patch.recipientName !== undefined) values.recipientName = patch.recipientName;
  if (patch.recipientEmail !== undefined) values.recipientEmail = patch.recipientEmail;
  if (patch.expiresAt !== undefined) values.expiresAt = patch.expiresAt;
  if (patch.isActive !== undefined) values.revokedAt = shareLinks.revokedAtFor(patch.isActive);
  return toDeckShareOrNull(await shareLinks.updateShareLink(SHARE_KIND, id, values));
}

export async function deletePitchDeckShare(id: string): Promise<void> {
  await shareLinks.deleteShareLink(SHARE_KIND, id);
}

/** Record one public view. */
export async function recordPitchDeckShareView(id: string): Promise<void> {
  await shareLinks.recordShareLinkView(id);
}
