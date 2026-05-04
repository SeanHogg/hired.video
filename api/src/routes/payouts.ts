/**
 * Payout Profiles — user-level tax / payout entity (one row per user).
 *
 * Routes:
 *   GET   /api/payouts/me   — read the caller's payout profile (creates an
 *                             empty row on first read so PATCH always finds
 *                             a target — same pattern used by user_profiles)
 *   PATCH /api/payouts/me   — update entity / tax / address / payout fields
 *
 * Tax-form derivation is deterministic from `entityType` × `taxResidencyCountry`
 * (see shared/payout-profile.ts → `deriveTaxFormType`); the server always
 * recomputes it on save so the stored value can't drift from the inputs the
 * user signed off on.
 *
 * Encryption: tax IDs are currently stored in plain text in `taxIdEncrypted`.
 * This is a placeholder — production payouts MUST switch to KMS-wrapped
 * AES-GCM or full Stripe Connect TIN handoff before going live. Tracked in
 * the Consolidated Gap Register.
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
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
} from "../../../shared/payout-profile.js";

const { payoutProfiles } = schema;

export const payoutRoutes = new Hono<{ Variables: Variables }>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

function requireAuth(c: any): string | Response {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return userId;
}

function rowToDTO(row: typeof payoutProfiles.$inferSelect): PayoutProfileDTO {
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
    taxFormSubmittedAt: row.taxFormSubmittedAt ? new Date(row.taxFormSubmittedAt as any).toISOString() : null,
    addressLine1: row.addressLine1 ?? null,
    addressLine2: row.addressLine2 ?? null,
    addressCity: row.addressCity ?? null,
    addressRegion: row.addressRegion ?? null,
    addressPostalCode: row.addressPostalCode ?? null,
    addressCountry: row.addressCountry ?? null,
    payoutProvider: (row.payoutProvider as PayoutProvider | null) ?? null,
    payoutAccountId: row.payoutAccountId ?? null,
    payoutOnboardedAt: row.payoutOnboardedAt ? new Date(row.payoutOnboardedAt as any).toISOString() : null,
    payoutCountry: row.payoutCountry ?? null,
    payoutCurrency: row.payoutCurrency,
    createdAt: new Date(row.createdAt as any).toISOString(),
    updatedAt: new Date(row.updatedAt as any).toISOString(),
  };
}

async function getOrCreate(db: ReturnType<typeof getDb>, userId: string) {
  const [existing] = await db
    .select()
    .from(payoutProfiles)
    .where(eq(payoutProfiles.userId, userId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(payoutProfiles)
    .values({ userId } as any)
    .returning();
  return created;
}

// GET /me
payoutRoutes.get("/me", async (c) => {
  const userId = requireAuth(c);
  if (typeof userId !== "string") return userId;
  const db = getDb();
  const row = await getOrCreate(db, userId);
  return c.json(success(rowToDTO(row)), 200);
});

// PATCH /me
payoutRoutes.patch("/me", async (c) => {
  const userId = requireAuth(c);
  if (typeof userId !== "string") return userId;
  const body = await c.req.json().catch(() => ({})) as PayoutProfileUpdateInput;

  if (body.entityType && !(ENTITY_TYPES as readonly string[]).includes(body.entityType)) {
    return c.json(error("VALIDATION_ERROR", `entityType must be one of ${ENTITY_TYPES.join(", ")}`), 400);
  }
  if (body.taxIdType && !(TAX_ID_TYPES as readonly string[]).includes(body.taxIdType)) {
    return c.json(error("VALIDATION_ERROR", `taxIdType must be one of ${TAX_ID_TYPES.join(", ")}`), 400);
  }
  if (body.payoutProvider && !(PAYOUT_PROVIDERS as readonly string[]).includes(body.payoutProvider)) {
    return c.json(error("VALIDATION_ERROR", `payoutProvider must be one of ${PAYOUT_PROVIDERS.join(", ")}`), 400);
  }
  if (body.taxResidencyCountry && body.taxResidencyCountry.length !== 2) {
    return c.json(error("VALIDATION_ERROR", "taxResidencyCountry must be a 2-letter ISO country code"), 400);
  }

  const db = getDb();
  const existing = await getOrCreate(db, userId);

  const patch: Record<string, unknown> = { updatedAt: new Date() };

  // Pass-through fields. Empty string from the form clears the column.
  for (const k of [
    "entityType", "legalName", "businessLegalName", "taxResidencyCountry",
    "taxIdType", "addressLine1", "addressLine2", "addressCity", "addressRegion",
    "addressPostalCode", "addressCountry", "payoutProvider", "payoutAccountId",
    "payoutCountry", "payoutCurrency",
  ] as const) {
    if (k in body) {
      const value = (body as Record<string, unknown>)[k];
      patch[k] = value === "" ? null : value;
    }
  }

  // Tax ID: store last 4 in plaintext for UI; full value goes into the
  // (currently unencrypted) `tax_id_encrypted` placeholder column. Real
  // encryption is tracked in the Gap Register and MUST land before any
  // production payout integration ships.
  if (typeof body.taxId === "string") {
    const cleaned = body.taxId.replace(/\D/g, "");
    if (cleaned.length === 0) {
      patch.taxIdLast4 = null;
      patch.taxIdEncrypted = null;
    } else {
      patch.taxIdLast4 = cleaned.slice(-4);
      patch.taxIdEncrypted = cleaned;
    }
  }

  // Re-derive the form type whenever entity OR residency changes so the
  // displayed "you'll sign W-9" can never disagree with stored state.
  const nextEntity = (patch.entityType ?? existing.entityType) as EntityType | null;
  const nextResidency = (patch.taxResidencyCountry ?? existing.taxResidencyCountry) as string | null;
  if (nextEntity && nextResidency) {
    patch.taxFormType = deriveTaxFormType(nextEntity, nextResidency);
  }

  // Stamp payout_onboarded_at the first time both provider and account are
  // present, so the workspace can tell "ready to receive" vs "still empty".
  const hasProvider = (patch.payoutProvider ?? existing.payoutProvider);
  const hasAccount = (patch.payoutAccountId ?? existing.payoutAccountId);
  if (hasProvider && hasAccount && !existing.payoutOnboardedAt) {
    patch.payoutOnboardedAt = new Date();
  }

  const [updated] = await db
    .update(payoutProfiles)
    .set(patch as any)
    .where(eq(payoutProfiles.userId, userId))
    .returning();

  return c.json(success(rowToDTO(updated)), 200);
});

payoutRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Payout route not found" } }, 404),
);
