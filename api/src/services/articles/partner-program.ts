/**
 * Writer Partner Program (#173) use cases behind
 * routes/articles/partner-program.ts: opt-in (supersede the active row,
 * insert the new one, write the legal acceptances), opt-out, status.
 */
import { getDb } from "../../db/index.js";
import { LegalRepository } from "../../repositories/legalRepository.js";
import { PartnerProgramRepository } from "../../repositories/partnerProgramRepository.js";

export interface PartnerProgramOptInInput {
  legalDocsAccepted: string[];
  proSubscriptionId?: string;
  /** Request context for the consent record + audit trail. */
  consentIp: string | null;
  acceptanceIp: string | null;
  userAgent: string | null;
}

export async function optInToPartnerProgram(userId: string, input: PartnerProgramOptInInput) {
  const db = getDb();
  const repo = new PartnerProgramRepository(db);

  // Deactivate any existing active row before inserting the new one
  // (unique partial index guards a second active row at the DB level).
  await repo.deactivateActiveOptIns(userId, "superseded", new Date());

  const optIn = await repo.insertOptIn({
    userId,
    legalDocsAccepted: input.legalDocsAccepted,
    consentIp: input.consentIp,
    consentUa: input.userAgent,
    proSubscriptionId: input.proSubscriptionId,
    isActive: true,
  });

  // Write a legal_document_acceptances row for every doc id in the
  // payload so the audit trail mirrors the gift-card / voice-clone
  // consent flow. Soft-fails on a missing doc — the opt-in row is the
  // primary record.
  await new LegalRepository(db).insertAcceptancesSoft(
    input.legalDocsAccepted.map((docId) => ({
      userId,
      documentId: docId,
      kind: "partner_program_terms",
      version: "snapshot",
      ip: input.acceptanceIp,
      userAgent: input.userAgent,
      context: "partner_program_opt_in",
    })),
    "articles partner-program opt-in",
  );

  return optIn;
}

export async function optOutOfPartnerProgram(userId: string): Promise<void> {
  await new PartnerProgramRepository(getDb()).deactivateActiveOptIns(userId, "user_opted_out", new Date());
}

export async function getPartnerProgramStatus(userId: string) {
  const repo = new PartnerProgramRepository(getDb());
  const optIn = await repo.findActiveOptIn(userId);
  const balance = await repo.findBalance(userId);
  return { optIn, balance };
}
