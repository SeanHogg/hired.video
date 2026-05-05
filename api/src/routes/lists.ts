// /api/lists — generic, polymorphic Lists for People / Jobs / Resumes /
// Companies. Lightweight bookmarks distinct from `recruiter_talent_pools`
// (which is a CRM concept).
//
// Visibility rules (mirrored on each query):
//   • Personal lists (companyId = null) — visible only to owner.
//   • Team lists (companyId set, isPrivate = false) — visible to all
//     members of that company.
//   • Owner-only lists scoped to a company (companyId set, isPrivate = true)
//     — visible only to owner.
//
// Mutations (rename / delete / add item / remove item) require owner OR a
// company admin/owner role. We use `userCompanyRoleAssociations` to resolve
// company membership and `companyProfiles.ownerId` for the agency owner case.

import { Hono } from "hono";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { LIST_ITEM_ENTITY_TYPES, type ListItemEntityType } from "../db/schema/lists.js";

export const listsRoutes = new Hono<{ Variables: Variables }>();

// ─── Helpers ─────────────────────────────────────────────────────────────

async function getCallerCompanyIds(userId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ companyId: schema.userCompanyRoleAssociations.companyId })
    .from(schema.userCompanyRoleAssociations)
    .where(
      and(
        eq(schema.userCompanyRoleAssociations.userId, userId),
        eq(schema.userCompanyRoleAssociations.isActive, true),
      ),
    );
  return rows.map((r) => r.companyId).filter((id): id is string => Boolean(id));
}

// Lists this user can SEE: their own + team lists from any of their companies.
async function getVisibleLists(userId: string, companyIds: string[]) {
  const db = getDb();
  // Personal + owner-private + own company-scoped
  const ownConditions = eq(schema.lists.ownerUserId, userId);
  // Team-shared in any of the user's companies
  const teamConditions =
    companyIds.length > 0
      ? and(
          inArray(schema.lists.companyId, companyIds),
          eq(schema.lists.isPrivate, false),
        )
      : undefined;

  return db
    .select()
    .from(schema.lists)
    .where(teamConditions ? or(ownConditions, teamConditions) : ownConditions)
    .orderBy(desc(schema.lists.updatedAt));
}

// Whether `userId` can MUTATE list `list` (rename, delete, add/remove items).
// Owner can always mutate. Company admin/owner can mutate any list scoped to
// that company. Members of the company can mutate team-shared lists.
async function canMutateList(
  userId: string,
  list: { id: string; ownerUserId: string; companyId: string | null; isPrivate: boolean },
): Promise<boolean> {
  if (list.ownerUserId === userId) return true;
  if (!list.companyId) return false; // personal — only owner can touch

  const db = getDb();

  // Company owner check
  const [company] = await db
    .select({ ownerId: schema.companyProfiles.ownerId })
    .from(schema.companyProfiles)
    .where(eq(schema.companyProfiles.id, list.companyId))
    .limit(1);
  if (company?.ownerId === userId) return true;

  // Company member check (only relevant for team-shared lists)
  if (list.isPrivate) return false;
  const [membership] = await db
    .select({ id: schema.userCompanyRoleAssociations.id })
    .from(schema.userCompanyRoleAssociations)
    .where(
      and(
        eq(schema.userCompanyRoleAssociations.userId, userId),
        eq(schema.userCompanyRoleAssociations.companyId, list.companyId),
        eq(schema.userCompanyRoleAssociations.isActive, true),
      ),
    )
    .limit(1);
  return Boolean(membership);
}

async function loadListIfVisible(
  userId: string,
  listId: string,
  companyIds: string[],
): Promise<{
  id: string;
  ownerUserId: string;
  companyId: string | null;
  isPrivate: boolean;
  title: string;
  createdAt: Date;
  updatedAt: Date;
} | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.lists)
    .where(eq(schema.lists.id, listId))
    .limit(1);
  if (!row) return null;

  if (row.ownerUserId === userId) return row;
  if (
    row.companyId &&
    !row.isPrivate &&
    companyIds.includes(row.companyId)
  ) {
    return row;
  }
  return null;
}

// ─── Schemas ─────────────────────────────────────────────────────────────

const CreateListSchema = z.object({
  title: z.string().min(1).max(255),
  isPrivate: z.boolean().default(true),
  companyId: z.string().uuid().nullable().optional(),
});

const UpdateListSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  isPrivate: z.boolean().optional(),
});

const AddItemSchema = z.object({
  entityType: z.enum(LIST_ITEM_ENTITY_TYPES),
  entityId: z.string().uuid(),
  notes: z.string().max(2000).optional(),
});

// ─── Routes ──────────────────────────────────────────────────────────────

