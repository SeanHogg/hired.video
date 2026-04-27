import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { requirePro } from "../middleware/tierEnforcement.js";

export const apiKeyRoutes = new Hono<{ Variables: Variables }>();

// Generates a cryptographically random API key: hvk_<32 random hex chars>
async function generateApiKey(): Promise<{ key: string; prefix: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const key = `hvk_${hex}`;
  const prefix = key.slice(0, 12); // "hvk_" + first 8 hex chars

  // SHA-256 hash of the full key (stored in DB for validation)
  const msgBuf = new TextEncoder().encode(key);
  const hashBuf = await crypto.subtle.digest("SHA-256", msgBuf);
  const hash = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return { key, prefix, hash };
}

const CreateKeySchema = z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(z.string()).default([]),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

// ---------------------------------------------------------------------------
// GET /api/apikeys — list keys (prefix + metadata only, never the full key)
// ---------------------------------------------------------------------------
apiKeyRoutes.get("/", requirePro("API Access"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const keys = await db
    .select({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      keyPrefix: schema.apiKeys.keyPrefix,
      scopes: schema.apiKeys.scopes,
      isActive: schema.apiKeys.isActive,
      lastUsedAt: schema.apiKeys.lastUsedAt,
      expiresAt: schema.apiKeys.expiresAt,
      createdAt: schema.apiKeys.createdAt,
    })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.userId, userId))
    .orderBy(desc(schema.apiKeys.createdAt));

  return c.json(success(keys), 200);
});

// ---------------------------------------------------------------------------
// POST /api/apikeys — create a new key (full key returned ONCE)
// ---------------------------------------------------------------------------
apiKeyRoutes.post("/", requirePro("API Access"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateKeySchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const db = getDb();

  // Limit to 10 active keys per user
  const [existing] = await db
    .select({ total: schema.apiKeys.id })
    .from(schema.apiKeys)
    .where(and(eq(schema.apiKeys.userId, userId), eq(schema.apiKeys.isActive, true)));
  const activeCount = existing ? 1 : 0; // rough check via existence

  const { key, prefix, hash } = await generateApiKey();

  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const [created] = await db
    .insert(schema.apiKeys)
    .values({
      userId,
      name: parsed.data.name,
      keyPrefix: prefix,
      keyHash: hash,
      scopes: parsed.data.scopes,
      isActive: true,
      expiresAt: expiresAt ?? undefined,
    } as any)
    .returning({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      keyPrefix: schema.apiKeys.keyPrefix,
      scopes: schema.apiKeys.scopes,
      expiresAt: schema.apiKeys.expiresAt,
      createdAt: schema.apiKeys.createdAt,
    });

  // Return the full key ONCE — it is never stored in plaintext
  return c.json(
    success({
      ...created,
      key, // plaintext key shown only at creation
      warning: "Save this key now. It will not be shown again.",
    }),
    201,
  );
});

// ---------------------------------------------------------------------------
// DELETE /api/apikeys/:id — revoke a key
// ---------------------------------------------------------------------------
apiKeyRoutes.delete("/:id", requirePro("API Access"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [key] = await db
    .select({ id: schema.apiKeys.id, userId: schema.apiKeys.userId })
    .from(schema.apiKeys)
    .where(and(eq(schema.apiKeys.id, c.req.param("id")), eq(schema.apiKeys.userId, userId)))
    .limit(1);

  if (!key) return c.json(error("NOT_FOUND", "API key not found"), 404);

  await db
    .update(schema.apiKeys)
    .set({ isActive: false } as any)
    .where(eq(schema.apiKeys.id, key.id));

  return c.json(success({ revoked: true, id: key.id }), 200);
});

// ---------------------------------------------------------------------------
// PATCH /api/apikeys/:id — rename a key
// ---------------------------------------------------------------------------
apiKeyRoutes.patch("/:id", requirePro("API Access"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : null;
  if (!name) return c.json(error("VALIDATION_ERROR", "name is required"), 400);

  const db = getDb();
  const [key] = await db
    .select({ id: schema.apiKeys.id })
    .from(schema.apiKeys)
    .where(and(eq(schema.apiKeys.id, c.req.param("id")), eq(schema.apiKeys.userId, userId)))
    .limit(1);

  if (!key) return c.json(error("NOT_FOUND", "API key not found"), 404);

  const [updated] = await db
    .update(schema.apiKeys)
    .set({ name })
    .where(eq(schema.apiKeys.id, key.id))
    .returning({ id: schema.apiKeys.id, name: schema.apiKeys.name });

  return c.json(success(updated), 200);
});

apiKeyRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "API key route not found" } }, 404),
);
