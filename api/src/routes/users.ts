import { Hono } from "hono";
import { eq, or, and, lte, isNull, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getSubscription } from "../services/billing/BillingService.js";
import { getDb, schema } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { seedOnboardingTasks } from "../lib/onboarding.js";
import { cdnUrl } from "../utils/cdn.js";
import { sendConnectionRequestEmail } from "../services/adapters/email.js";
import { USER_ROLES } from "../../../shared/user-roles.js";

const { users, userProfiles, userConnections, tasks, privacyPreferences, notifications } = schema;

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
  providesServices: userProfiles.providesServices,
  updatedAt: userProfiles.updatedAt,
} as const;

/** Map frontend PascalCase role to DB snake_case role */
function normalizeRole(role: string): string | null {
  const map: Record<string, string> = {
    jobseeker: "job_seeker",
    job_seeker: "job_seeker",
    recruiter: "recruiter",
    employer: "employer",
    affiliate: "employer", // Affiliate is a service, not a role — map to employer
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
  avatar: z.string().optional(),
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
  profileVisibility: z.enum(["public", "private", "connections"]).optional(),
});

const SendConnectionRequestSchema = z.object({
  toUserId: z.string().min(1),
  message: z.string().optional(),
});

// ============================================================================
// ROUTES
// ============================================================================

export const userRoutes = new Hono<{ Variables: Variables }>();

/**
 * Standard public card DTO for user listings.
 *
 * Every endpoint that returns user cards for the frontend should use this
 * so the shape is consistent and avatar URLs are resolved once.
 */
function toPublicUserCardDto(r: {
  id: string;
  name: string;
  role: string;
  emailVerified: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  headline?: string | null;
  summary?: string | null;
  location?: string | null;
  avatarUrl?: string | null;
  currentRole?: string | null;
  currentCompany?: string | null;
  openToWork?: boolean | null;
  skills?: string[] | null;
  yearsOfExperience?: number | null;
  profileVisibility?: string | null;
  customUrlSlug?: string | null;
}) {
  const nameParts = (r.name ?? "").split(" ");
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ");
  return {
    id: r.id,
    type: "people" as const,
    firstName,
    lastName,
    fullName: r.name,
    role: r.role,
    headline: r.headline ?? r.currentRole ?? "",
    summary: r.summary ?? "",
    location: r.location ?? "",
    avatar: r.avatarUrl ? cdnUrl(r.avatarUrl) : null,
    currentRole: r.currentRole ?? "",
    currentCompany: r.currentCompany ?? "",
    openToWork: r.openToWork ?? false,
    skills: r.skills ?? [],
    yearsOfExperience: r.yearsOfExperience ?? null,
    emailConfirmed: r.emailVerified,
    slug: r.customUrlSlug ?? r.id,
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
  };
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
    status: row.status.toLowerCase(),
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
    providesServices?: boolean | null;
    profileVisibility?: string | null;
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
    isPremium: row.role === USER_ROLES.SUPER_ADMIN || row.role === USER_ROLES.ADMIN,
    isDemo: false,
    isVerified: row.emailVerified,
    profileVisibility: profile?.profileVisibility ?? "public",
    openToWork: profile?.openToWork ?? false,
    openToRemote: profile?.openToRemote ?? false,
    salaryCurrency: profile?.salaryCurrency ?? "USD",
    salaryExpectation: profile?.salaryExpectation ?? null,
    yearsOfExperience: profile?.yearsOfExperience ?? null,
    skills: profile?.skills ?? [],
    industries: profile?.industries ?? [],
    preferredRoles: profile?.preferredRoles ?? [],
    providesServices: profile?.providesServices ?? false,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(profileUpdatedAt).toISOString(),
  };
}

