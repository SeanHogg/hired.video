/**
 * /api/references — reference management (#1677). Owner-scoped CRUD on
 * reference contacts + selective, NDA-gated, revocable sharing.
 *
 * Owner (authed):
 *   GET    /api/references/contacts
 *   POST   /api/references/contacts
 *   PUT    /api/references/contacts/:id
 *   DELETE /api/references/contacts/:id
 *   GET    /api/references/shares
 *   POST   /api/references/shares          { contactIds, sharedWithEmail, label?, requireNda?, expiresInDays? }
 *   DELETE /api/references/shares/:id       (revoke)
 *
 * Recipient (public, token-gated — registered under PUBLIC_PREFIXES):
 *   GET  /api/references/shared/:token            → metadata + (contacts if unlocked)
 *   POST /api/references/shared/:token/accept-nda → unlock, returns contacts
 *
 * A share is accessible when: not revoked, not expired, and (NDA not
 * required OR NDA accepted). The contact set is the point-in-time snapshot
 * stored on the share.
 */
import { Hono } from "hono";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { getOrSetCached } from "../utils/edge-cache.js";
import {
  invalidatePublicReferences,
  publicReferencesCacheKey as publicCacheKey,
} from "../services/profile/public-references-cache.js";
import { syncLinkedReferences } from "../services/resume/linked-references.js";
import {
  findReferenceShareByToken,
  insertReferenceShare,
  listReferenceShares,
  markReferenceShareNdaAccepted,
  recordReferenceShareView,
  revokeReferenceShare,
} from "../repositories/referenceSharesRepository.js";
import {
  isProfileSectionVisible,
  type StoredProfileSections,
} from "../../../shared/profile-sections.js";

const { referenceContacts, users, userProfiles } = schema;

export const referenceRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

function newToken(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}

const ContactSchema = z.object({
  name: z.string().min(1).max(200),
  title: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  email: z.string().email().max(255).optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
  relationship: z.string().max(120).optional(),
  notes: z.string().max(4000).optional(),
});

// ── Owner: contacts ────────────────────────────────────────────────────
referenceRoutes.get("/contacts", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "auth required"), 401);
  const rows = await getDb()
    .select()
    .from(referenceContacts)
    .where(eq(referenceContacts.ownerUserId, userId))
    .orderBy(asc(referenceContacts.name));
  return c.json(success(rows), 200);
});

referenceRoutes.post("/contacts", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "auth required"), 401);
  const parsed = ContactSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.message), 400);
  const d = parsed.data;
  const [row] = await getDb()
    .insert(referenceContacts)
    .values({
      ownerUserId: userId,
      name: d.name,
      title: d.title ?? null,
      company: d.company ?? null,
      email: d.email || null,
      phone: d.phone ?? null,
      relationship: d.relationship ?? null,
      notes: d.notes ?? null,
    } as any)
    .returning();
  invalidatePublicReferences(userId);
  return c.json(success(row), 201);
});

referenceRoutes.put("/contacts/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "auth required"), 401);
  const parsed = ContactSchema.partial().safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.message), 400);
  const id = c.req.param("id");
  // The contact as it was: the live-link sweep refreshes only résumé items
  // still showing this text and unlinks hand-edited ones (#2258).
  const [previous] = await getDb()
    .select({ id: referenceContacts.id, name: referenceContacts.name, title: referenceContacts.title, company: referenceContacts.company, relationship: referenceContacts.relationship })
    .from(referenceContacts)
    .where(and(eq(referenceContacts.id, id), eq(referenceContacts.ownerUserId, userId)))
    .limit(1);
  if (!previous) return c.json(error("NOT_FOUND", "contact not found"), 404);
  const [row] = await getDb()
    .update(referenceContacts)
    // A partial update that omits `email` keeps it; only an explicit "" clears it.
    .set({
      ...parsed.data,
      ...(parsed.data.email !== undefined ? { email: parsed.data.email || null } : {}),
      updatedAt: new Date(),
    } as any)
    .where(and(eq(referenceContacts.id, id), eq(referenceContacts.ownerUserId, userId)))
    .returning();
  if (!row) return c.json(error("NOT_FOUND", "contact not found"), 404);
  invalidatePublicReferences(userId);
  // Live link (#2258): every résumé item pulled from this contact now shows it.
  await syncLinkedReferences(getDb(), userId, row, previous);
  return c.json(success(row), 200);
});

referenceRoutes.delete("/contacts/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "auth required"), 401);
  const id = c.req.param("id");
  await getDb()
    .delete(referenceContacts)
    .where(and(eq(referenceContacts.id, id), eq(referenceContacts.ownerUserId, userId)));
  invalidatePublicReferences(userId);
  return c.json(success({ id }), 200);
});