// GET /api/lists?entityType=person — list visible lists, optionally annotated
// with item counts for a particular entity type.
listsRoutes.get("/", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const entityTypeParam = c.req.query("entityType");
  const entityType =
    entityTypeParam && (LIST_ITEM_ENTITY_TYPES as readonly string[]).includes(entityTypeParam)
      ? (entityTypeParam as ListItemEntityType)
      : null;

  const db = getDb();
  const companyIds = await getCallerCompanyIds(userId);
  const visible = await getVisibleLists(userId, companyIds);

  // Companies the user can scope NEW lists to. Always returned (even when
  // they have no lists yet) so the create-list dialog can render its
  // visibility selector. Empty for job seekers — UI hides the toggle.
  const companies =
    companyIds.length > 0
      ? await db
          .select({
            id: schema.companyProfiles.id,
            name: schema.companyProfiles.name,
          })
          .from(schema.companyProfiles)
          .where(inArray(schema.companyProfiles.id, companyIds))
      : [];

  if (visible.length === 0) {
    return c.json(success({ lists: [], companies }), 200);
  }

  // Item-count annotation. Cheap: one GROUP BY against the indexed list_id.
  const listIds = visible.map((l) => l.id);
  const countCondition = entityType
    ? and(
        inArray(schema.listItems.listId, listIds),
        eq(schema.listItems.entityType, entityType),
      )
    : inArray(schema.listItems.listId, listIds);

  const counts = await db
    .select({
      listId: schema.listItems.listId,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.listItems)
    .where(countCondition)
    .groupBy(schema.listItems.listId);

  const countByList = new Map(counts.map((row) => [row.listId, Number(row.count)]));

  const result = visible.map((l) => ({
    ...l,
    itemCount: countByList.get(l.id) ?? 0,
    canMutate: l.ownerUserId === userId || Boolean(l.companyId && !l.isPrivate),
  }));

  return c.json(success({ lists: result, companies }), 200);
});

// POST /api/lists
listsRoutes.post("/", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateListSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }

  const db = getDb();

  // If companyId supplied, verify membership.
  let companyId: string | null = parsed.data.companyId ?? null;
  if (companyId) {
    const companyIds = await getCallerCompanyIds(userId);
    const [company] = await db
      .select({ ownerId: schema.companyProfiles.ownerId })
      .from(schema.companyProfiles)
      .where(eq(schema.companyProfiles.id, companyId))
      .limit(1);
    const isOwner = company?.ownerId === userId;
    if (!isOwner && !companyIds.includes(companyId)) {
      return c.json(error("FORBIDDEN", "You don't belong to that company"), 403);
    }
  }

  // Personal lists are always private (no team to share with).
  const isPrivate = companyId ? parsed.data.isPrivate : true;

  const [row] = await db
    .insert(schema.lists)
    .values({
      ownerUserId: userId,
      companyId,
      title: parsed.data.title.trim(),
      isPrivate,
    } as any)
    .returning();

  return c.json(success(row), 201);
});

// PATCH /api/lists/:id
listsRoutes.patch("/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateListSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.lists)
    .where(eq(schema.lists.id, c.req.param("id")))
    .limit(1);
  if (!row) return c.json(error("NOT_FOUND", "List not found"), 404);

  if (!(await canMutateList(userId, row))) {
    return c.json(error("FORBIDDEN", "You can't edit this list"), 403);
  }

  // Personal lists can't be made non-private (no team to share with).
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title.trim();
  if (parsed.data.isPrivate !== undefined) {
    updates.isPrivate = row.companyId ? parsed.data.isPrivate : true;
  }

  const [updated] = await db
    .update(schema.lists)
    .set(updates as any)
    .where(eq(schema.lists.id, row.id))
    .returning();

  return c.json(success(updated), 200);
});

// DELETE /api/lists/:id
listsRoutes.delete("/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.lists)
    .where(eq(schema.lists.id, c.req.param("id")))
    .limit(1);
  if (!row) return c.json(error("NOT_FOUND", "List not found"), 404);

  if (!(await canMutateList(userId, row))) {
    return c.json(error("FORBIDDEN", "You can't delete this list"), 403);
  }

  await db.delete(schema.lists).where(eq(schema.lists.id, row.id));
  return c.json(success({ deleted: true }), 200);
});

// GET /api/lists/:id/items?entityType=person — items in a list, optionally
// scoped to one entity type.
listsRoutes.get("/:id/items", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const companyIds = await getCallerCompanyIds(userId);
  const list = await loadListIfVisible(userId, c.req.param("id"), companyIds);
  if (!list) return c.json(error("NOT_FOUND", "List not found"), 404);

  const entityTypeParam = c.req.query("entityType");
  const db = getDb();

  const baseFilter = eq(schema.listItems.listId, list.id);
  const filter =
    entityTypeParam && (LIST_ITEM_ENTITY_TYPES as readonly string[]).includes(entityTypeParam)
      ? and(baseFilter, eq(schema.listItems.entityType, entityTypeParam))
      : baseFilter;

  const items = await db
    .select()
    .from(schema.listItems)
    .where(filter)
    .orderBy(desc(schema.listItems.addedAt));

  return c.json(success({ list, items }), 200);
});