function nowIso() {
  return new Date().toISOString();
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

/** GET /api/users/public — list public users (optional auth).
 *
 * Joins users + userProfiles so the response carries every field the
 * PeopleCard needs (headline, avatar, location, current role/company,
 * openToWork, slug). Only profiles with profileVisibility === "public"
 * (or NULL — the default public) are returned. */
userRoutes.get("/public", async (c) => {
  const db = getDb();
  const page = Number(c.req.query("page") ?? 1) || 1;
  const limit = Math.min(Number(c.req.query("limit") ?? 20) || 20, 100);
  const offset = (page - 1) * limit;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      headline: userProfiles.headline,
      summary: userProfiles.summary,
      location: userProfiles.location,
      avatarUrl: userProfiles.avatarUrl,
      currentRole: userProfiles.currentRole,
      currentCompany: userProfiles.currentCompany,
      openToWork: userProfiles.openToWork,
      skills: userProfiles.skills,
      yearsOfExperience: userProfiles.yearsOfExperience,
      profileVisibility: userProfiles.profileVisibility,
      customUrlSlug: userProfiles.customUrlSlug,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(
      and(
        eq(users.isActive, true),
        // Hide unverified accounts — keeps spam signups out of the public
        // directory until they prove ownership of the email address.
        eq(users.emailVerified, true),
        or(
          eq(userProfiles.profileVisibility, "public"),
          // Users without a userProfiles row fall through the left join with
          // NULL — still include them since the default visibility is public.
          isNull(userProfiles.userId),
        ),
      ),
    )
    .limit(limit)
    .offset(offset);

  const items = rows.map((r) => toPublicUserCardDto(r));

  return c.json(success({ items, total: items.length, page, limit }));
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

  const meDto = toUserProfileDto(me, profile ?? null);
  const meSub = await getSubscription(user.sub);
  meDto.isPremium = meSub.isPremium;
  return c.json(success(meDto), 200);
});

// ── Shared profile update logic (DRY) ─────────────────────────────────────────
type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

/** Build a partial profile updates object from only the fields that were provided */
function buildProfileUpdates(d: UpdateProfileInput): Record<string, unknown> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (d.headline !== undefined) updates.headline = d.headline;
  if (d.summary !== undefined) updates.summary = d.summary;
  if (d.location !== undefined) updates.location = d.location;
  if (d.website !== undefined) updates.website = d.website;
  if (d.phone !== undefined) updates.phone = d.phone;
  if (d.linkedIn !== undefined) updates.linkedIn = d.linkedIn;
  if (d.github !== undefined || d.gitHub !== undefined) updates.github = d.github ?? d.gitHub;
  if (d.twitter !== undefined) updates.twitter = d.twitter;
  if (d.currentRole !== undefined) updates.currentRole = d.currentRole;
  if (d.currentCompany !== undefined) updates.currentCompany = d.currentCompany;
  if (d.avatar !== undefined || d.avatarUrl !== undefined) updates.avatarUrl = d.avatar ?? d.avatarUrl;
  if (d.openToWork !== undefined) updates.openToWork = d.openToWork;
  if (d.openToRemote !== undefined) updates.openToRemote = d.openToRemote;
  if (d.salaryCurrency !== undefined) updates.salaryCurrency = d.salaryCurrency;
  if (d.salaryExpectation !== undefined) updates.salaryExpectation = d.salaryExpectation;
  if (d.yearsOfExperience !== undefined) updates.yearsOfExperience = d.yearsOfExperience;
  if (d.skills !== undefined) updates.skills = d.skills;
  if (d.industries !== undefined) updates.industries = d.industries;
  if (d.preferredRoles !== undefined) updates.preferredRoles = d.preferredRoles;
  if (d.profileVisibility !== undefined) updates.profileVisibility = d.profileVisibility;
  return updates;
}

const PROFILE_INSERT_DEFAULTS = {
  openToWork: false,
  openToRemote: false,
  skills: [] as string[],
  industries: [] as string[],
  preferredRoles: [] as string[],
};

async function upsertProfile(userId: string, profileUpdates: Record<string, unknown>) {
  const db = getDb();
  const [profile] = await db
    .insert(userProfiles)
    .values({ userId, ...PROFILE_INSERT_DEFAULTS, ...profileUpdates, createdAt: new Date() } as any)
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: profileUpdates as any,
    })
    .returning();
  return profile;
}

/** PUT /api/users/me (and /profile alias) — update authenticated user's profile */
const handleUpdateProfile = async (c: any) => {
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

  const userUpdates: Partial<{ name: string; email: string; role: string; updatedAt: Date }> = { updatedAt: new Date() };
  if (fullName) userUpdates.name = fullName;
  if (d.email) userUpdates.email = d.email;

  const newRole = d.role ? normalizeRole(d.role) : null;
  if (newRole) userUpdates.role = newRole;

  const [updated] = await db
    .update(users)
    .set(userUpdates as any)
    .where(eq(users.id, user.sub))
    .returning({
      id: users.id, email: users.email, name: users.name, role: users.role,
      emailVerified: users.emailVerified, createdAt: users.createdAt, updatedAt: users.updatedAt,
    });

  if (!updated) {
    return c.json(error("NOT_FOUND", "User not found"), 404);
  }

  const profile = await upsertProfile(user.sub, buildProfileUpdates(d));

  // When the role changes, replace onboarding tasks for the new role (fire-and-forget)
  if (newRole) {
    c.executionCtx.waitUntil(
      (async () => {
        try {
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
          await seedOnboardingTasks(user.sub, newRole);
        } catch (err) {
          console.error("[users/me] Failed to re-seed onboarding tasks:", err);
        }
      })(),
    );
  }

  return c.json(success(toUserProfileDto(updated, profile ?? null)), 200);
};
userRoutes.put("/me", handleUpdateProfile);

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

  // Prevent duplicates: if a connection already exists in either direction, return it.
  const [existing] = await db
    .select()
    .from(userConnections)
    .where(
      or(
        and(eq(userConnections.fromUserId, from), eq(userConnections.toUserId, parsed.data.toUserId)),
        and(eq(userConnections.fromUserId, parsed.data.toUserId), eq(userConnections.toUserId, from)),
      ),
    )
    .limit(1);
  if (existing) {
    return c.json(success(makeConnectionDto(existing)), 200);
  }

  const [conn] = await db
    .insert(userConnections)
    .values({
      fromUserId: from,
      toUserId: parsed.data.toUserId,
      status: "Pending",
      requestMessage: parsed.data.message ?? null,
    } as any)
    .returning();

  // Fire-and-forget side effects: inbox notification + email. Don't block the response.
  (async () => {
    try {
      const [[sender], [recipient]] = await Promise.all([
        db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, from)).limit(1),
        db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, parsed.data.toUserId)).limit(1),
      ]);
      const senderName = sender?.name ?? "Someone";
      await db.insert(notifications).values({
        userId: parsed.data.toUserId,
        type: "connection_request",
        title: `${senderName} wants to connect`,
        message: (parsed.data.message?.trim() || `${senderName} sent you a connection request.`),
        data: { connectionId: conn.id, fromUserId: from, fromUserName: senderName } as any,
      } as any).catch((err) => console.error("[connections] notification insert failed:", err));

      if (recipient?.email) {
        await sendConnectionRequestEmail(
          recipient.email,
          recipient.name ?? "there",
          senderName,
          from,
          parsed.data.message ?? null,
        ).catch((err) => console.error("[connections] email send failed:", err));
      }
    } catch (err) {
      console.error("[connections] post-send side effects failed:", err);
    }
  })();

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

  // Notify the original sender that their request was accepted.
  (async () => {
    try {
      const [accepter] = await db.select({ name: users.name }).from(users).where(eq(users.id, me)).limit(1);
      const accepterName = accepter?.name ?? "Someone";
      await db.insert(notifications).values({
        userId: updated.fromUserId,
        type: "connection_accepted",
        title: `${accepterName} accepted your connection request`,
        message: `You and ${accepterName} are now connected on hired.video.`,
        data: { connectionId: updated.id, userId: me, userName: accepterName } as any,
      } as any).catch((err) => console.error("[connections] accept notification failed:", err));
    } catch (err) {
      console.error("[connections] accept side effects failed:", err);
    }
  })();

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
    return c.json(success({ connected: false, status: "none" }), 200);
  }
  return c.json(success({ connected: true, ...makeConnectionDto(found) }), 200);
});

