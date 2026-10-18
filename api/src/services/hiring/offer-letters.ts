/**
 * Offer-letter use cases behind /api/hiring/offers: creator CRUD + send,
 * candidate accept/decline, Dropbox Sign e-signature and its webhook.
 * Ownership checks live here; tier gates stay on the routes.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import {
  deleteOfferLetter,
  findOfferLetterForCreator,
  findOfferLetterStatus,
  insertOfferLetter,
  listOfferLettersByCreator,
  updateOfferLetter,
  type OfferLetterRow,
} from "../../repositories/offerLettersRepository.js";
import { createEmbeddedOfferSignature } from "./dropbox-sign.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const offerLetterNotFound = () => new DomainError(404, "NOT_FOUND", "Offer letter not found");
const offerNotFound = () => new DomainError(404, "NOT_FOUND", "Offer not found");

async function requireOwnedOffer(id: string, userId: string): Promise<OfferLetterRow> {
  const offer = await findOfferLetterForCreator(getDb(), id, userId);
  if (!offer) throw offerLetterNotFound();
  return offer;
}

export function listOffers(userId: string): Promise<OfferLetterRow[]> {
  return listOfferLettersByCreator(getDb(), userId);
}

export interface CreateOfferInput {
  candidateName: string;
  candidateEmail: string;
  candidateUserId?: string;
  jobTitle: string;
  companyName: string;
  salary?: number;
  currency: string;
  startDate?: string;
  expiresInDays: number;
  bodyHtml: string;
}

export function createOffer(userId: string, input: CreateOfferInput): Promise<OfferLetterRow> {
  return insertOfferLetter(getDb(), {
    createdByUserId: userId,
    candidateUserId: input.candidateUserId,
    candidateName: input.candidateName,
    candidateEmail: input.candidateEmail,
    jobTitle: input.jobTitle,
    companyName: input.companyName,
    salary: input.salary ? String(input.salary) : undefined,
    currency: input.currency,
    startDate: input.startDate ? new Date(input.startDate) : undefined,
    expiresAt: new Date(Date.now() + input.expiresInDays * DAY_MS),
    bodyHtml: input.bodyHtml,
    status: "draft",
  });
}

export function getOffer(id: string, userId: string): Promise<OfferLetterRow> {
  return requireOwnedOffer(id, userId);
}

export async function sendOffer(id: string, userId: string): Promise<OfferLetterRow | undefined> {
  const offer = await requireOwnedOffer(id, userId);
  if (offer.status !== "draft") throw new DomainError(409, "CONFLICT", "Offer has already been sent");
  return updateOfferLetter(getDb(), offer.id, { status: "sent" });
}

/** Candidate accepts a sent/viewed offer (public token-based endpoint in future). */
export async function acceptOffer(id: string, signatureData: string | null): Promise<OfferLetterRow | undefined> {
  const db = getDb();
  const offer = await findOfferLetterStatus(db, id);
  if (!offer) throw offerNotFound();
  if (!["sent", "viewed"].includes(offer.status)) {
    throw new DomainError(409, "CONFLICT", "Offer cannot be accepted in its current state");
  }
  return updateOfferLetter(db, offer.id, { status: "accepted", signedAt: new Date(), signatureData });
}

export async function declineOffer(id: string, reason: string | null): Promise<OfferLetterRow | undefined> {
  const db = getDb();
  const offer = await findOfferLetterStatus(db, id);
  if (!offer) throw offerNotFound();
  return updateOfferLetter(db, offer.id, { status: "declined", declineReason: reason });
}

export async function removeOffer(id: string, userId: string): Promise<void> {
  const offer = await requireOwnedOffer(id, userId);
  await deleteOfferLetter(getDb(), offer.id);
}

export interface SendForSignatureInput {
  signerName?: string;
  signerEmail?: string;
}

export interface SendForSignatureResult {
  offerId: string;
  signatureRequestId: string | null;
  signingUrl: string | null;
  signerEmail: string;
  status: "sent";
  note: string;
}

/** Sends the offer to Dropbox Sign (stubs when `apiKey` is absent) and marks it sent. */
export async function sendOfferForSignature(
  id: string,
  userId: string,
  input: SendForSignatureInput,
  apiKey: string | undefined,
): Promise<SendForSignatureResult> {
  const offer = await requireOwnedOffer(id, userId);
  if (offer.status === "signed") throw new DomainError(409, "CONFLICT", "Offer letter is already signed");

  const signerName = input.signerName ?? offer.candidateName;
  const signerEmail = input.signerEmail ?? offer.candidateEmail;

  const { signatureRequestId, signingUrl } = apiKey
    ? await createEmbeddedOfferSignature(apiKey, offer, signerName, signerEmail)
    : { signatureRequestId: null, signingUrl: null };

  await updateOfferLetter(getDb(), offer.id, { status: "sent" });

  return {
    offerId: offer.id,
    signatureRequestId,
    signingUrl,
    signerEmail,
    status: "sent",
    note: apiKey ? "Signature request created via Dropbox Sign" : "DROPBOX_SIGN_API_KEY not set — stub response",
  };
}

/** Webhook side effect: mark the offer signed. Failures are swallowed (best-effort). */
export async function markOfferSigned(offerId: string): Promise<void> {
  await updateOfferLetter(getDb(), offerId, { status: "signed", signedAt: new Date() }).catch(() => undefined);
}
