import { Hono } from "hono";
import { eq, or, and, lte } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { seedOnboardingTasks } from "../lib/onboarding.js";
import { cdnUrl } from "../utils/cdn.js";

const { users, userProfiles, userConnections, tasks, privacyPreferences } = schema;

// Explicit column list for userProfiles — avoids SELECT * and protects against
// schema columns that haven't been migrated to the DB yet.
const profileCols = {
  userId: userProfiles.userId, headline: userProfiles.headline, summary: userProfiles.summary,
  location: userProfiles.location, website: userProfiles.website, phone: userProfiles.phone,
  linkedIn: userProfiles.linkedIn, github: userProfiles.github, twitter: userProfiles.twitter,
  currentRole: userProfiles.currentRole, currentCompany: userProfiles.currentCompany,
  avatarUrl: userProfiles.avatarUrl, yearsOfExperience: userProfiles.yearsOfExperience,
  openToWork: userProfiles.openToWork, openToRemote: userProfiles.openToRemote,
  salaryCurrency: userProfiles.salaryCurrency, salaryExpectation: userProfiles.salaryExpectation,
  skills: userProfiles.skills, industries: userProfiles.industries, preferredRoles: userProfiles.preferredRoles,
  profileVisibility: userProfiles.profileVisibility, customUrlSlug: userProfiles.customUrlSlug,
  updatedAt: userProfiles.updatedAt,
} as const;

/** Map frontend PascalCase role to DB snake_case role */
function normalizeRole(role: string): string | null {
  const map: Record<string, string> = {
    jobseeker: "job_seeker",
    job_seeker: "job_seeker",
    recruiter: "recruiter",
    employer: "employer",
    affiliate: "affiliate",
    admin: "admin",
  };
  return map[role.toLowerCase()] ?? null;
}

// ============================================================================
// SCHEMAS
// ============================================================================

const UpdateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().optional(),
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  headline: z.string().optional(),
  summary: z.string().optional(),
  location: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  linkedIn: z.string().optional(),
  gitHub: z.string().optional(),  // frontend sends camelCase gitHub
  github: z.string().optional(),
  twitter: z.string().optional(),
  currentRole: z.string().optional(),
  currentCompany: z.string().optional(),
  avatarUrl: z.string().optional(),
  openToWork: z.boolean().optional(),
  openToRemote: z.boolean().optional(),
  salaryCurrency: z.string().optional(),
  salaryExpectation: z.number().int().optional(),
  yearsOfExperience: z.number().int().optional(),
  skills: z.array(z.string()).optional(),
  industries: z.array(z.string()).optional(),
  preferredRoles: z.array(z.string()).optional(),
  role: z.string().optional(),
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

