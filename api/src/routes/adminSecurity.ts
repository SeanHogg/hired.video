/**
 * /api/admin/security/* — SuperAdmin security operator surface. Mounted by
 * the admin composite (routes/admin/index.ts), which applies the SA guard.
 *
 *   GET  /locked-accounts                    — every active lock
 *   POST /locked-accounts/:userId/lock       — manual lock
 *   GET  /locked-accounts/:userId/status     — per-user lock status (badge)
 *   POST /locked-accounts/:userId/unlock     — manual unlock
 *   GET  /bot-stats                          — aggregated counts for the globe
 *   GET  /bot-events                         — raw events (drill-in)
 *   GET  /region-waitlist                    — out-of-region demand list
 *   POST /region-waitlist/:id/review         — mark invited / declined
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { AdminSecurityRepository } from "../repositories/admin/adminSecurityRepository.js";
import { adminLockAccount, adminLockStatus, adminUnlockAccount } from "../services/admin/adminAccountLocks.js";
import { clampLimit } from "../utils/pagination.js";
import { validateJson } from "./helpers/validate.js";

export const adminSecurityRoutes = new Hono<AppEnv>();

adminSecurityRoutes.get("/locked-accounts", async (c) => {
  return c.json(success(await AdminSecurityRepository.create().listActiveLocks()));
});

const ManualLockSchema = z.object({
  reason: z.enum(["admin_manual", "bot_signal", "compromised_credentials", "support_request"]).default("admin_manual"),
  notes: z.string().max(500).optional(),
  durationMinutes: z.number().int().min(1).max(60 * 24 * 30).optional(),
});

adminSecurityRoutes.post("/locked-accounts/:userId/lock", validateJson(ManualLockSchema, () => error("VALIDATION_ERROR", "Invalid body")), async (c) => {
  const body = c.req.valid("json");
  const { reason, notes, durationMinutes } = body;
  const lock = await adminLockAccount({
    userId: c.req.param("userId"),
    reason,
    lockedBy: c.var.userId,
    unlocksAt: durationMinutes ? new Date(Date.now() + durationMinutes * 60 * 1000) : null,
    notes: notes ?? null,
  });
  return c.json(success(lock));
});

// Per-user lock status — powers the standalone LockedAccountBadge.
adminSecurityRoutes.get("/locked-accounts/:userId/status", async (c) => {
  return c.json(success(await adminLockStatus(c.req.param("userId"))));
});

adminSecurityRoutes.post("/locked-accounts/:userId/unlock", async (c) => {
  await adminUnlockAccount(c.req.param("userId"), c.var.userId);
  return c.json(success(null, "Account unlocked"));
});

const RANGE_WINDOWS_MS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

// Per-country + per-reason counts for the window — the globe's single shape.
adminSecurityRoutes.get("/bot-stats", async (c) => {
  const range = c.req.query("range") ?? "24h";
  const since = new Date(Date.now() - (RANGE_WINDOWS_MS[range] ?? RANGE_WINDOWS_MS["24h"]!));
  const stats = await AdminSecurityRepository.create().botStats(since);
  return c.json(success({ range, since: since.toISOString(), ...stats }));
});

adminSecurityRoutes.get("/bot-events", async (c) => {
  const limit = clampLimit(c.req.query("limit"), 100, 500);
  return c.json(success(await AdminSecurityRepository.create().listBotEvents(limit)));
});

adminSecurityRoutes.get("/region-waitlist", async (c) => {
  const status = c.req.query("status") ?? "pending";
  return c.json(success(await AdminSecurityRepository.create().listWaitlist(status)));
});

const ReviewWaitlistSchema = z.object({
  status: z.enum(["invited", "declined"]),
});

adminSecurityRoutes.post("/region-waitlist/:id/review", validateJson(ReviewWaitlistSchema, () => error("VALIDATION_ERROR", "Invalid body")), async (c) => {
  const body = c.req.valid("json");
  await AdminSecurityRepository.create().reviewWaitlist(c.req.param("id"), body.status, c.var.userId);
  return c.json(success(null, `Marked ${body.status}`));
});
