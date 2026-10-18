/**
 * SuperAdmin signup-spam investigation. Mounted at /api/admin/sa/security on
 * the SA console (SA guard applied once by the admin composite).
 *
 *   GET /signups/recent        — signup IPs with >= minCount accounts in a window
 *   GET /signups/by-ip?ip=...  — every account + login event from one IP
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { AdminSecurityRepository } from "../../repositories/admin/adminSecurityRepository.js";
import { success, error } from "../../types/index.js";

const RecentSignupsSchema = z.object({
  // Window in hours. Default 24h matches the typical spam-burst horizon.
  hours: z.coerce.number().int().min(1).max(24 * 30).default(24),
  // Min accounts per IP to surface — an IP with one signup is noise.
  minCount: z.coerce.number().int().min(1).max(1000).default(2),
  // Cap groups so the UI stays responsive after a 30-day sweep.
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const ByIpSchema = z.object({
  ip: z.string().min(1).max(64),
  hours: z.coerce.number().int().min(1).max(24 * 90).default(24 * 7),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);

export const securityRoutes = new Hono<AppEnv>();

securityRoutes.get("/signups/recent", async (c) => {
  const parsed = RecentSignupsSchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(error("BAD_REQUEST", parsed.error.issues[0].message), 400);
  }
  const { hours, minCount, limit } = parsed.data;
  const groups = await AdminSecurityRepository.create().signupGroupsByIp(hoursAgo(hours), minCount, limit);
  return c.json(success({ windowHours: hours, minCount, groups }), 200);
});

securityRoutes.get("/signups/by-ip", async (c) => {
  const parsed = ByIpSchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(error("BAD_REQUEST", parsed.error.issues[0].message), 400);
  }
  const { ip, hours, limit } = parsed.data;
  const { accounts, events } = await AdminSecurityRepository.create().activityFromIp(ip, hoursAgo(hours), limit);
  return c.json(success({ ip, windowHours: hours, accounts, events }), 200);
});
