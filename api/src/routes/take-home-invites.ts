/**
 * /api/take-home-invites — Candidate magic-link delivery for take-home
 * assignments (#1386). Mirrors the live-screening invite pattern: a
 * recruiter-side issuer + a public landing page that consumes the
 * token + accepts the submission.
 *
 *   POST /                        recruiter creates an invite (stageId + candidate)
 *   GET  /by-token/:token         public: fetch the invite preview
 *   POST /by-token/:token/start   public: stamp `started_at`
 *   POST /by-token/:token/submit  public: attach a submission id + flip to 'submitted'
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

export const takeHomeInvitesRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

const NewInviteSchema = z.object({
  stageId: z.string().uuid(),
  candidateEmail: z.string().email(),
  candidateName: z.string().max(255).optional(),
  expiresInDays: z.number().int().min(1).max(60).default(14),
});

takeHomeInvitesRoutes.post("/", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = NewInviteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid invite payload", parsed.error.flatten()), 400);
  }
  const db = getDb();
  const inviteToken =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `th-${crypto.randomUUID().replace(/-/g, "")}`
      : `th-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 86_400_000);
  const [row] = await db
    .insert(schema.takeHomeInvites)
    .values({
      stageId: parsed.data.stageId,
      candidateEmail: parsed.data.candidateEmail.toLowerCase(),
      candidateName: parsed.data.candidateName ?? null,
      inviteToken,
      status: "pending",
      expiresAt,
    } as never)
    .returning();
  return c.json(success({ invite: row, magicLink: `/take-home/${inviteToken}` }), 201);
});

takeHomeInvitesRoutes.get("/by-token/:token", async (c) => {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.takeHomeInvites)
    .where(eq(schema.takeHomeInvites.inviteToken, c.req.param("token")))
    .limit(1);
  if (!row) return c.json(error("NOT_FOUND", "Invite not found"), 404);
  if (row.expiresAt.getTime() < Date.now()) {
    return c.json(error("EXPIRED", "This invite link has expired"), 410);
  }
  return c.json(success({ invite: row }), 200);
});

takeHomeInvitesRoutes.post("/by-token/:token/start", async (c) => {
  const db = getDb();
  const [row] = await db
    .update(schema.takeHomeInvites)
    .set({ status: "started", startedAt: new Date(), updatedAt: new Date() } as never)
    .where(eq(schema.takeHomeInvites.inviteToken, c.req.param("token")))
    .returning();
  if (!row) return c.json(error("NOT_FOUND", "Invite not found"), 404);
  return c.json(success({ invite: row }), 200);
});

const SubmitSchema = z.object({
  submissionId: z.string().uuid().optional(),
  /** Free-form body for assignment text submissions. The recruiter
   *  side optionally promotes this into a `take_home_submissions` row
   *  via the existing service layer; here we just stamp the invite. */
  body: z.string().max(50_000).optional(),
});

takeHomeInvitesRoutes.post("/by-token/:token/submit", async (c) => {
  const parsed = SubmitSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid submission"), 400);
  }
  const db = getDb();
  const [row] = await db
    .update(schema.takeHomeInvites)
    .set({
      status: "submitted",
      submittedAt: new Date(),
      submissionId: parsed.data.submissionId ?? null,
      updatedAt: new Date(),
    } as never)
    .where(eq(schema.takeHomeInvites.inviteToken, c.req.param("token")))
    .returning();
  if (!row) return c.json(error("NOT_FOUND", "Invite not found"), 404);
  return c.json(success({ invite: row }), 200);
});

takeHomeInvitesRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Take-home invite route not found" } }, 404),
);