// ── Public: profile reference summaries (PUBLIC_PREFIXES) ───────────────
/**
 * GET /api/references/public/:userId — non-PII reference summaries for the
 * given user's profile References section. Returns name + role context only
 * (NEVER email/phone/notes — those stay behind the NDA-gated share flow).
 *
 * Gated on the owner's `references` profile-section visibility: if they
 * haven't opted the section in, this returns an empty list regardless of how
 * many contacts they hold. Read-through cached (120s) and invalidated on
 * every contact mutation by the owner.
 */
referenceRoutes.get("/public/:userId", async (c) => {
  const userId = c.req.param("userId");
  const summaries = await getOrSetCached({
    key: publicCacheKey(userId),
    ttlSeconds: 120,
    loader: async () => {
      const db = getDb();
      const [owner] = await db
        .select({ role: users.role, sections: userProfiles.profileSections })
        .from(users)
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(eq(users.id, userId))
        .limit(1);
      if (!owner) return [];
      const visible = isProfileSectionVisible(
        (owner.sections ?? null) as StoredProfileSections | null,
        owner.role,
        "references",
      );
      if (!visible) return [];
      const rows = await db
        .select({
          id: referenceContacts.id,
          name: referenceContacts.name,
          title: referenceContacts.title,
          company: referenceContacts.company,
          relationship: referenceContacts.relationship,
        })
        .from(referenceContacts)
        .where(eq(referenceContacts.ownerUserId, userId))
        .orderBy(asc(referenceContacts.name));
      return rows;
    },
  });
  return c.json(success(summaries), 200);
});

// ── Owner: shares ──────────────────────────────────────────────────────
const ShareSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(50),
  sharedWithEmail: z.string().email(),
  label: z.string().max(255).optional(),
  requireNda: z.boolean().optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

referenceRoutes.get("/shares", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "auth required"), 401);
  return c.json(success(await listReferenceShares(userId)), 200);
});

referenceRoutes.post("/shares", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "auth required"), 401);
  const parsed = ShareSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.message), 400);
  const d = parsed.data;
  const db = getDb();
  // Confirm every contact belongs to the owner — never let a share grant
  // someone else's contacts.
  const owned = await db
    .select({ id: referenceContacts.id })
    .from(referenceContacts)
    .where(and(eq(referenceContacts.ownerUserId, userId), inArray(referenceContacts.id, d.contactIds)));
  if (owned.length !== d.contactIds.length) {
    return c.json(error("VALIDATION_ERROR", "one or more contacts not found"), 400);
  }
  const expiresAt = d.expiresInDays ? new Date(Date.now() + d.expiresInDays * 86400_000) : null;
  const row = await insertReferenceShare({
    ownerUserId: userId,
    token: newToken(),
    sharedWithEmail: d.sharedWithEmail,
    contactIds: d.contactIds,
    label: d.label ?? null,
    requireNda: d.requireNda ?? true,
    expiresAt,
  });
  return c.json(success(row), 201);
});

referenceRoutes.delete("/shares/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "auth required"), 401);
  const id = c.req.param("id");
  const row = await revokeReferenceShare(id, userId);
  if (!row) return c.json(error("NOT_FOUND", "share not found"), 404);
  return c.json(success(row), 200);
});

// ── Recipient: public token view (PUBLIC_PREFIXES) ─────────────────────
/** Resolve + validate a share by token. Returns the share row when
 *  reachable (not revoked, not expired) else null. */
async function reachableShare(token: string) {
  const share = await findReferenceShareByToken(token);
  if (!share) return null;
  if (share.revokedAt) return null;
  if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) return null;
  return share;
}

async function loadShareContacts(contactIds: string[]) {
  if (contactIds.length === 0) return [];
  return getDb()
    .select()
    .from(referenceContacts)
    .where(inArray(referenceContacts.id, contactIds));
}

referenceRoutes.get("/shared/:token", async (c) => {
  const share = await reachableShare(c.req.param("token"));
  if (!share) return c.json(error("NOT_FOUND", "this reference link is no longer available"), 404);
  const unlocked = !share.requireNda || !!share.ndaAcceptedAt;
  // Stamp first-view for the owner's audit trail.
  if (!share.firstViewedAt) await recordReferenceShareView(share.id);
  return c.json(
    success({
      label: share.label,
      requireNda: share.requireNda,
      unlocked,
      contacts: unlocked ? await loadShareContacts(share.contactIds) : [],
    }),
    200,
  );
});

referenceRoutes.post("/shared/:token/accept-nda", async (c) => {
  const share = await reachableShare(c.req.param("token"));
  if (!share) return c.json(error("NOT_FOUND", "this reference link is no longer available"), 404);
  if (!share.ndaAcceptedAt) await markReferenceShareNdaAccepted(share.id);
  return c.json(
    success({
      label: share.label,
      requireNda: share.requireNda,
      unlocked: true,
      contacts: await loadShareContacts(share.contactIds),
    }),
    200,
  );
});
