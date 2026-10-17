/**
 * Payout profile (tax + payout rail) use cases — user-level data under the
 * creators namespace because only enrolled creators receive payouts. One row
 * per user, surfaced in the creator workspace AND Settings → Payouts.
 */
import { getDb } from "../../db/index.js";
import {
  ENTITY_TYPES,
  TAX_ID_TYPES,
  PAYOUT_PROVIDERS,
  deriveTaxFormType,
  type PayoutProfileDTO,
  type PayoutProfileUpdateInput,
  type EntityType,
  type TaxIdType,
  type PayoutProvider,
} from "../../../../shared/payout-profile.js";
import { encryptTaxId } from "../payout/encryption.js";
import { invalidateTaxYearReports } from "../payout/TaxReportingService.js";
import { getESignConnector } from "../workforce/connectors/index.js";
import { UsersRepository } from "../../repositories/usersRepository.js";
import {
  findPayoutProfile,
  insertEmptyPayoutProfile,
  updatePayoutProfile as updatePayoutProfileRow,
  type PayoutProfilePatch,
  type PayoutProfileRow,
} from "../../repositories/payoutProfilesRepository.js";
import type { Db } from "../../db/index.js";
import { ok, fail, type CreatorResult } from "./result.js";

type Env = Record<string, string | undefined>;

const toIso = (v: Date | string | null | undefined): string | null => (v ? new Date(v).toISOString() : null);

