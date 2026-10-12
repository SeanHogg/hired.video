/**
 * template-service — CRUD for reusable, per-role screening templates and their
 * ordered items. Company authorization (which companies the caller may act for)
 * is enforced in the route layer via resolveCompanyScope / userCanAccessCompany;
 * this module assumes the companyId it's handed is already permitted.
 *
 * The always-required floor (résumé + contact confirmation) is enforced here at
 * write time so a template can never be persisted without them, no matter what
 * the client sent — the single chokepoint the recruiter UI's locked rows mirror.
 */

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { schema } from "../../db/index.js";
import {
  ALWAYS_REQUIRED_ITEM_TYPES,
  isAlwaysRequired,
  validateScreeningItem,
  type ScreeningItemType,
} from "../../../../shared/screening.js";

const { screeningTemplates, screeningTemplateItems } = schema;

export interface TemplateItemInput {
  itemType: ScreeningItemType;
  refId?: string | null;
  config?: unknown;
  isRequired?: boolean;
  displayOrder?: number;
}

export interface TemplateInput {
  name: string;
  description?: string | null;
  roleFamily?: string | null;
  jobId?: string | null;
  items: TemplateItemInput[];
}

/**
 * Normalize a client-supplied item list into validated, ordered rows with the
 * always-required floor guaranteed present. Throws (caller → 400) when an item
 * fails validateScreeningItem. Always-required items are forced isRequired:true
 * and prepended if the client omitted them.
 */
function normalizeItems(items: TemplateItemInput[]): Array<{
  itemType: ScreeningItemType;
  refId: string | null;
  config: Record<string, unknown>;
  isRequired: boolean;
  displayOrder: number;
}> {
  const present = new Set(items.map((i) => i.itemType));
  const floor: TemplateItemInput[] = ALWAYS_REQUIRED_ITEM_TYPES.filter(
    (t) => !present.has(t),
  ).map((itemType) => ({ itemType }));

  return [...floor, ...items].map((item, idx) => {
    const config = validateScreeningItem({
      itemType: item.itemType,
      refId: item.refId,
      config: item.config,
    });
    return {
      itemType: item.itemType,
      refId: item.refId ?? null,
      config: config as Record<string, unknown>,
      isRequired: isAlwaysRequired(item.itemType) ? true : item.isRequired ?? false,
      displayOrder: item.displayOrder ?? idx,
    };
  });
}

export async function listTemplates(db: Db, companyIds: string[]) {
  if (companyIds.length === 0) return [];
  return db
    .select()
    .from(screeningTemplates)
    .where(
      and(
        inArray(screeningTemplates.companyId, companyIds),
        isNull(screeningTemplates.archivedAt),
      ),
    )
    .orderBy(asc(screeningTemplates.name));
}

export async function getTemplateWithItems(db: Db, templateId: string) {
  const [template] = await db
    .select()
    .from(screeningTemplates)
    .where(eq(screeningTemplates.id, templateId))
    .limit(1);
  if (!template) return null;
  const items = await db
    .select()
    .from(screeningTemplateItems)
    .where(eq(screeningTemplateItems.templateId, templateId))
    .orderBy(asc(screeningTemplateItems.displayOrder));
  return { template, items };
}

export async function createTemplate(
  db: Db,
  args: { companyId: string; createdByUserId: string | null } & TemplateInput,
) {
  const normalized = normalizeItems(args.items);
  const [template] = await db
    .insert(screeningTemplates)
    .values({
      companyId: args.companyId,
      createdByUserId: args.createdByUserId,
      name: args.name,
      description: args.description ?? null,
      roleFamily: args.roleFamily ?? null,
      jobId: args.jobId ?? null,
    })
    .returning();
  if (normalized.length > 0) {
    await db.insert(screeningTemplateItems).values(
      normalized.map((i) => ({
        templateId: template!.id,
        itemType: i.itemType,
        refId: i.refId,
        config: i.config,
        isRequired: i.isRequired,
        displayOrder: i.displayOrder,
      })),
    );
  }
  return (await getTemplateWithItems(db, template!.id))!;
}

export async function updateTemplate(
  db: Db,
  templateId: string,
  patch: Partial<Pick<TemplateInput, "name" | "description" | "roleFamily" | "jobId">> & {
    items?: TemplateItemInput[];
  },
) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.roleFamily !== undefined) set.roleFamily = patch.roleFamily;
  if (patch.jobId !== undefined) set.jobId = patch.jobId;
  await db
    .update(screeningTemplates)
    .set(set)
    .where(eq(screeningTemplates.id, templateId));

  // Items are replace-all (the builder sends the full ordered list). Re-running
  // the floor + validation keeps the invariant on every edit.
  if (patch.items) {
    const normalized = normalizeItems(patch.items);
    await db
      .delete(screeningTemplateItems)
      .where(eq(screeningTemplateItems.templateId, templateId));
    if (normalized.length > 0) {
      await db.insert(screeningTemplateItems).values(
        normalized.map((i) => ({
          templateId,
          itemType: i.itemType,
          refId: i.refId,
          config: i.config,
          isRequired: i.isRequired,
          displayOrder: i.displayOrder,
        })),
      );
    }
  }
  return (await getTemplateWithItems(db, templateId))!;
}

export async function archiveTemplate(db: Db, templateId: string) {
  await db
    .update(screeningTemplates)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(screeningTemplates.id, templateId));
}
