/**
 * Versioned legal documents + per-user acceptance (the /api/legal routes).
 * Owns the publishing rules — only the CURRENT version is acceptable, a
 * published document is immutable and undeletable — over LegalRepository.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import {
  LegalRepository,
  type LegalAcceptanceInsert,
  type LegalAcceptanceRow,
  type LegalDocumentInsert,
  type LegalDocumentRow,
} from "../../repositories/legalRepository.js";

function repo(): LegalRepository {
  return new LegalRepository(getDb());
}

const docNotFound = () => new DomainError(404, "NOT_FOUND", "Document not found");

async function requireDoc(legal: LegalRepository, id: string): Promise<LegalDocumentRow> {
  const doc = await legal.findDocById(id);
  if (!doc) throw docNotFound();
  return doc;
}

// ── Public reads ─────────────────────────────────────────────────────────────

export async function getCurrentLegalDoc(kind: string, locale: string): Promise<LegalDocumentRow> {
  const row = await repo().findCurrentDoc(kind, locale);
  if (!row) throw new DomainError(404, "NOT_FOUND", `No current document for kind=${kind} locale=${locale}`);
  return row;
}

export function listCurrentLegalDocs(locale: string): Promise<LegalDocumentRow[]> {
  return repo().listCurrentDocs(locale);
}

// ── User acceptance ──────────────────────────────────────────────────────────

export interface AcceptLegalDocInput {
  userId: string;
  documentId: string;
  context: string | null;
  ip: string | null;
  userAgent: string | null;
}

export async function acceptLegalDoc(input: AcceptLegalDocInput): Promise<LegalAcceptanceRow> {
  const legal = repo();
  const doc = await requireDoc(legal, input.documentId);
  if (!doc.isCurrent) {
    throw new DomainError(400, "STALE_DOCUMENT", "Cannot accept a non-current document version");
  }
  return legal.insertAcceptance({
    userId: input.userId,
    documentId: doc.id,
    kind: doc.kind,
    version: doc.version,
    locale: doc.locale,
    ip: input.ip,
    userAgent: input.userAgent,
    context: input.context,
  } as LegalAcceptanceInsert);
}

export function listMyLegalAcceptances(userId: string): Promise<LegalAcceptanceRow[]> {
  return repo().listAcceptancesForUser(userId);
}

export interface LegalKindStatus {
  documentId: string;
  version: string;
  hasAcceptedCurrent: boolean;
  acceptedAt: string | null;
}

/** `{ <kind>: { hasAcceptedCurrent, version, acceptedAt } }` for every current kind. */
export async function getMyLegalStatus(userId: string, locale: string): Promise<Record<string, LegalKindStatus>> {
  const legal = repo();
  const currents = await legal.findCurrentDocs(locale);
  // One DISTINCT ON (kind) read for every current kind (was one per doc).
  const latestByKind = await legal.findLatestAcceptancesByKind(
    userId,
    Array.from(new Set(currents.map((d) => d.kind))),
  );
  const result: Record<string, LegalKindStatus> = {};
  for (const doc of currents) {
    const latest = latestByKind.get(doc.kind);
    result[doc.kind] = {
      documentId: doc.id,
      version: doc.version,
      hasAcceptedCurrent: !!latest && latest.version === doc.version,
      acceptedAt: latest?.acceptedAt ? new Date(latest.acceptedAt).toISOString() : null,
    };
  }
  return result;
}

// ── SuperAdmin CRUD ──────────────────────────────────────────────────────────

export function listAllLegalDocs(): Promise<LegalDocumentRow[]> {
  return repo().listAllDocs();
}

export interface CreateLegalDocInput {
  kind: string;
  version: string;
  title: string;
  summary: string | null;
  body: string;
  locale: string;
}

/** New documents always start as a non-current draft. */
export function createLegalDocDraft(input: CreateLegalDocInput): Promise<LegalDocumentRow> {
  return repo().insertDoc({ ...input, isCurrent: false } as LegalDocumentInsert);
}

const EDITABLE_FIELDS = ["title", "summary", "body", "version"] as const;

/** Edit a draft — published documents are immutable (create a new version). */
export async function updateLegalDocDraft(id: string, body: Record<string, unknown>): Promise<LegalDocumentRow | null> {
  const legal = repo();
  const existing = await requireDoc(legal, id);
  if (existing.publishedAt) {
    throw new DomainError(400, "ALREADY_PUBLISHED", "Published documents are immutable. Create a new version.");
  }
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of EDITABLE_FIELDS) {
    if (k in body) patch[k] = body[k];
  }
  return legal.updateDoc(id, patch as Partial<LegalDocumentInsert>);
}

/** Publish `id` and un-current the prior current doc of the same kind/locale. */
export async function publishLegalDoc(id: string, publisherId: string): Promise<LegalDocumentRow | null> {
  const legal = repo();
  const doc = await requireDoc(legal, id);
  return legal.publishDoc(doc, publisherId);
}

/** Delete a draft — a published document can never be deleted. */
export async function deleteLegalDocDraft(id: string): Promise<void> {
  const legal = repo();
  const doc = await requireDoc(legal, id);
  if (doc.publishedAt) {
    throw new DomainError(400, "ALREADY_PUBLISHED", "Cannot delete a published document");
  }
  await legal.deleteDoc(doc.id);
}
