/**
 * LRS credential management (mig 0490) — authenticated, owner-scoped CRUD for
 * the Basic-auth credentials external tools use against our xAPI LRS
 * (/api/xapi). Mounted at /api/learning/lrs-credentials behind the normal JWT
 * layer. The credential SECRET is returned exactly once, on create/rotate.
 *
 * Not cached: this is a small, per-user, security-sensitive list that MUST
 * reflect a revoke/rotate immediately — stale reads here would be a security
 * regression, and read volume is negligible.
 */
import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { generateLrsSecret, basicAuthValue } from "../services/learning/lrs-service.js";
import { LRS_PERMISSIONS, type LrsCredential } from "../db/schema/learning.js";

export const lrsCredentialRoutes = new Hono<{ Variables: Variables } & AppEnv>();

const { lrsCredentials } = schema;

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

/** Safe projection — never leaks secret_hash. */
function toView(row: LrsCredential) {
  return {
    id: row.id,
    label: row.label,
    keyId: row.keyId,
    permission: row.permission,
    active: row.active,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
  };
}

const CreateSchema = z.object({
  label: z.string().min(1).max(200),
  permission: z.enum(LRS_PERMISSIONS).default("read_write"),
});

const UpdateSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  permission: z.enum(LRS_PERMISSIONS).optional(),
  active: z.boolean().optional(),
});

lrsCredentialRoutes.get("/", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db.select().from(lrsCredentials)
    .where(eq(lrsCredentials.ownerUserId, userId))
    .orderBy(desc(lrsCredentials.createdAt));
  // The LRS endpoint the credentials authenticate against — handy for the UI.
  return c.json(success({ endpoint: "/api/xapi", credentials: rows.map(toView) }), 200);
});

lrsCredentialRoutes.post("/", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = CreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);

  const { keyId, secret, secretHash } = await generateLrsSecret();
  const db = getDb();
  const [row] = await db.insert(lrsCredentials).values({
    ownerUserId: userId,
    label: parsed.data.label,
    keyId,
    secretHash,
    permission: parsed.data.permission,
    createdBy: userId,
  } as never).returning();

  // Secret + ready-to-use Basic header returned ONCE. Never retrievable again.
  return c.json(success({
    credential: toView(row as LrsCredential),
    secret,
    basicAuth: basicAuthValue(keyId, secret),
    endpoint: "/api/xapi",
  }), 201);
});

/** Rotate the secret — mints a fresh secret for an existing credential,
 *  invalidating the old one. Returns the new secret once. */
lrsCredentialRoutes.post("/:id/rotate", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const { keyId, secret, secretHash } = await generateLrsSecret();
  const [row] = await db.update(lrsCredentials)
    .set({ keyId, secretHash, updatedAt: new Date() } as never)
    .where(and(eq(lrsCredentials.id, c.req.param("id")), eq(lrsCredentials.ownerUserId, userId)))
    .returning();
  if (!row) return c.json(error("NOT_FOUND", "Credential not found"), 404);
  return c.json(success({
    credential: toView(row as LrsCredential),
    secret,
    basicAuth: basicAuthValue(keyId, secret),
    endpoint: "/api/xapi",
  }), 200);
});

lrsCredentialRoutes.patch("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = UpdateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  const db = getDb();
  const [row] = await db.update(lrsCredentials)
    .set({ ...parsed.data, updatedAt: new Date() } as never)
    .where(and(eq(lrsCredentials.id, c.req.param("id")), eq(lrsCredentials.ownerUserId, userId)))
    .returning();
  if (!row) return c.json(error("NOT_FOUND", "Credential not found"), 404);
  return c.json(success(toView(row as LrsCredential)), 200);
});

/** Soft-revoke (active=false). The credential row (and its statements /
 *  documents) is retained — flip `active` back on to restore, or purge via the
 *  data-export tooling. */
lrsCredentialRoutes.delete("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [row] = await db.update(lrsCredentials)
    .set({ active: false, updatedAt: new Date() } as never)
    .where(and(eq(lrsCredentials.id, c.req.param("id")), eq(lrsCredentials.ownerUserId, userId)))
    .returning({ id: lrsCredentials.id });
  if (!row) return c.json(error("NOT_FOUND", "Credential not found"), 404);
  return c.json(success({ revoked: row.id }), 200);
});
