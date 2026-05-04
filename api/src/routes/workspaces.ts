// workspaces.ts — Studio-side workspace listing + delegation grants.
//
// Endpoints:
//   GET    /api/workspaces              - list all workspaces the user can act in
//                                         (personal + company memberships + delegated)
//   GET    /api/workspaces/grants       - grants where caller is the subject
//                                         (ie "people I've invited to edit my videos")
//   GET    /api/workspaces/granted-to-me - grants where caller is the contributor
//                                         (ie "people who've invited me")
//   POST   /api/workspaces/grants       - invite a contributor (subject = caller)
//   DELETE /api/workspaces/grants/:id   - revoke a grant
//
// All write paths use the same authorization rule as Studio mutations
// (services/studio/workspace.ts) — by definition only the subject (or an
// admin grantedBy) can manage their own delegations.

import { Hono } from "hono";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { listAccessibleWorkspaces } from "../services/studio/workspace.js";

const { companyProfiles, users, workspaceGrants } = schema;

export const workspaceRoutes = new Hono<{ Variables: Variables }>();

function userId(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

// ─── List all workspaces I can act in ───────────────────────────────────────

workspaceRoutes.get("/workspaces", async (c) => {
  const me = userId(c);
  if (!me) return c.json(error("UNAUTHORIZED", "Unauthorized"), 401);

  const db = getDb();
  const { companyIds, delegatedSubjectUserIds } = await listAccessibleWorkspaces(me);

  // Resolve company names + slugs for the cards. Uses Drizzle's `inArray`
  // rather than a raw `= ANY(${array})` so the driver binds the values as
  // a real Postgres array — the raw form fails with "op ANY/ALL (array)
  // requires array on right side" under the worker pg driver.
  const companies = companyIds.length
    ? await db
        .select({
          id: companyProfiles.id,
          name: companyProfiles.name,
          slug: companyProfiles.slug,
          logoUrl: companyProfiles.logoUrl,
        })
        .from(companyProfiles)
        .where(inArray(companyProfiles.id, companyIds))
    : [];

  // Resolve delegated subject names.
  const delegated = delegatedSubjectUserIds.length
    ? await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
        })
        .from(users)
        .where(inArray(users.id, delegatedSubjectUserIds))
    : [];

  return c.json(
    success({
      personal: { kind: "personal" as const, label: "Personal" },
      companies: companies.map((row) => ({
        kind: "company" as const,
        companyId: row.id,
        label: row.name,
        slug: row.slug,
        logoUrl: row.logoUrl,
      })),
      delegated: delegated.map((row) => ({
        kind: "delegated" as const,
        subjectUserId: row.id,
        label: row.name ?? row.email ?? "Unknown",
      })),
    }),
  );
});

// ─── Grants I have given (I am the subject) ────────────────────────────────

workspaceRoutes.get("/workspaces/grants", async (c) => {
  const me = userId(c);
  if (!me) return c.json(error("UNAUTHORIZED", "Unauthorized"), 401);
  const db = getDb();
  const rows = await db
    .select({
      id: workspaceGrants.id,
      contributorUserId: workspaceGrants.contributorUserId,
      contributorName: users.name,
      contributorEmail: users.email,
      role: workspaceGrants.role,
      scope: workspaceGrants.scope,
      isActive: workspaceGrants.isActive,
      grantedAt: workspaceGrants.grantedAt,
      expiresAt: workspaceGrants.expiresAt,
      revokedAt: workspaceGrants.revokedAt,
    })
    .from(workspaceGrants)
    .leftJoin(users, eq(users.id, workspaceGrants.contributorUserId))
    .where(eq(workspaceGrants.subjectUserId, me));
  return c.json(success(rows));
});

// ─── Grants given to me (I am the contributor) ─────────────────────────────

workspaceRoutes.get("/workspaces/granted-to-me", async (c) => {
  const me = userId(c);
  if (!me) return c.json(error("UNAUTHORIZED", "Unauthorized"), 401);
  const db = getDb();
  const rows = await db
    .select({
      id: workspaceGrants.id,
      subjectUserId: workspaceGrants.subjectUserId,
      subjectName: users.name,
      subjectEmail: users.email,
      role: workspaceGrants.role,
      scope: workspaceGrants.scope,
      isActive: workspaceGrants.isActive,
      grantedAt: workspaceGrants.grantedAt,
      expiresAt: workspaceGrants.expiresAt,
    })
    .from(workspaceGrants)
    .leftJoin(users, eq(users.id, workspaceGrants.subjectUserId))
    .where(
      and(
        eq(workspaceGrants.contributorUserId, me),
        eq(workspaceGrants.isActive, true),
        or(isNull(workspaceGrants.expiresAt), sql`${workspaceGrants.expiresAt} > NOW()`),
      ),
    );
  return c.json(success(rows));
});

// ─── Invite a contributor (subject = caller) ───────────────────────────────

const createGrantBody = z.object({
  contributorEmail: z.string().email(),
  role: z.enum(["editor", "reviewer"]).default("editor"),
  scope: z.enum(["studio", "all"]).default("studio"),
  expiresAt: z.string().datetime().optional(),
});

workspaceRoutes.post("/workspaces/grants", async (c) => {
  const me = userId(c);
  if (!me) return c.json(error("UNAUTHORIZED", "Unauthorized"), 401);
  const parsed = createGrantBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
  }
  const { contributorEmail, role, scope, expiresAt } = parsed.data;
  const db = getDb();
  const [contributor] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, contributorEmail))
    .limit(1);
  if (!contributor) {
    return c.json(error("NOT_FOUND", "Contributor must have a hired.video account first."), 404);
  }
  if (contributor.id === me) {
    return c.json(error("BAD_REQUEST", "You cannot invite yourself."), 400);
  }
  // Idempotent: if an active grant already exists for this (subject,
  // contributor, scope), return it instead of failing on the unique index.
  const [existing] = await db
    .select()
    .from(workspaceGrants)
    .where(
      and(
        eq(workspaceGrants.subjectUserId, me),
        eq(workspaceGrants.contributorUserId, contributor.id),
        eq(workspaceGrants.scope, scope),
        eq(workspaceGrants.isActive, true),
      ),
    )
    .limit(1);
  if (existing) return c.json(success(existing));
  const [created] = await db
    .insert(workspaceGrants)
    .values({
      subjectUserId: me,
      contributorUserId: contributor.id,
      role,
      scope,
      grantedByUserId: me,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    } as any)
    .returning();
  return c.json(success(created));
});

// ─── Revoke a grant (only the subject may) ─────────────────────────────────

workspaceRoutes.delete("/workspaces/grants/:id", async (c) => {
  const me = userId(c);
  if (!me) return c.json(error("UNAUTHORIZED", "Unauthorized"), 401);
  const id = c.req.param("id");
  const db = getDb();
  const [updated] = await db
    .update(workspaceGrants)
    .set({ isActive: false, revokedAt: new Date(), updatedAt: new Date() } as any)
    .where(and(eq(workspaceGrants.id, id), eq(workspaceGrants.subjectUserId, me)))
    .returning({ id: workspaceGrants.id });
  if (!updated) return c.json(error("NOT_FOUND", "Grant not found"), 404);
  return c.json(success({ id: updated.id, revoked: true }));
});

export default workspaceRoutes;