function makeConnectionDto(row: {
  id: string; fromUserId: string; toUserId: string; status: string;
  requestMessage: string | null; responseMessage: string | null;
  createdAt: Date | string; updatedAt: Date | string;
}) {
  return {
    id: row.id,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    status: row.status,
    requestMessage: row.requestMessage ?? "",
    responseMessage: row.responseMessage ?? "",
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function toUserProfileDto(
  row: {
    id: string; email: string; name: string; role: string;
    emailVerified: boolean; createdAt: Date | string; updatedAt?: Date | string;
  },
  profile?: {
    headline?: string | null; summary?: string | null; location?: string | null;
    website?: string | null; phone?: string | null;
    customUrlSlug?: string | null;
    linkedIn?: string | null; github?: string | null; twitter?: string | null;
    currentRole?: string | null; currentCompany?: string | null;
    avatarUrl?: string | null; openToWork?: boolean | null; openToRemote?: boolean | null;
    salaryCurrency?: string | null; salaryExpectation?: number | null;
    yearsOfExperience?: number | null;
    skills?: string[] | null; industries?: string[] | null; preferredRoles?: string[] | null;
    updatedAt?: Date | string | null;
  } | null,
  privacyOptions?: {
    isOwner?: boolean;
    privacy?: {
      showEmail?: boolean;
      showPhone?: boolean;
      showLocation?: boolean;
    } | null;
  },
) {
  const nameParts = (row.name ?? "").split(" ");
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ");
  const profileUpdatedAt = profile?.updatedAt ?? row.updatedAt ?? row.createdAt;

  // Privacy gating: redact contact fields for non-owners when toggled off.
  // Owners always see their own data. Defaults: email/phone/location hidden.
  const isOwner = privacyOptions?.isOwner ?? true;
  const showEmail = privacyOptions?.privacy?.showEmail ?? false;
  const showPhone = privacyOptions?.privacy?.showPhone ?? false;
  const showLocation = privacyOptions?.privacy?.showLocation ?? false;

  const visibleEmail = isOwner || showEmail ? row.email : null;
  const visiblePhone = isOwner || showPhone ? (profile?.phone ?? "") : null;
  const visibleLocation = isOwner || showLocation ? (profile?.location ?? "") : null;

  return {
    id: row.id,
    slug: profile?.customUrlSlug ?? "",
    email: visibleEmail,
    userName: row.email,
    showEmail,
    showPhone,
    showLocation,
    data: {
      firstName,
      lastName,
      avatar: profile?.avatarUrl ?? "",
      headline: profile?.headline ?? "",
      summary: profile?.summary ?? "",
      location: visibleLocation,
      website: profile?.website ?? "",
      linkedIn: profile?.linkedIn ?? "",
      github: profile?.github ?? "",
      phone: visiblePhone,
      currentRole: profile?.currentRole ?? "",
      currentCompany: profile?.currentCompany ?? "",
      showEmail,
      showPhone,
      showLocation,
    },
    role: row.role,
    isPremium: false,
    isDemo: false,
    isVerified: row.emailVerified,
    openToWork: profile?.openToWork ?? false,
    openToRemote: profile?.openToRemote ?? false,
    salaryCurrency: profile?.salaryCurrency ?? "USD",
    salaryExpectation: profile?.salaryExpectation ?? null,
    yearsOfExperience: profile?.yearsOfExperience ?? null,
    skills: profile?.skills ?? [],
    industries: profile?.industries ?? [],
    preferredRoles: profile?.preferredRoles ?? [],
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(profileUpdatedAt).toISOString(),
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

  const [profile] = await db
    .select(profileCols)
    .from(userProfiles)
    .where(eq(userProfiles.userId, user.sub))
    .limit(1);

  return c.json(success(toUserProfileDto(me, profile ?? null)), 200);
});

/** GET /api/users/profile — get the authenticated user's profile */
userRoutes.get("/profile", async (c) => {
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

  const [profile] = await db
    .select(profileCols)
    .from(userProfiles)
    .where(eq(userProfiles.userId, user.sub))
    .limit(1);

  return c.json(success(toUserProfileDto(me, profile ?? null)), 200);
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
  const d = parsed.data;

  const firstName = d.firstName ?? "";
  const lastName = d.lastName ?? "";
  const fullName = d.name ?? (firstName || lastName ? `${firstName} ${lastName}`.trim() : undefined);

  const userUpdates: Partial<{ name: string; email: string; updatedAt: Date }> = { updatedAt: new Date() };
  if (fullName) userUpdates.name = fullName;
  if (d.email) userUpdates.email = d.email;

  const [updated] = await db
    .update(users)
    .set(userUpdates)
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

  const profileData = {
    userId: user.sub,
    headline: d.headline ?? null,
    summary: d.summary ?? null,
    location: d.location ?? null,
    website: d.website ?? null,
    phone: d.phone ?? null,
    linkedIn: d.linkedIn ?? null,
    github: d.github ?? d.gitHub ?? null,
    twitter: d.twitter ?? null,
    currentRole: d.currentRole ?? null,
    currentCompany: d.currentCompany ?? null,
    avatarUrl: d.avatarUrl ?? null,
    openToWork: d.openToWork ?? false,
    openToRemote: d.openToRemote ?? false,
    salaryCurrency: d.salaryCurrency ?? null,
    salaryExpectation: d.salaryExpectation ?? null,
    yearsOfExperience: d.yearsOfExperience ?? null,
    skills: d.skills ?? [],
    industries: d.industries ?? [],
    preferredRoles: d.preferredRoles ?? [],
    updatedAt: new Date(),
  } as any;

  const [profile] = await db
    .insert(userProfiles)
    .values({ ...profileData, createdAt: new Date() })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: profileData,
    })
    .returning();

  return c.json(success(toUserProfileDto(updated, profile ?? null)), 200);
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
  const d = parsed.data;

  // Derive name from firstName/lastName if provided
  const firstName = d.firstName ?? "";
  const lastName = d.lastName ?? "";
  const fullName = d.name ?? (firstName || lastName ? `${firstName} ${lastName}`.trim() : undefined);

  // Update users table (name/email/role)
  const userUpdates: Partial<{ name: string; email: string; role: string; updatedAt: Date }> = { updatedAt: new Date() };
  if (fullName) userUpdates.name = fullName;
  if (d.email) userUpdates.email = d.email;

  // Persist role change if provided
  const newRole = d.role ? normalizeRole(d.role) : null;
  if (newRole) userUpdates.role = newRole;

  const [updated] = await db
    .update(users)
    .set(userUpdates as any)
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

  // Upsert user_profiles
  const profileData = {
    userId: user.sub,
    headline: d.headline ?? null,
    summary: d.summary ?? null,
    location: d.location ?? null,
    website: d.website ?? null,
    phone: d.phone ?? null,
    linkedIn: d.linkedIn ?? null,
    github: d.github ?? d.gitHub ?? null,
    twitter: d.twitter ?? null,
    currentRole: d.currentRole ?? null,
    currentCompany: d.currentCompany ?? null,
    avatarUrl: d.avatarUrl ?? null,
    openToWork: d.openToWork ?? false,
    openToRemote: d.openToRemote ?? false,
    salaryCurrency: d.salaryCurrency ?? null,
    salaryExpectation: d.salaryExpectation ?? null,
    yearsOfExperience: d.yearsOfExperience ?? null,
    skills: d.skills ?? [],
    industries: d.industries ?? [],
    preferredRoles: d.preferredRoles ?? [],
    updatedAt: new Date(),
  } as any;

  const [profile] = await db
    .insert(userProfiles)
    .values({ ...profileData, createdAt: new Date() })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: profileData,
    })
    .returning();

  // When the role changes, replace onboarding tasks for the new role (fire-and-forget)
  if (newRole) {
    c.executionCtx.waitUntil(
      (async () => {
        try {
          // Delete existing onboarding tasks (taskType 10–19)
          const existingTasks = await db.select({ id: tasks.id, metadata: tasks.metadata }).from(tasks).where(eq(tasks.userId, user.sub));
          const onboardingIds = existingTasks
            .filter((t) => {
              const meta = (t.metadata ?? {}) as Record<string, unknown>;
              const tt = typeof meta.taskType === "number" ? meta.taskType : -1;
              return tt >= 10 && tt <= 19;
            })
            .map((t) => t.id);
          for (const id of onboardingIds) {
            await db.delete(tasks).where(eq(tasks.id, id));
          }
          // Re-seed for new role
          await seedOnboardingTasks(user.sub, newRole);
        } catch (err) {
          console.error("[users/me] Failed to re-seed onboarding tasks:", err);
        }
      })(),
    );
  }

  return c.json(success(toUserProfileDto(updated, profile ?? null)), 200);
});

