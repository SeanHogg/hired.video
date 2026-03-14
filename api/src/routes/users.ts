import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

const { users } = schema;

// ============================================================================
// SCHEMAS
// ============================================================================

const UpdateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

// ============================================================================
// ROUTES
// ============================================================================

export const userRoutes = new Hono<{ Variables: Variables }>();

/** GET /api/users/profile — get the authenticated user's profile */
userRoutes.get("/profile", async (c) => {
  const user = c.var.user;
  const db = getDb();

  const [profile] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, user.sub))
    .limit(1);

  if (!profile) {
    return c.json(error("NOT_FOUND", "User not found"), 404);
  }

  return c.json(success(profile));
});

/** PUT /api/users/profile — update the authenticated user's profile */
userRoutes.put("/profile", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  const db = getDb();

  const updates: Partial<{ name: string; email: string; updatedAt: Date }> = {
    updatedAt: new Date(),
  };
  if (parsed.data.name) updates.name = parsed.data.name;
  if (parsed.data.email) updates.email = parsed.data.email;

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, user.sub))
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      emailVerified: users.emailVerified,
      updatedAt: users.updatedAt,
    });

  if (!updated) {
    return c.json(error("NOT_FOUND", "User not found"), 404);
  }

  return c.json(success(updated));
});

/** DELETE /api/users/account — permanently delete the authenticated user's account */
userRoutes.delete("/account", async (c) => {
  const user = c.var.user;
  const db = getDb();

  await db.delete(users).where(eq(users.id, user.sub));

  return c.json(success(null, "Account deleted"));
});