// POST /api/lists/:id/items
listsRoutes.post("/:id/items", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = AddItemSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [list] = await db
    .select()
    .from(schema.lists)
    .where(eq(schema.lists.id, c.req.param("id")))
    .limit(1);
  if (!list) return c.json(error("NOT_FOUND", "List not found"), 404);

  if (!(await canMutateList(userId, list))) {
    return c.json(error("FORBIDDEN", "You can't add to this list"), 403);
  }

  // Validate the entity exists. Polymorphic — each type has its own table.
  const exists = await entityExists(parsed.data.entityType, parsed.data.entityId);
  if (!exists) {
    return c.json(error("NOT_FOUND", `${parsed.data.entityType} not found`), 404);
  }

  // Idempotent insert — uniqueness is enforced by index. If it already exists,
  // return the existing row instead of erroring.
  const [existing] = await db
    .select()
    .from(schema.listItems)
    .where(
      and(
        eq(schema.listItems.listId, list.id),
        eq(schema.listItems.entityType, parsed.data.entityType),
        eq(schema.listItems.entityId, parsed.data.entityId),
      ),
    )
    .limit(1);
  if (existing) return c.json(success({ item: existing, alreadyPresent: true }), 200);

  const [item] = await db
    .insert(schema.listItems)
    .values({
      listId: list.id,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      addedByUserId: userId,
      notes: parsed.data.notes ?? null,
    } as any)
    .returning();

  // Touch the list so it sorts to the top of the user's nav.
  await db
    .update(schema.lists)
    .set({ updatedAt: new Date() } as any)
    .where(eq(schema.lists.id, list.id));

  return c.json(success({ item, alreadyPresent: false }), 201);
});

// DELETE /api/lists/:id/items/:itemId — remove by list_items.id
listsRoutes.delete("/:id/items/:itemId", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [list] = await db
    .select()
    .from(schema.lists)
    .where(eq(schema.lists.id, c.req.param("id")))
    .limit(1);
  if (!list) return c.json(error("NOT_FOUND", "List not found"), 404);

  if (!(await canMutateList(userId, list))) {
    return c.json(error("FORBIDDEN", "You can't modify this list"), 403);
  }

  await db
    .delete(schema.listItems)
    .where(
      and(
        eq(schema.listItems.id, c.req.param("itemId")),
        eq(schema.listItems.listId, list.id),
      ),
    );

  return c.json(success({ deleted: true }), 200);
});

// DELETE /api/lists/:id/items?entityType=&entityId=
// Convenience endpoint — UI knows the entity, not the list_items.id.
listsRoutes.delete("/:id/items", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const entityType = c.req.query("entityType");
  const entityId = c.req.query("entityId");
  if (!entityType || !entityId) {
    return c.json(error("VALIDATION_ERROR", "entityType and entityId are required"), 400);
  }
  if (!(LIST_ITEM_ENTITY_TYPES as readonly string[]).includes(entityType)) {
    return c.json(error("VALIDATION_ERROR", "Invalid entityType"), 400);
  }

  const db = getDb();
  const [list] = await db
    .select()
    .from(schema.lists)
    .where(eq(schema.lists.id, c.req.param("id")))
    .limit(1);
  if (!list) return c.json(error("NOT_FOUND", "List not found"), 404);

  if (!(await canMutateList(userId, list))) {
    return c.json(error("FORBIDDEN", "You can't modify this list"), 403);
  }

  await db
    .delete(schema.listItems)
    .where(
      and(
        eq(schema.listItems.listId, list.id),
        eq(schema.listItems.entityType, entityType),
        eq(schema.listItems.entityId, entityId),
      ),
    );

  return c.json(success({ deleted: true }), 200);
});

// ─── Polymorphic entity validation ───────────────────────────────────────

async function entityExists(entityType: ListItemEntityType, entityId: string): Promise<boolean> {
  const db = getDb();
  switch (entityType) {
    case "person": {
      const [row] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.id, entityId))
        .limit(1);
      return Boolean(row);
    }
    case "job": {
      const [row] = await db
        .select({ id: schema.jobItems.id })
        .from(schema.jobItems)
        .where(eq(schema.jobItems.id, entityId))
        .limit(1);
      return Boolean(row);
    }
    case "resume": {
      const [row] = await db
        .select({ id: schema.resumeInformation.id })
        .from(schema.resumeInformation)
        .where(eq(schema.resumeInformation.id, entityId))
        .limit(1);
      return Boolean(row);
    }
    case "company": {
      const [row] = await db
        .select({ id: schema.companyProfiles.id })
        .from(schema.companyProfiles)
        .where(eq(schema.companyProfiles.id, entityId))
        .limit(1);
      return Boolean(row);
    }
  }
}

listsRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Lists route not found" } }, 404),
);