/** POST /api/users/connections — send connection request */
userRoutes.post("/connections", async (c) => {
  const from = c.var.user.sub;
  const body = await c.req.json().catch(() => null);
  const parsed = SendConnectionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  if (from === parsed.data.toUserId) {
    return c.json(error("BAD_REQUEST", "Cannot send connection request to yourself"), 400);
  }

  const db = getDb();
  const [conn] = await db
    .insert(userConnections)
    .values({
      fromUserId: from,
      toUserId: parsed.data.toUserId,
      status: "Pending",
      requestMessage: parsed.data.message ?? null,
    } as any)
    .returning();

  return c.json(success(makeConnectionDto(conn)), 201);
});

/** GET /api/users/me/connections */
userRoutes.get("/me/connections", async (c) => {
  const me = c.var.user.sub;
  const db = getDb();
  const list = await db
    .select()
    .from(userConnections)
    .where(
      and(
        eq(userConnections.status, "Accepted"),
        or(eq(userConnections.fromUserId, me), eq(userConnections.toUserId, me)),
      ),
    );
  return c.json(success(list.map(makeConnectionDto)), 200);
});

/** GET /api/users/me/connections/pending */
userRoutes.get("/me/connections/pending", async (c) => {
  const me = c.var.user.sub;
  const db = getDb();
  const list = await db
    .select()
    .from(userConnections)
    .where(and(eq(userConnections.status, "Pending"), eq(userConnections.toUserId, me)));
  return c.json(success(list.map(makeConnectionDto)), 200);
});

