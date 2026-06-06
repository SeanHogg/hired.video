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
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { LIST_ITEM_ENTITY_TYPES, type ListItemEntityType } from "../db/schema/lists.js";
import { getOrSetCached, invalidateCachedKey } from "../utils/edge-cache.js";

export const listsRoutes = new Hono<AppEnv>();

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
  companyId: UuidLikeSchema.nullable().optional(),
});

const UpdateListSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  isPrivate: z.boolean().optional(),
});

const AddItemSchema = z.object({
  entityType: z.enum(LIST_ITEM_ENTITY_TYPES),
  entityId: UuidLikeSchema,
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

// ─── Wishlist (the one canonical per-user heart list) ─────────────────────
//
// A wishlist is just a `lists` row with kind = 'wishlist'. We expose a thin
// facade over the generic items machinery so cards/detail pages get a
// one-tap heart toggle without the consumer needing to know the list id.
// The partial unique index (migration 0198) guarantees one per owner, so
// get-or-create is race-safe (the loser's INSERT trips the index → re-select).

function wishlistIdsCacheKey(userId: string, entityType: string): string {
  return `wishlist:ids:${userId}:${entityType}`;
}

async function findWishlist(userId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.lists)
    .where(and(eq(schema.lists.ownerUserId, userId), eq(schema.lists.kind, "wishlist")))
    .limit(1);
  return row ?? null;
}

async function getOrCreateWishlist(userId: string) {
  const existing = await findWishlist(userId);
  if (existing) return existing;
  const db = getDb();
  try {
    const [created] = await db
      .insert(schema.lists)
      .values({
        ownerUserId: userId,
        companyId: null,
        title: "Wishlist",
        isPrivate: true,
        kind: "wishlist",
      } as any)
      .returning();
    return created;
  } catch {
    // Lost a create race — the unique index rejected us. Re-read the winner.
    const row = await findWishlist(userId);
    if (!row) throw new Error("Failed to create wishlist");
    return row;
  }
}

const WishlistToggleSchema = z.object({
  entityType: z.enum(LIST_ITEM_ENTITY_TYPES),
  entityId: UuidLikeSchema,
});

// POST /api/lists/wishlist/toggle — add/remove an entity from the caller's
// wishlist. Returns the resulting state so the heart can render optimistically.
listsRoutes.post("/wishlist/toggle", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = WishlistToggleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }
  const { entityType, entityId } = parsed.data;

  const exists = await entityExists(entityType, entityId);
  if (!exists) return c.json(error("NOT_FOUND", `${entityType} not found`), 404);

  const db = getDb();
  const wishlist = await getOrCreateWishlist(userId);

  const [present] = await db
    .select({ id: schema.listItems.id })
    .from(schema.listItems)
    .where(
      and(
        eq(schema.listItems.listId, wishlist.id),
        eq(schema.listItems.entityType, entityType),
        eq(schema.listItems.entityId, entityId),
      ),
    )
    .limit(1);

  let wishlisted: boolean;
  if (present) {
    await db.delete(schema.listItems).where(eq(schema.listItems.id, present.id));
    wishlisted = false;
  } else {
    await db
      .insert(schema.listItems)
      .values({ listId: wishlist.id, entityType, entityId, addedByUserId: userId } as any)
      .onConflictDoNothing();
    wishlisted = true;
  }

  await db
    .update(schema.lists)
    .set({ updatedAt: new Date() } as any)
    .where(eq(schema.lists.id, wishlist.id));

  invalidateCachedKey(wishlistIdsCacheKey(userId, entityType));
  return c.json(success({ wishlisted }), 200);
});

// GET /api/lists/wishlist/ids?entityType=course — the set of wishlisted entity
// ids for one type. Drives heart-state hydration across a whole grid in one
// round-trip. Cached read-through per (user, type); invalidated on toggle.
listsRoutes.get("/wishlist/ids", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const entityType = c.req.query("entityType");
  if (!entityType || !(LIST_ITEM_ENTITY_TYPES as readonly string[]).includes(entityType)) {
    return c.json(error("VALIDATION_ERROR", "Valid entityType is required"), 400);
  }

  const ids = await getOrSetCached<string[]>({
    key: wishlistIdsCacheKey(userId, entityType),
    ttlSeconds: 300,
    loader: async () => {
      const wishlist = await findWishlist(userId);
      if (!wishlist) return [];
      const db = getDb();
      const rows = await db
        .select({ entityId: schema.listItems.entityId })
        .from(schema.listItems)
        .where(
          and(
            eq(schema.listItems.listId, wishlist.id),
            eq(schema.listItems.entityType, entityType),
          ),
        );
      return rows.map((r) => r.entityId);
    },
    revive: (raw) => (Array.isArray(raw) ? (raw as string[]) : null),
  });

  return c.json(success({ ids }), 200);
});

// GET /api/lists/wishlist/courses — wishlisted courses, enriched into the same
// PublicCourseCard shape the marketplace feed uses. One join, owner-scoped.
listsRoutes.get("/wishlist/courses", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const wishlist = await findWishlist(userId);
  if (!wishlist) return c.json(success([] as unknown[]), 200);

  const db = getDb();
  const rows = await db
    .select({
      course: schema.courses,
      author: { id: schema.users.id, name: schema.users.name },
      authorProfile: {
        avatarUrl: schema.userProfiles.avatarUrl,
        customUrlSlug: schema.userProfiles.customUrlSlug,
      },
      addedAt: schema.listItems.addedAt,
    })
    .from(schema.listItems)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.listItems.entityId))
    .innerJoin(schema.users, eq(schema.courses.userId, schema.users.id))
    .leftJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.users.id))
    .where(
      and(
        eq(schema.listItems.listId, wishlist.id),
        eq(schema.listItems.entityType, "course"),
      ),
    )
    .orderBy(desc(schema.listItems.addedAt));

  const items = rows.map((r) => ({
    id: r.course.id,
    type: "course" as const,
    title: r.course.title,
    slug: r.course.slug,
    summary: r.course.summary,
    coverImageUrl: r.course.coverImageUrl,
    category: r.course.category,
    tags: r.course.tags,
    difficulty: r.course.difficulty,
    estimatedMinutes: r.course.estimatedMinutes,
    priceCents: r.course.priceVisible ? r.course.priceCents : null,
    issuesCertificate: r.course.issuesCertificate,
    enrollmentCount: r.course.enrollmentCount,
    averageRating: r.course.averageRating,
    ratingCount: r.course.ratingCount,
    publishedAt: r.course.publishedAt,
    author: {
      id: r.author.id,
      name: r.author.name,
      avatarUrl: r.authorProfile?.avatarUrl ?? null,
      slug: r.authorProfile?.customUrlSlug ?? r.author.id,
    },
  }));
  return c.json(success(items), 200);
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
    case "pipeline_entry": {
      const [row] = await db
        .select({ id: schema.jobPipelineEntries.id })
        .from(schema.jobPipelineEntries)
        .where(eq(schema.jobPipelineEntries.id, entityId))
        .limit(1);
      return Boolean(row);
    }
    case "course": {
      const [row] = await db
        .select({ id: schema.courses.id })
        .from(schema.courses)
        .where(eq(schema.courses.id, entityId))
        .limit(1);
      return Boolean(row);
    }
  }
}

listsRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Lists route not found" } }, 404),
);