/** POST /api/users/connections/statuses — batch lookup */
userRoutes.post("/connections/statuses", async (c) => {
  const body = await c.req.json<{ userIds: string[] }>();
  const me = c.var.user.sub;
  const userIds = (body.userIds ?? []).slice(0, 100); // cap at 100

  if (userIds.length === 0) {
    return c.json(success({}), 200);
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(userConnections)
    .where(
      or(
        and(eq(userConnections.fromUserId, me), inArray(userConnections.toUserId, userIds)),
        and(eq(userConnections.toUserId, me), inArray(userConnections.fromUserId, userIds)),
      ),
    );

  const statuses: Record<string, { connected: boolean; status: string; id?: string; fromUserId?: string }> = {};
  for (const id of userIds) {
    statuses[id] = { connected: false, status: "none" };
  }
  for (const row of rows) {
    const otherId = row.fromUserId === me ? row.toUserId : row.fromUserId;
    const dto = makeConnectionDto(row);
    statuses[otherId] = { connected: true, ...dto };
  }

  return c.json(success(statuses), 200);
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
  // Owners see all their resumes; others see only public ones (privacyLevel=0).
  // Routes through ResumeRepository and projects to the shape this
  // endpoint wants — public /resumes response shouldn't leak `content`.
  const all = await buildRepos(db).resumes.findAllForOwner(targetUserId);
  const filtered = isOwner ? all : all.filter((r) => r.privacyLevel <= 0);
  const rows = filtered.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    privacyLevel: r.privacyLevel,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

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
  const isSuperAdmin =
    caller?.isSuperAdmin === true ||
    caller?.roles?.includes(USER_ROLES.SUPER_ADMIN);

  // Private profiles are only visible to the owner (SuperAdmins bypass)
  if (visibility === "private" && !isOwner && !isSuperAdmin) {
    return c.json(error("FORBIDDEN", "This profile is private"), 403);
  }

  // Unverified accounts are hidden from everyone except the owner and
  // SuperAdmins. Returning 404 (rather than a verification-specific error)
  // avoids leaking the existence of half-created accounts to anonymous
  // callers — same shape as if the user simply didn't exist.
  if (!me.emailVerified && !isOwner && !isSuperAdmin) {
    return c.json(error("NOT_FOUND", "User not found"), 404);
  }

  // Connections-only profiles require authentication at minimum
  if (visibility === "connections" && !caller) {
    return c.json(error("UNAUTHORIZED", "Authentication required to view this profile"), 401);
  }

  // Enrich with public resume and video counts for "Hire Me" profile page.
  // The resume list goes through ResumeRepository; we filter to public
  // rows + project to ids in memory rather than widen the repo for this
  // one caller's shape.
  const resumeRepo = buildRepos(db).resumes;
  const [publicResumes, publicVideos, privacyRow] = await Promise.all([
    resumeRepo.findAllForOwner(me.id).then((rows) =>
      rows.filter((r) => r.privacyLevel <= 0).map((r) => ({ id: r.id })),
    ),
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