/** PUT /api/users/connections/:id/accept */
userRoutes.put("/connections/:id/accept", async (c) => {
  const id = c.req.param("id");
  const me = c.var.user.sub;
  const db = getDb();

  const [updated] = await db
    .update(userConnections)
    .set({ status: "Accepted", updatedAt: new Date() } as any)
    .where(and(eq(userConnections.id, id), eq(userConnections.toUserId, me)))
    .returning();

  if (!updated) {
    return c.json(error("NOT_FOUND", "Connection request not found"), 404);
  }
  return c.json(success(makeConnectionDto(updated)), 200);
});

/** DELETE /api/users/connections/:id */
userRoutes.delete("/connections/:id", async (c) => {
  const id = c.req.param("id");
  const me = c.var.user.sub;
  const db = getDb();

  await db
    .delete(userConnections)
    .where(
      and(
        eq(userConnections.id, id),
        or(eq(userConnections.fromUserId, me), eq(userConnections.toUserId, me)),
      ),
    );
  return c.json(success(null), 200);
});

/** GET /api/users/connections/status */
userRoutes.get("/connections/status", async (c) => {
  const fromUserId = c.req.query("fromUserId") ?? "";
  const toUserId = c.req.query("toUserId") ?? "";
  const db = getDb();

  const [found] = await db
    .select()
    .from(userConnections)
    .where(
      or(
        and(eq(userConnections.fromUserId, fromUserId), eq(userConnections.toUserId, toUserId)),
        and(eq(userConnections.fromUserId, toUserId), eq(userConnections.toUserId, fromUserId)),
      ),
    )
    .limit(1);

  if (!found) {
    return c.json(error("NOT_FOUND", "Connection not found"), 404);
  }
  return c.json(success(makeConnectionDto(found)), 200);
});

/** GET /api/users/me/recommendations */
userRoutes.get("/me/recommendations", async (c) => {
  return c.json(success([]), 200);
});

