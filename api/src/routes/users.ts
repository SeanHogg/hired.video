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

const SendConnectionRequestSchema = z.object({
  toUserId: z.string().min(1),
  message: z.string().optional(),
});

// ============================================================================
// ROUTES
// ============================================================================

export const userRoutes = new Hono<{ Variables: Variables }>();

function nowIso() {
  return new Date().toISOString();
}

function toUserProfileDto(row: {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerified: boolean;
  createdAt: Date | string;
  updatedAt?: Date | string;
}) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    headline: "",
    summary: "",
    location: "",
    avatarUrl: "",
    profilePictureUrl: "",
    isPublic: true,
    isVerified: row.emailVerified,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt ?? row.createdAt).toISOString(),
  };
}

function makeConnection(id: string, fromUserId: string, toUserId: string, status: "Pending" | "Accepted" | "Rejected") {
  const now = nowIso();
  return {
    id,
    fromUserId,
    toUserId,
    status,
    requestMessage: "",
    responseMessage: "",
    createdAt: now,
    updatedAt: now,
  };
}

const inMemoryConnections = new Map<string, ReturnType<typeof makeConnection>>();

/** GET /api/users/public — list public users (no auth required) */
userRoutes.get("/public", async (c) => {
  const db = getDb();
  const page = Number(c.req.query("page") ?? 1) || 1;
  const limit = Math.min(Number(c.req.query("limit") ?? 20) || 20, 100);
  const offset = (page - 1) * limit;

  const items = await db
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
    .limit(limit)
    .offset(offset);

  const total = items.length;

  return c.json(success({ items, total, page, limit }));
});

/** GET /api/users/me — frontend compatibility endpoint */
userRoutes.get("/me", async (c) => {
  const user = c.var.user;
  const db = getDb();

  const [me] = await db
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

  if (!me) {
    return c.json(error("NOT_FOUND", "User not found"), 404);
  }

  return c.json(success(toUserProfileDto(me)), 200);
});

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

/** PUT /api/users/me — frontend compatibility endpoint */
userRoutes.put("/me", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  const db = getDb();
  const updates: Partial<{ name: string; email: string; updatedAt: Date }> = { updatedAt: new Date() };
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
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    });

  if (!updated) {
    return c.json(error("NOT_FOUND", "User not found"), 404);
  }

  return c.json(success(toUserProfileDto(updated)), 200);
});

/** POST /api/users/connections — send connection request */
userRoutes.post("/connections", async (c) => {
  const from = c.var.user.sub;
  const body = await c.req.json().catch(() => null);
  const parsed = SendConnectionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  const connection = makeConnection(crypto.randomUUID(), from, parsed.data.toUserId, "Pending");
  inMemoryConnections.set(connection.id, connection);
  return c.json(success(connection), 201);
});

/** GET /api/users/me/connections */
userRoutes.get("/me/connections", async (c) => {
  const me = c.var.user.sub;
  const list = Array.from(inMemoryConnections.values()).filter(
    (conn) => conn.status === "Accepted" && (conn.fromUserId === me || conn.toUserId === me),
  );
  return c.json(success(list), 200);
});

/** GET /api/users/me/connections/pending */
userRoutes.get("/me/connections/pending", async (c) => {
  const me = c.var.user.sub;
  const list = Array.from(inMemoryConnections.values()).filter(
    (conn) => conn.status === "Pending" && conn.toUserId === me,
  );
  return c.json(success(list), 200);
});

/** PUT /api/users/connections/:id/accept */
userRoutes.put("/connections/:id/accept", async (c) => {
  const id = c.req.param("id");
  const existing = inMemoryConnections.get(id);
  if (!existing) {
    return c.json(error("NOT_FOUND", "Connection request not found"), 404);
  }

  const updated = { ...existing, status: "Accepted" as const, updatedAt: nowIso() };
  inMemoryConnections.set(id, updated);
  return c.json(success(updated), 200);
});

/** DELETE /api/users/connections/:id */
userRoutes.delete("/connections/:id", async (c) => {
  inMemoryConnections.delete(c.req.param("id"));
  return c.json(success(null), 200);
});

/** GET /api/users/connections/status */
userRoutes.get("/connections/status", async (c) => {
  const fromUserId = c.req.query("fromUserId") ?? "";
  const toUserId = c.req.query("toUserId") ?? "";
  const found = Array.from(inMemoryConnections.values()).find(
    (conn) =>
      (conn.fromUserId === fromUserId && conn.toUserId === toUserId) ||
      (conn.fromUserId === toUserId && conn.toUserId === fromUserId),
  );

  if (!found) {
    return c.json(error("NOT_FOUND", "Connection not found"), 404);
  }
  return c.json(success(found), 200);
});

/** GET /api/users/me/recommendations */
userRoutes.get("/me/recommendations", async (c) => {
  return c.json(success([]), 200);
});

/** GET /api/users/:id/connections */
userRoutes.get("/:id/connections", async (c) => {
  const userId = c.req.param("id");
  const list = Array.from(inMemoryConnections.values()).filter(
    (conn) => conn.status === "Accepted" && (conn.fromUserId === userId || conn.toUserId === userId),
  );
  return c.json(success(list), 200);
});

/** GET /api/users/:id/can-message */
userRoutes.get("/:id/can-message", async (c) => {
  return c.json(success({ canMessage: true }), 200);
});

/** GET /api/users/:id/stats */
userRoutes.get("/:id/stats", async (c) => {
  return c.json(
    success({
      resumeCount: 0,
      connectionCount: 0,
      jobApplicationCount: 0,
    }),
    200,
  );
});

/** GET /api/users/:id/resumes */
userRoutes.get("/:id/resumes", async (c) => {
  return c.json(success([]), 200);
});

/** GET /api/users/:id — public profile by id */
userRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
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
    .where(eq(users.id, id))
    .limit(1);

  if (!profile) {
    return c.json(error("NOT_FOUND", "User not found"), 404);
  }

  return c.json(success(toUserProfileDto(profile)), 200);
});

/** DELETE /api/users/account — permanently delete the authenticated user's account */
userRoutes.delete("/account", async (c) => {
  const user = c.var.user;
  const db = getDb();

  await db.delete(users).where(eq(users.id, user.sub));

  return c.json(success(null));
});
