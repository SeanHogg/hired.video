/**
 * Pitch-deck share use cases (agency recruiting, gap #99): tokenized share
 * links for a deck, and the unauthenticated reviewer view that renders
 * every slide with its redaction (per-slide override, else the deck's
 * default profile) and the deck's brand overlay.
 */
import * as repo from "../../repositories/pitchDecksRepository.js";
import type { PitchDeckShareRow } from "../../repositories/pitchDecksRepository.js";
import { findCandidateResumesByIds } from "../../repositories/candidateResumesRepository.js";
import { findRedactionProfileById, findRedactionProfilesByIds } from "../../repositories/redactionProfilesRepository.js";
import { findPublicBrand } from "../../repositories/recruitBrandingRepository.js";
import { applyRedaction } from "../resume/redaction.js";
import { randomHex } from "../../utils/crypto.js";
import { isShareLive, notFound, rulesFromProfile } from "./access.js";
import { assertDeckAccess, requireAccessibleDeck } from "./pitchDecksService.js";
import type { CreateDeckShareInput, UpdateDeckShareInput } from "./schemas.js";

const SHARE_NOT_FOUND = "Share not found";
const PUBLIC_NOT_FOUND = "Deck not found";

export async function listPitchDeckShares(userId: string, deckId: string): Promise<PitchDeckShareRow[]> {
  await requireAccessibleDeck(userId, deckId);
  return repo.listPitchDeckShares(deckId);
}

export async function createPitchDeckShare(
  userId: string,
  deckId: string,
  input: CreateDeckShareInput,
): Promise<PitchDeckShareRow> {
  await requireAccessibleDeck(userId, deckId);
  return repo.insertPitchDeckShare({
    deckId,
    sharedByUserId: userId,
    shareToken: randomHex(16),
    recipientName: input.recipientName ?? null,
    recipientEmail: input.recipientEmail ?? null,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
  });
}

/** The share (404), after a tenancy check on its deck (403). */
async function requireAccessibleShare(userId: string, shareId: string): Promise<PitchDeckShareRow> {
  const share = await repo.findPitchDeckShareById(shareId);
  if (!share) throw notFound(SHARE_NOT_FOUND);
  await assertDeckAccess(userId, share.deckId);
  return share;
}

export async function updatePitchDeckShare(
  userId: string,
  shareId: string,
  input: UpdateDeckShareInput,
): Promise<PitchDeckShareRow | null> {
  await requireAccessibleShare(userId, shareId);
  return repo.updatePitchDeckShare(shareId, {
    ...(input.recipientName !== undefined && { recipientName: input.recipientName }),
    ...(input.recipientEmail !== undefined && { recipientEmail: input.recipientEmail }),
    ...(input.expiresAt !== undefined && {
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    }),
    ...(input.isActive !== undefined && { isActive: input.isActive }),
  });
}

export async function revokePitchDeckShare(userId: string, shareId: string): Promise<{ revoked: true }> {
  await requireAccessibleShare(userId, shareId);
  await repo.deletePitchDeckShare(shareId);
  return { revoked: true };
}

/**
 * GET /api/public/pitch-deck/:token — the deck with every slide redacted.
 * Fails closed (inactive / expired / missing → the same 404). Résumés and
 * per-slide profile overrides are bulk-loaded (O(1) round-trips, not
 * O(slides)); the view counter is bumped fire-and-forget.
 */
export async function viewSharedPitchDeck(token: string) {
  if (!token) throw notFound(PUBLIC_NOT_FOUND);
  const share = await repo.findPitchDeckShareByToken(token);
  if (!share || !isShareLive(share)) throw notFound(PUBLIC_NOT_FOUND);

  const deck = await repo.findPitchDeckById(share.deckId);
  if (!deck) throw notFound(PUBLIC_NOT_FOUND);

  const [brand, defaultProfile] = await Promise.all([
    findPublicBrand(deck.whitelabelTenantId),
    deck.redactionProfileId ? findRedactionProfileById(deck.redactionProfileId) : Promise.resolve(null),
  ]);

  const slides = await repo.listPitchDeckSlides(deck.id);
  const overrideProfileIds = slides
    .map((s) => s.redactionProfileId)
    .filter((id): id is string => Boolean(id));
  const [resumeRows, overrideProfiles] = await Promise.all([
    findCandidateResumesByIds(slides.map((s) => s.candidateResumeId)),
    findRedactionProfilesByIds(overrideProfileIds),
  ]);
  const resumesById = new Map(resumeRows.map((r) => [r.id, r]));
  const profilesById = new Map(overrideProfiles.map((p) => [p.id, p]));

  const rendered = slides
    .map((slide) => {
      const resume = resumesById.get(slide.candidateResumeId);
      if (!resume) return null;
      const rules = slide.redactionProfileId
        ? rulesFromProfile(profilesById.get(slide.redactionProfileId) ?? null)
        : rulesFromProfile(defaultProfile);
      return {
        id: slide.id,
        displayOrder: slide.displayOrder,
        fitSummary: slide.fitSummary,
        matchScore: slide.matchScore,
        recruiterNotes: slide.recruiterNotes,
        content: applyRedaction(resume.content, rules),
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  repo.recordPitchDeckShareView(share.id).catch(() => {});

  return {
    deck: {
      id: deck.id,
      name: deck.name,
      description: deck.description,
      jobId: deck.jobId,
      createdAt: deck.createdAt,
    },
    brand,
    slides: rendered,
  };
}