export function payoutRowToDTO(row: PayoutProfileRow): PayoutProfileDTO {
  return {
    id: row.id,
    userId: row.userId,
    entityType: (row.entityType as EntityType | null) ?? null,
    legalName: row.legalName ?? null,
    businessLegalName: row.businessLegalName ?? null,
    taxResidencyCountry: row.taxResidencyCountry ?? null,
    taxIdType: (row.taxIdType as TaxIdType | null) ?? null,
    taxIdLast4: row.taxIdLast4 ?? null,
    taxFormType: (row.taxFormType as PayoutProfileDTO["taxFormType"]) ?? null,
    taxFormSubmittedAt: toIso(row.taxFormSubmittedAt),
    addressLine1: row.addressLine1 ?? null,
    addressLine2: row.addressLine2 ?? null,
    addressCity: row.addressCity ?? null,
    addressRegion: row.addressRegion ?? null,
    addressPostalCode: row.addressPostalCode ?? null,
    addressCountry: row.addressCountry ?? null,
    payoutProvider: (row.payoutProvider as PayoutProvider | null) ?? null,
    payoutAccountId: row.payoutAccountId ?? null,
    payoutOnboardedAt: toIso(row.payoutOnboardedAt),
    payoutCountry: row.payoutCountry ?? null,
    payoutCurrency: row.payoutCurrency,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

async function getOrCreatePayoutProfile(db: Db, userId: string): Promise<PayoutProfileRow> {
  const existing = await findPayoutProfile(db, userId);
  if (existing) return existing;
  const created = await insertEmptyPayoutProfile(db, userId);
  invalidateTaxYearReports();
  return created;
}

/** Read the caller's payout row, lazily creating an empty one. */
export async function getOwnPayoutProfile(userId: string): Promise<PayoutProfileDTO> {
  return payoutRowToDTO(await getOrCreatePayoutProfile(getDb(), userId));
}

const PASS_THROUGH_FIELDS = [
  "entityType", "legalName", "businessLegalName", "taxResidencyCountry",
  "taxIdType", "addressLine1", "addressLine2", "addressCity", "addressRegion",
  "addressPostalCode", "addressCountry", "payoutProvider", "payoutAccountId",
  "payoutCountry", "payoutCurrency",
] as const;

function validatePayoutUpdate(body: PayoutProfileUpdateInput): string | null {
  if (body.entityType && !(ENTITY_TYPES as readonly string[]).includes(body.entityType)) {
    return `entityType must be one of ${ENTITY_TYPES.join(", ")}`;
  }
  if (body.taxIdType && !(TAX_ID_TYPES as readonly string[]).includes(body.taxIdType)) {
    return `taxIdType must be one of ${TAX_ID_TYPES.join(", ")}`;
  }
  if (body.payoutProvider && !(PAYOUT_PROVIDERS as readonly string[]).includes(body.payoutProvider)) {
    return `payoutProvider must be one of ${PAYOUT_PROVIDERS.join(", ")}`;
  }
  if (body.taxResidencyCountry && body.taxResidencyCountry.length !== 2) {
    return "taxResidencyCountry must be a 2-letter ISO country code";
  }
  return null;
}

/** Update entity / tax / address / payout fields. */
export async function updateOwnPayoutProfile(
  userId: string,
  body: PayoutProfileUpdateInput,
  env: Env,
): Promise<CreatorResult<PayoutProfileDTO>> {
  const invalid = validatePayoutUpdate(body);
  if (invalid) return fail(400, "VALIDATION_ERROR", invalid);

  const db = getDb();
  const existing = await getOrCreatePayoutProfile(db, userId);
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  // Pass-through fields. Empty string from the form clears the column.
  for (const k of PASS_THROUGH_FIELDS) {
    if (k in body) {
      const value = (body as Record<string, unknown>)[k];
      patch[k] = value === "" ? null : value;
    }
  }

  // Tax ID: last 4 in plaintext for UI; the full value goes into the
  // AES-256-GCM `tax_id_ciphertext` + `tax_id_nonce` columns wrapped under
  // the active PAYOUT_TAX_ID_KEY. The legacy `tax_id_encrypted` plaintext
  // column is NULLed on every write.
  if (typeof body.taxId === "string") {
    const cleaned = body.taxId.replace(/\D/g, "");
    if (cleaned.length === 0) {
      patch.taxIdLast4 = null;
      patch.taxIdEncrypted = null;
      patch.taxIdCiphertext = null;
      patch.taxIdNonce = null;
      patch.taxIdKmsKeyId = null;
    } else {
      const enc = await encryptTaxId(cleaned, env);
      patch.taxIdLast4 = cleaned.slice(-4);
      patch.taxIdEncrypted = null;
      patch.taxIdCiphertext = enc.ciphertext;
      patch.taxIdNonce = enc.nonce;
      patch.taxIdKmsKeyId = enc.kmsKeyId;
    }
  }

  // Re-derive the form type whenever entity OR residency changes so the
  // displayed "you'll sign W-9" can never disagree with stored state.
  const nextEntity = (patch.entityType ?? existing.entityType) as EntityType | null;
  const nextResidency = (patch.taxResidencyCountry ?? existing.taxResidencyCountry) as string | null;
  if (nextEntity && nextResidency) {
    patch.taxFormType = deriveTaxFormType(nextEntity, nextResidency);
  }

  // Stamp payout_onboarded_at the first time both provider and account are present.
  const hasProvider = patch.payoutProvider ?? existing.payoutProvider;
  const hasAccount = patch.payoutAccountId ?? existing.payoutAccountId;
  if (hasProvider && hasAccount && !existing.payoutOnboardedAt) {
    patch.payoutOnboardedAt = new Date();
  }

  const updated = await updatePayoutProfileRow(db, userId, patch as PayoutProfilePatch);
  invalidateTaxYearReports();
  return ok(payoutRowToDTO(updated));
}

export interface TaxFormEnvelopeResult {
  envelopeId: string;
  signingUrl: string | null;
  provider: string;
  taxFormType: string | null;
  taxFormDocumentRef: string | null;
  taxFormSubmittedAt: string | null;
}

/**
 * #310 — hosted W-9 / W-8 e-signature envelope via the workforce
 * ESignConnector registry. Persists the envelope id to
 * `tax_form_document_ref` and stamps `tax_form_submitted_at`. Requires a
 * derived `tax_form_type` (no guessing).
 */
export async function requestTaxFormEnvelope(
  userId: string,
  body: { recipientEmail?: string; recipientName?: string },
  env: Env,
): Promise<CreatorResult<TaxFormEnvelopeResult>> {
  const db = getDb();
  const profile = await findPayoutProfile(db, userId);
  if (!profile) {
    return fail(400, "VALIDATION_ERROR", "Create your payout profile before requesting the tax-form envelope");
  }
  if (!profile.taxFormType) {
    return fail(400, "VALIDATION_ERROR", "Save entity type + residency first so we know which form (W-9 / W-8BEN / etc.) to send");
  }

  const recipientName =
    body.recipientName?.trim() ||
    profile.legalName?.trim() ||
    profile.businessLegalName?.trim() ||
    null;
  if (!recipientName) {
    return fail(400, "VALIDATION_ERROR", "recipientName is required (or save legalName on the payout profile)");
  }

  const meUser = await new UsersRepository(db).findById(userId);
  const recipientEmail = body.recipientEmail?.trim() || meUser?.email || null;
  if (!recipientEmail) return fail(400, "VALIDATION_ERROR", "recipientEmail is required");

  const connector = getESignConnector(env.ESIGN_PROVIDER ?? null);
  const envelope = await connector.createEnvelope({
    documentId: `payout-profile:${profile.id}:${profile.taxFormType}`,
    documentKind: profile.taxFormType, // 'w9' | 'w8ben' | 'w8eci' | 'w8imy' …
    recipientEmail,
    recipientName,
    templateRef: env[`ESIGN_TEMPLATE_${profile.taxFormType.toUpperCase()}`] ?? undefined,
  });
  if (!envelope.ok || !envelope.envelopeId) {
    return fail(502, "ESIGN_FAILED", envelope.error ?? "E-signature provider rejected envelope");
  }

  const now = new Date();
  const updated = await updatePayoutProfileRow(db, userId, {
    taxFormDocumentRef: envelope.envelopeId,
    taxFormSubmittedAt: profile.taxFormSubmittedAt ?? now,
    updatedAt: now,
  });
  invalidateTaxYearReports();

  return ok(
    {
      envelopeId: envelope.envelopeId,
      signingUrl: envelope.signingUrl ?? null,
      provider: connector.name,
      taxFormType: updated.taxFormType,
      taxFormDocumentRef: updated.taxFormDocumentRef,
      taxFormSubmittedAt: updated.taxFormSubmittedAt?.toISOString() ?? null,
    },
    201,
  );
}
