/**
 * Pitch-deck use cases (agency recruiting, gap #99): recruiter-authored
 * decks of redacted/branded candidates and their ordered slides. Every
 * use case enforces company tenancy and throws DomainError on failure.
 */
import { DomainError } from "../../domains/errors.js";
import * as repo from "../../repositories/pitchDecksRepository.js";
import type { PitchDeckRow, PitchDeckSlideRow } from "../../repositories/pitchDecksRepository.js";
import { findCandidateResumeById } from "../../repositories/candidateResumesRepository.js";
import { userCanAccessCompany } from "../company/scope.js";
import { assertCompanyAccess, definedFields, forbidden, notFound, requireCompanyRow, resolveListScope } from "./access.js";
import type { AddSlideInput, CreateDeckInput, UpdateDeckInput, UpdateSlideInput } from "./schemas.js";

export const DECK_NOT_FOUND = "Pitch deck not found";
const SLIDE_NOT_FOUND = "Slide not found";

/** The deck (404) after a company-access check (403). */
export async function requireAccessibleDeck(userId: string, deckId: string): Promise<PitchDeckRow> {
  return requireCompanyRow(userId, await repo.findPitchDeckById(deckId), DECK_NOT_FOUND);
}

/** 403 when the deck is gone or outside the caller's companies (used once a
 *  child row — slide / share — has already been found). */
export async function assertDeckAccess(userId: string, deckId: string): Promise<void> {
  const deck = await repo.findPitchDeckById(deckId);
  if (!deck || !(await userCanAccessCompany(userId, deck.companyId))) throw forbidden();
}

// ── decks ────────────────────────────────────────────────────────────────────

export async function listPitchDecks(userId: string, companyIdFilter: string | undefined): Promise<PitchDeckRow[]> {
  const scope = await resolveListScope(userId, companyIdFilter);
  if (!scope) return [];
  return repo.listPitchDecks(scope);
}

export async function getPitchDeck(
  userId: string,
  deckId: string,
): Promise<PitchDeckRow & { slides: PitchDeckSlideRow[] }> {
  const deck = await requireAccessibleDeck(userId, deckId);
  const slides = await repo.listPitchDeckSlides(deck.id);
  return { ...deck, slides };
}

export async function createPitchDeck(userId: string, input: CreateDeckInput): Promise<PitchDeckRow> {
  await assertCompanyAccess(userId, input.companyId);
  return repo.insertPitchDeck({
    companyId: input.companyId,
    createdByUserId: userId,
    name: input.name,
    description: input.description ?? null,
    jobId: input.jobId ?? null,
    whitelabelTenantId: input.whitelabelTenantId ?? null,
    redactionProfileId: input.redactionProfileId ?? null,
    status: input.status ?? "draft",
  });
}

export async function updatePitchDeck(
  userId: string,
  deckId: string,
  input: UpdateDeckInput,
): Promise<PitchDeckRow | null> {
  await requireAccessibleDeck(userId, deckId);
  return repo.updatePitchDeck(deckId, definedFields(input));
}

export async function deletePitchDeck(userId: string, deckId: string): Promise<{ deleted: true }> {
  await requireAccessibleDeck(userId, deckId);
  await repo.deletePitchDeck(deckId);
  return { deleted: true };
}

// ── slides ───────────────────────────────────────────────────────────────────

export async function addPitchDeckSlide(
  userId: string,
  deckId: string,
  input: AddSlideInput,
): Promise<PitchDeckSlideRow> {
  const deck = await requireAccessibleDeck(userId, deckId);

  // The candidate résumé must belong to the deck's company (prevents
  // cross-tenant leaks via a mismatched slide).
  const resume = await findCandidateResumeById(input.candidateResumeId);
  if (!resume || resume.companyId !== deck.companyId) {
    throw new DomainError(400, "VALIDATION_ERROR", "candidateResumeId must belong to the deck's company");
  }

  return repo.insertPitchDeckSlide({
    deckId,
    candidateResumeId: input.candidateResumeId,
    displayOrder: input.displayOrder ?? 0,
    redactionProfileId: input.redactionProfileId ?? null,
    fitSummary: input.fitSummary ?? null,
    matchScore: input.matchScore ?? null,
    recruiterNotes: input.recruiterNotes ?? null,
  });
}

/** The slide in this deck (404), after a deck-tenancy check (403). */
async function requireAccessibleSlide(userId: string, deckId: string, slideId: string): Promise<PitchDeckSlideRow> {
  const slide = await repo.findPitchDeckSlide(slideId, deckId);
  if (!slide) throw notFound(SLIDE_NOT_FOUND);
  await assertDeckAccess(userId, slide.deckId);
  return slide;
}

export async function updatePitchDeckSlide(
  userId: string,
  deckId: string,
  slideId: string,
  input: UpdateSlideInput,
): Promise<PitchDeckSlideRow | null> {
  await requireAccessibleSlide(userId, deckId, slideId);
  return repo.updatePitchDeckSlide(slideId, definedFields(input));
}

export async function deletePitchDeckSlide(
  userId: string,
  deckId: string,
  slideId: string,
): Promise<{ deleted: true }> {
  await requireAccessibleSlide(userId, deckId, slideId);
  await repo.deletePitchDeckSlide(slideId);
  return { deleted: true };
}