/** GET /api/users/:id/connections */
userRoutes.get("/:id/connections", async (c) => {
  const userId = c.req.param("id");
  const db = getDb();
  const list = await db
    .select()
    .from(userConnections)
    .where(
      and(
        eq(userConnections.status, "Accepted"),
        or(eq(userConnections.fromUserId, userId), eq(userConnections.toUserId, userId)),
      ),
    );
  return c.json(success(list.map(makeConnectionDto)), 200);
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

/** GET /api/users/:id/resumes — return public resumes for a user (privacyLevel=0) */
userRoutes.get("/:id/resumes", async (c) => {
  const id = c.req.param("id");
  const caller = c.var.user;
  const db = getDb();
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  let targetUserId: string | undefined;
  if (isUUID) {
    targetUserId = id;
  } else {
    const [p] = await db.select({ userId: schema.userProfiles.userId }).from(schema.userProfiles).where(eq(schema.userProfiles.customUrlSlug, id)).limit(1);
    targetUserId = p?.userId;
  }
  if (!targetUserId) return c.json(success([]), 200);

  const isOwner = caller?.sub === targetUserId;
  // Owners see all their resumes; others see only public ones (privacyLevel=0)
  const rows = await db
    .select({ id: schema.resumeInformation.id, title: schema.resumeInformation.title, status: schema.resumeInformation.status, privacyLevel: schema.resumeInformation.privacyLevel, createdAt: schema.resumeInformation.createdAt, updatedAt: schema.resumeInformation.updatedAt })
    .from(schema.resumeInformation)
    .where(
      isOwner
        ? eq(schema.resumeInformation.userId, targetUserId)
        : and(eq(schema.resumeInformation.userId, targetUserId), lte(schema.resumeInformation.privacyLevel, 0)),
    );

  return c.json(success(rows), 200);
});

/** PATCH /api/users/slug — update the authenticated user's custom URL slug */
userRoutes.patch("/slug", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers and hyphens"),
  }).safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid slug", { issues: parsed.error.flatten() }), 400);
  }
  const db = getDb();
  // Check uniqueness across userProfiles
  const [existing] = await db
    .select({ userId: userProfiles.userId })
    .from(userProfiles)
    .where(eq(userProfiles.customUrlSlug, parsed.data.slug))
    .limit(1);
  if (existing && existing.userId !== user.sub) {
    return c.json(error("CONFLICT", "This slug is already taken"), 409);
  }
  // Upsert profile row with new slug
  await db
    .insert(userProfiles)
    .values({ userId: user.sub, customUrlSlug: parsed.data.slug, createdAt: new Date(), updatedAt: new Date() } as any)
    .onConflictDoUpdate({ target: userProfiles.userId, set: { customUrlSlug: parsed.data.slug, updatedAt: new Date() } as any });
  return c.json(success({ slug: parsed.data.slug }), 200);
});

/** GET /api/users/check-slug/:slug — check if a slug is available (no auth required) */
userRoutes.get("/check-slug/:slug", async (c) => {
  const slug = c.req.param("slug");
  const meId = (c.var as any).user?.sub as string | undefined;
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) {
    return c.json(success({ available: false, reason: "Invalid format" }), 200);
  }
  const db = getDb();
  const [existing] = await db
    .select({ userId: userProfiles.userId })
    .from(userProfiles)
    .where(eq(userProfiles.customUrlSlug, slug))
    .limit(1);
  const available = !existing || existing.userId === meId;
  return c.json(success({ available }), 200);
});

/** GET /api/users/:id — profile by id or custom slug; visibility-conditional */
userRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const caller = c.var.user; // set by optionalAuthMiddleware — may be undefined
  const db = getDb();
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  let me: { id: string; email: string; name: string; role: string; emailVerified: boolean; createdAt: Date | string; updatedAt?: Date | string } | undefined;
  let profile: typeof userProfiles.$inferSelect | undefined;

  if (isUUID) {
    const [row] = await db
      .select({ id: users.id, email: users.email, name: users.name, role: users.role, emailVerified: users.emailVerified, createdAt: users.createdAt, updatedAt: users.updatedAt })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    me = row;
    if (me) {
      const [p] = await db.select(profileCols).from(userProfiles).where(eq(userProfiles.userId, me.id)).limit(1);
      profile = p as any;
    }
  } else {
    // Slug lookup via userProfiles
    const [p] = await db.select(profileCols).from(userProfiles).where(eq(userProfiles.customUrlSlug, id)).limit(1);
    profile = p as any;
    if (p) {
      const [row] = await db
        .select({ id: users.id, email: users.email, name: users.name, role: users.role, emailVerified: users.emailVerified, createdAt: users.createdAt, updatedAt: users.updatedAt })
        .from(users)
        .where(eq(users.id, p.userId))
        .limit(1);
      me = row;
    }
  }

  if (!me) {
    return c.json(error("NOT_FOUND", "User not found"), 404);
  }

  const visibility = profile?.profileVisibility ?? "public";
  const isOwner = caller?.sub === me.id;

  // Private profiles are only visible to the owner
  if (visibility === "private" && !isOwner) {
    return c.json(error("FORBIDDEN", "This profile is private"), 403);
  }

  // Connections-only profiles require authentication at minimum
  if (visibility === "connections" && !caller) {
    return c.json(error("UNAUTHORIZED", "Authentication required to view this profile"), 401);
  }

  // Enrich with public resume and video counts for "Hire Me" profile page
  const [publicResumes, publicVideos, privacyRow] = await Promise.all([
    db.select({ id: schema.resumeInformation.id })
      .from(schema.resumeInformation)
      .where(and(eq(schema.resumeInformation.userId, me.id), lte(schema.resumeInformation.privacyLevel, 0))),
    db.select({ id: schema.videos.id, title: schema.videos.title, thumbnailUrl: schema.videos.thumbnailUrl, youtubeUrl: schema.videos.youtubeUrl, createdAt: schema.videos.createdAt })
      .from(schema.videos)
      .where(and(eq(schema.videos.userId, me.id), eq(schema.videos.isPublic, true))),
    db.select({
      showEmail: privacyPreferences.showEmail,
      showPhone: privacyPreferences.showPhone,
      showLocation: privacyPreferences.showLocation,
    })
      .from(privacyPreferences)
      .where(eq(privacyPreferences.userId, me.id))
      .limit(1),
  ]);

  return c.json(success({
    ...toUserProfileDto(me, profile ?? null, { isOwner, privacy: privacyRow[0] ?? null }),
    publicResumeCount: publicResumes.length,
    publicVideos,
  }), 200);
});

