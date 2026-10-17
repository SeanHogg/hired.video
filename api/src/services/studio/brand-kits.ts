/**
 * Studio brand-kit use cases: workspace-scoped list, create, patch, delete.
 * Throws DomainError (404) / WorkspaceForbiddenError (403); the route maps
 * them onto the studio envelope.
 */
import { z } from "zod";
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import {
  brandKitOwnershipColumns,
  clearDefaultBrandKits,
  deleteBrandKit,
  findBrandKitOwner,
  insertBrandKit,
  listBrandKitsWhere,
  updateBrandKit,
  type BrandKitInsert,
  type BrandKitRow,
} from "../../repositories/studioBrandKitsRepository.js";
import { assertCanWrite, buildOwnershipFilter, listAccessibleWorkspaces } from "./workspace.js";
import { resolveWorkspaceFromBody, type WorkspaceRestriction } from "./workspace-request.js";

export const BrandKitSchema = z.object({
  name:           z.string().min(1).max(100).default("My Brand"),
  logoUrl:        z.string().url().optional().or(z.literal("")),
  primaryColor:   z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2563eb"),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0f172a"),
  accentColor:    z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#14b8a6"),
  fontFamily:     z.string().max(100).default("Inter"),
  isDefault:      z.boolean().default(false),
});
export type BrandKitInput = z.infer<typeof BrandKitSchema>;

const notFound = () => new DomainError(404, "NOT_FOUND", "Brand kit not found");

export async function listBrandKits(userId: string, restrictToWorkspace: WorkspaceRestriction | undefined): Promise<BrandKitRow[]> {
  const { companyIds, delegatedSubjectUserIds } = await listAccessibleWorkspaces(userId);
  const ownership = buildOwnershipFilter({
    ...brandKitOwnershipColumns,
    actorUserId: userId,
    companyIds,
    delegatedSubjectUserIds,
    restrictToWorkspace,
  });
  return listBrandKitsWhere(getDb(), ownership);
}

/** `body` carries the optional `workspace` selection next to the kit fields. */
export async function createBrandKit(userId: string, input: BrandKitInput, body: unknown): Promise<BrandKitRow> {
  const target = await resolveWorkspaceFromBody(userId, body);
  const db = getDb();
  // A new default clears the other defaults in the TARGET workspace only, so
  // a company default doesn't blank a personal default and vice versa.
  if (input.isDefault) {
    await clearDefaultBrandKits(db, { userId: target.ownerUserId, companyId: target.ownerCompanyId });
  }
  return insertBrandKit(db, {
    ...input,
    userId: target.ownerUserId,
    companyId: target.ownerCompanyId,
    logoUrl: input.logoUrl || null,
  } as BrandKitInsert);
}

/** Loose patch: only string / boolean fields that are present are applied. */
export async function patchBrandKit(userId: string, id: string, body: Record<string, unknown>): Promise<BrandKitRow> {
  const db = getDb();
  const existing = await findBrandKitOwner(db, id);
  if (!existing) throw notFound();
  await assertCanWrite(userId, existing.userId, existing.companyId ?? null);
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === "string") updates.name = body.name;
  if (typeof body.logoUrl === "string") updates.logoUrl = body.logoUrl || null;
  if (typeof body.primaryColor === "string") updates.primaryColor = body.primaryColor;
  if (typeof body.secondaryColor === "string") updates.secondaryColor = body.secondaryColor;
  if (typeof body.accentColor === "string") updates.accentColor = body.accentColor;
  if (typeof body.fontFamily === "string") updates.fontFamily = body.fontFamily;
  if (typeof body.isDefault === "boolean") {
    // Clear other defaults in the same workspace scope as this kit.
    if (body.isDefault) await clearDefaultBrandKits(db, existing);
    updates.isDefault = body.isDefault;
  }
  const updated = await updateBrandKit(db, id, updates as Partial<BrandKitInsert>);
  if (!updated) throw notFound();
  return updated;
}

/** Idempotent: a missing kit reports `{ deleted: false }`. */
export async function removeBrandKit(userId: string, id: string): Promise<{ deleted: boolean }> {
  const db = getDb();
  const existing = await findBrandKitOwner(db, id);
  if (!existing) return { deleted: false };
  await assertCanWrite(userId, existing.userId, existing.companyId ?? null);
  await deleteBrandKit(db, id);
  return { deleted: true };
}
