/** Workforce Phase 4 doc vault (#1421) — placement document CRUD + authority gate. */

import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { ForbiddenError } from "../../middleware/errorHandler.js";
import { resolveEmployerCompanyIds } from "./tenancy.js";

const { placementDocuments, placements } = schema;

export interface CreatePlacementDocumentInput {
  placementId?: string | null;
  companyId?: string | null;
  userId?: string | null;
  kind: string;
  filePath?: string | null;
  providerName?: string | null;
  providerRef?: string | null;
  signedAt?: Date | null;
  expiresAt?: Date | null;
}

export async function createPlacementDocument(
  inviterUserId: string,
  input: CreatePlacementDocumentInput,
  db = getDb(),
) {
  // Authority: caller must be employer of `companyId` (if scoped) or
  // recruiter on `placementId`. Tightened gate per #1349 DRY — no
  // prop-drilled "can manage docs"; the service checks workspace context
  // every call.
  if (input.companyId) {
    const employerCompanies = await resolveEmployerCompanyIds(inviterUserId, db);
    if (!employerCompanies.includes(input.companyId)) {
      throw new ForbiddenError("Not an employer in this workspace");
    }
  } else if (input.placementId) {
    const [p] = await db.select().from(placements)
      .where(eq(placements.id, input.placementId)).limit(1);
    if (!p || p.recruiterId !== inviterUserId) {
      throw new ForbiddenError("Not the recruiter on this placement");
    }
  } else {
    throw new ForbiddenError("Either companyId or placementId is required");
  }
  const [row] = await db.insert(placementDocuments).values({
    placementId: input.placementId ?? null,
    companyId: input.companyId ?? null,
    userId: input.userId ?? null,
    kind: input.kind,
    filePath: input.filePath ?? null,
    providerName: input.providerName ?? null,
    providerRef: input.providerRef ?? null,
    signedAt: input.signedAt ?? null,
    expiresAt: input.expiresAt ?? null,
    status: input.signedAt ? "signed" : "pending",
  } as any).returning();
  return row;
}

export async function listCompanyPlacementDocuments(
  employerId: string,
  db = getDb(),
) {
  const employerCompanies = await resolveEmployerCompanyIds(employerId, db);
  if (employerCompanies.length === 0) return [];
  return await db.select().from(placementDocuments)
    .where(inArray(placementDocuments.companyId, employerCompanies))
    .orderBy(desc(placementDocuments.createdAt));
}

/** Authority gate shared between `attachDocumentFile` + `markDocumentSigned`
 *  + the soon-to-land webhook handler. Returns the doc row when the caller
 *  is allowed to mutate it (employer of the doc's company, or recruiter on
 *  the doc's placement). */
async function loadDocForCaller(
  callerUserId: string,
  documentId: string,
  db = getDb(),
) {
  const [doc] = await db.select().from(placementDocuments)
    .where(eq(placementDocuments.id, documentId)).limit(1);
  if (!doc) throw new ForbiddenError("Document not found");
  if (doc.companyId) {
    const employerCompanies = await resolveEmployerCompanyIds(callerUserId, db);
    if (employerCompanies.includes(doc.companyId)) return doc;
  }
  if (doc.placementId) {
    const [p] = await db.select().from(placements)
      .where(eq(placements.id, doc.placementId)).limit(1);
    if (p && p.recruiterId === callerUserId) return doc;
  }
  throw new ForbiddenError("Not authorised to mutate this document");
}

/** Attach the R2 object key for an uploaded file. The actual blob lives
 *  on R2 — this stamps the placement_documents row with the lookup key
 *  + content type so the doc-vault UI can fetch + render. (#1442) */
export async function attachDocumentFile(
  callerUserId: string,
  documentId: string,
  fileKey: string,
  contentType: string | null,
  db = getDb(),
) {
  await loadDocForCaller(callerUserId, documentId, db);
  const [row] = await db.update(placementDocuments).set({
    filePath: fileKey,
    metadata: sql`COALESCE(${placementDocuments.metadata}, '{}'::jsonb) || ${JSON.stringify({ contentType: contentType ?? "application/octet-stream" })}::jsonb`,
    updatedAt: new Date(),
  } as any).where(eq(placementDocuments.id, documentId)).returning();
  return row;
}

/** Manually mark a document signed (Native e-sign flow). DocuSign's
 *  webhook calls the same underlying update through a separate route. */
export async function markDocumentSigned(
  callerUserId: string,
  documentId: string,
  signedAt: Date | null = null,
  db = getDb(),
) {
  await loadDocForCaller(callerUserId, documentId, db);
  const [row] = await db.update(placementDocuments).set({
    status: "signed",
    signedAt: signedAt ?? new Date(),
    updatedAt: new Date(),
  } as any).where(eq(placementDocuments.id, documentId)).returning();
  return row;
}

/** Get a single document row — used by the upload route to read
 *  the existing `metadata.contentType` before serving the file. */
export async function getDocumentForCaller(
  callerUserId: string,
  documentId: string,
  db = getDb(),
) {
  return await loadDocForCaller(callerUserId, documentId, db);
}