const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const AVATAR_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/** POST /api/users/me/avatar — upload a new avatar (5MB, jpg/png/gif/webp only) */
userRoutes.post("/me/avatar", async (c) => {
  const user = c.var.user;
  const form = await c.req.formData().catch(() => null);
  const part = (form?.get("avatar") ?? form?.get("file")) as File | null;

  if (!part || typeof part.arrayBuffer !== "function") {
    return c.json(error("VALIDATION_ERROR", "Missing avatar file in form field 'avatar'"), 400);
  }

  const contentType = part.type || "application/octet-stream";
  if (!AVATAR_ALLOWED_TYPES.has(contentType)) {
    return c.json(error("VALIDATION_ERROR", `Only jpg, png, gif, and webp images are allowed. Got: ${contentType}`), 415);
  }

  const bytes = await part.arrayBuffer();
  if (bytes.byteLength > AVATAR_MAX_BYTES) {
    return c.json(error("PAYLOAD_TOO_LARGE", `Avatar must be under 5 MB. File is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB`), 413);
  }

  const ext = part.name?.split(".").pop()?.toLowerCase() ?? "jpg";
  const key = `uploads/${user.sub}/avatars/${crypto.randomUUID()}.${ext}`;

  const bucket: any = (globalThis as any).__ENV?.VIDEO_BUCKET;
  if (!bucket) {
    // No bucket configured (local dev) — return a data URL stub
    const db = getDb();
    const stubUrl = cdnUrl(key);
    await db.insert(userProfiles)
      .values({ userId: user.sub, avatarUrl: stubUrl, createdAt: new Date(), updatedAt: new Date() } as any)
      .onConflictDoUpdate({ target: userProfiles.userId, set: { avatarUrl: stubUrl, updatedAt: new Date() } as any });
    return c.json(success({ avatarUrl: stubUrl }), 200);
  }

  await bucket.put(key, bytes, { httpMetadata: { contentType } });
  const avatarUrl = cdnUrl(key);

  const db = getDb();
  await db.insert(userProfiles)
    .values({ userId: user.sub, avatarUrl, createdAt: new Date(), updatedAt: new Date() } as any)
    .onConflictDoUpdate({ target: userProfiles.userId, set: { avatarUrl, updatedAt: new Date() } as any });

  return c.json(success({ avatarUrl }), 200);
});

/** DELETE /api/users/account — permanently delete the authenticated user's account */
userRoutes.delete("/account", async (c) => {
  const user = c.var.user;
  const db = getDb();

  await db.delete(users).where(eq(users.id, user.sub));

  return c.json(success(null));
});
