/**
 * /api/reports — Content abuse / spam queue (#152).
 *
 *   POST   /                 authed users submit a report
 *   GET    /admin            admin-only — list pending reports
 *   PATCH  /admin/:id/resolve  admin-only — mark actioned / dismissed
 *
 * Auto-hide threshold: when a single entity collects >= 3 pending
 * reports the existing moderation surface gates rendering through the
 * `entity_moderation` table — we don't re-implement that here; the
 * report row's existence is the signal the moderation cron picks up.
 */

import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { isAdminRole } from "../domains/billing/audience.js";

export const contentReportsRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

const REPORTABLE_ENTITIES = ["resume", "job", "company", "comment", "article", "video", "user"] as const;
const REASONS = ["spam", "impersonation", "inappropriate", "illegal", "other"] as const;

const ReportSchema = z.object({
  entityType: z.enum(REPORTABLE_ENTITIES),
  entityId: z.string().uuid(),
  reason: z.enum(REASONS),
  notes: z.string().max(2_000).optional(),
});

contentReportsRoutes.post("/", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = ReportSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid report payload", parsed.error.flatten()), 400);
  }
  const db = getDb();
  // Idempotent on (reporter, entity, reason) — a user re-clicking Report
  // doesn't pile up duplicate rows.
  const [existing] = await db
    .select({ id: schema.contentReportsV2.id })
    .from(schema.contentReportsV2)
    .where(
      and(
        eq(schema.contentReportsV2.reporterUserId, u),
        eq(schema.contentReportsV2.entityType, parsed.data.entityType),
        eq(schema.contentReportsV2.entityId, parsed.data.entityId),
        eq(schema.contentReportsV2.reason, parsed.data.reason),
      ),
    )
    .limit(1);
  if (existing) return c.json(success({ reportId: existing.id, deduped: true }), 200);

  const [row] = await db
    .insert(schema.contentReportsV2)
    .values({
      reporterUserId: u,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      reason: parsed.data.reason,
      notes: parsed.data.notes ?? null,
      status: "pending",
    })
    .returning();
  return c.json(success({ reportId: row.id, deduped: false }), 201);
});

function requireAdmin(c: any): true | Response {
  const user = c.var.user;
  if (!user) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  if (!isAdminRole(user)) return c.json(error("FORBIDDEN", "Admin role required"), 403);
  return true;
}

contentReportsRoutes.get("/admin", async (c) => {
  const guard = requireAdmin(c);
  if (guard !== true) return guard;
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.contentReportsV2)
    .where(eq(schema.contentReportsV2.status, "pending"))
    .orderBy(desc(schema.contentReportsV2.createdAt))
    .limit(200);
  // Aggregate to surface "N reports against same entity" in one row.
  const grouped = new Map<string, { reports: typeof rows; count: number }>();
  for (const r of rows) {
    const key = `${r.entityType}:${r.entityId}`;
    const slot = grouped.get(key);
    if (slot) {
      slot.reports.push(r);
      slot.count += 1;
    } else {
      grouped.set(key, { reports: [r], count: 1 });
    }
  }
  return c.json(
    success({
      items: rows,
      grouped: Array.from(grouped.entries()).map(([k, v]) => {
        const [entityType, entityId] = k.split(":");
        return { entityType, entityId, count: v.count, reports: v.reports };
      }),
    }),
    200,
  );
});

const ResolveSchema = z.object({
  status: z.enum(["actioned", "dismissed", "triaged"]),
  notes: z.string().max(2_000).optional(),
});

contentReportsRoutes.patch("/admin/:id/resolve", async (c) => {
  const guard = requireAdmin(c);
  if (guard !== true) return guard;
  const u = uid(c);
  const parsed = ResolveSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid resolution payload"), 400);
  }
  const db = getDb();
  const [row] = await db
    .update(schema.contentReportsV2)
    .set({
      status: parsed.data.status,
      resolvedByUserId: u,
      resolvedAt: new Date(),
      notes: parsed.data.notes ?? sql`${schema.contentReportsV2.notes}`,
      updatedAt: new Date(),
    } as never)
    .where(eq(schema.contentReportsV2.id, c.req.param("id")))
    .returning();
  if (!row) return c.json(error("NOT_FOUND", "Report not found"), 404);
  return c.json(success({ report: row }), 200);
});

contentReportsRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Content reports route not found" } }, 404),
);
