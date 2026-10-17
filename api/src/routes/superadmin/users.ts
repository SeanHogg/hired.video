import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema, UUID_LIKE_REGEX } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { ok } from "../../utils/response.js";
import { AdminSecurityRepository } from "../../repositories/admin/adminSecurityRepository.js";
import {
  handleSetPlanOverride,
  handleClearPlanOverride,
} from "../../services/superadmin/plan-override-handlers.js";
import { buildPlanOverrideDeps } from "../../services/superadmin/plan-override-deps.js";
import {
  searchUsers,
  getUserDetail,
  assignUserRole,
  setUserStatus,
  setUserSystemFlag,
  resetUserMonthlyTokens,
  grantUserTokens,
  sendUserPasswordReset,
  healUserResumes,
  bulkBanUsers,
  bulkSuspendUsers,
  bulkDeleteUsers,
  getAdminUsersStats,
} from "../../services/adminUsers.js";
import { getReferredUsersGrouped } from "../../services/adminReferrals.js";
import { assignModuleToUser, removeModuleFromUser } from "../../services/auth/adminModules.js";
import { pausePostingAgent } from "../../services/distribution/pause-posting-agent.js";

const HistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

// ── Schemas ───────────────────────────────────────────────────────────────────

const UserSearchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().optional(),
  role: z.string().optional(),
  status: z.enum(["active", "suspended", "banned"]).optional(),
  // Restrict the list to editorial / house authors (users.is_system = true).
  editorial: z.coerce.boolean().optional(),
  // Restrict the list to users referred via an affiliate link.
  referred: z.coerce.boolean().optional(),
});

// Bulk-action cap mirrors the page size — the /admin/users UI can only
// select what's on the page, and this guards the endpoint if the body is
// crafted manually.
const BulkUserActionSchema = z.object({
  userIds: z.array(UuidLikeSchema).min(1).max(100),
});

const AssignRoleSchema = z.object({
  role: z.string().min(1, "role is required"),
});

const SetStatusSchema = z.object({
  status: z.enum(["active", "suspended"], { error: "status must be 'active' or 'suspended'" }),
});

const SetSystemSchema = z.object({
  isSystem: z.boolean({ error: "isSystem must be a boolean" }),
});

const AssignModuleSchema = z.object({
  moduleId: z.string().regex(UUID_LIKE_REGEX, "moduleId must be a valid UUID"),
});

const GrantTokensSchema = z.object({
  tokens: z.coerce.number().int().min(1, "tokens must be ≥ 1").max(1_000_000_000),
  reason: z.string().max(500).optional(),
});

// ── Router ────────────────────────────────────────────────────────────────────

export const userMgmtRoutes = new Hono<AppEnv>();

// ── Bulk actions ──────────────────────────────────────────────────────────────
// Mounted above the /:id routes so `/bulk/…` can't be captured by `/:id`.

userMgmtRoutes.post("/bulk/ban", async (c) => {
  const body = BulkUserActionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: { code: "BAD_REQUEST", message: body.error.issues[0].message } }, 400);
  const result = await bulkBanUsers(c.var.user.sub, body.data.userIds);
  return c.json(ok(result), 200);
});

userMgmtRoutes.post("/bulk/suspend", async (c) => {
  const body = BulkUserActionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: { code: "BAD_REQUEST", message: body.error.issues[0].message } }, 400);
  const result = await bulkSuspendUsers(c.var.user.sub, body.data.userIds);
  return c.json(ok(result), 200);
});

userMgmtRoutes.post("/bulk/delete", async (c) => {
  const body = BulkUserActionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: { code: "BAD_REQUEST", message: body.error.issues[0].message } }, 400);
  const result = await bulkDeleteUsers(c.var.user.sub, body.data.userIds);
  return c.json(ok(result), 200);
});

userMgmtRoutes.get("/", async (c) => {
  const query = UserSearchSchema.safeParse(c.req.query());
  if (!query.success) return c.json({ error: { code: "BAD_REQUEST", message: query.error.issues[0].message } }, 400);
  return c.json(ok(await searchUsers(query.data)), 200);
});

// /stats — aggregate counts for the /admin/users summary cards. Mounted
// before /:id so the literal segment wins the route match.
userMgmtRoutes.get("/stats", async (c) => {
  return c.json(ok(await getAdminUsersStats()), 200);
});

// /referrals — referred users grouped under the affiliate who referred them
// ("group by referrer" view). Literal segment, mounted before /:id.
userMgmtRoutes.get("/referrals", async (c) => {
  return c.json(ok(await getReferredUsersGrouped()), 200);
});

userMgmtRoutes.get("/:id", async (c) => {
  const detail = await getUserDetail(c.req.param("id"));
  if (!detail) return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
  return c.json(ok(detail), 200);
});

userMgmtRoutes.put("/:id/role", async (c) => {
  const body = AssignRoleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: { code: "BAD_REQUEST", message: body.error.issues[0].message } }, 400);

  const result = await assignUserRole(c.var.user.sub, c.req.param("id"), body.data.role);
  if (!result.ok) return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
  return c.json(ok({ userId: c.req.param("id"), role: body.data.role }), 200);
});

userMgmtRoutes.put("/:id/status", async (c) => {
  const body = SetStatusSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: { code: "BAD_REQUEST", message: body.error.issues[0].message } }, 400);

  await setUserStatus(c.var.user.sub, c.req.param("id"), body.data.status);
  return c.json(ok({ userId: c.req.param("id"), status: body.data.status }), 200);
});

// Toggle the editorial / house-author flag (users.is_system). SuperAdmin-only
// via the SA guard the admin composite applies to the /api/admin/sa mount.
userMgmtRoutes.put("/:id/system", async (c) => {
  const body = SetSystemSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: { code: "BAD_REQUEST", message: body.error.issues[0].message } }, 400);

  const result = await setUserSystemFlag(c.var.user.sub, c.req.param("id"), body.data.isSystem);
  if (!result.ok) return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
  return c.json(ok({ userId: c.req.param("id"), isSystem: body.data.isSystem }), 200);
});

userMgmtRoutes.post("/:id/modules", async (c) => {
  const body = AssignModuleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: { code: "BAD_REQUEST", message: body.error.issues[0].message } }, 400);

  const result = await assignModuleToUser(c.var.user.sub, c.req.param("id"), body.data.moduleId);
  if (!result.ok) return c.json({ error: { code: "NOT_FOUND", message: "Module not found" } }, 404);
  return c.json(ok({ userId: c.req.param("id"), moduleId: body.data.moduleId, moduleName: result.moduleName }), 201);
});

userMgmtRoutes.delete("/:id/modules/:moduleId", async (c) => {
  await removeModuleFromUser(c.var.user.sub, c.req.param("id"), c.req.param("moduleId"));
  return c.json(ok({ userId: c.req.param("id"), moduleId: c.req.param("moduleId") }), 200);
});

userMgmtRoutes.post("/:id/tokens/reset", async (c) => {
  const result = await resetUserMonthlyTokens(c.var.user.sub, c.req.param("id"));
  if (!result.ok) return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
  return c.json(ok({ userId: c.req.param("id"), tokensReset: result.tokensReset }), 200);
});

userMgmtRoutes.post("/:id/password-reset", async (c) => {
  const result = await sendUserPasswordReset(c.var.user.sub, c.req.param("id"));
  if (!result.ok) return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
  return c.json(ok({ userId: c.req.param("id"), email: result.email }), 200);
});

userMgmtRoutes.post("/:id/tokens/grant", async (c) => {
  const body = GrantTokensSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: { code: "BAD_REQUEST", message: body.error.issues[0].message } }, 400);

  const result = await grantUserTokens(c.var.user.sub, c.req.param("id"), body.data.tokens, body.data.reason);
  if (!result.ok) return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
  return c.json(ok({ userId: c.req.param("id"), tokensGranted: body.data.tokens }), 200);
});

// GET /:id/history — auth event timeline for a single user, plus the
// signup attribution pinned to the user row. Powers the "View History"
// sheet on /admin/users. Returns most-recent first.
userMgmtRoutes.get("/:id/history", async (c) => {
  const parsed = HistoryQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: { code: "BAD_REQUEST", message: parsed.error.issues[0].message } }, 400);
  }
  const history = await AdminSecurityRepository.create().userAuthHistory(c.req.param("id"), parsed.data.limit);
  if (!history) {
    return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
  }
  return c.json(ok(history), 200);
});

// Run the heal-and-validate pipe over every resume owned by this user.
// Triggered from the /admin/users ellipsis ("Heal resume data"). One-shot
// cleanup for legacy blobs with null-as-array etc.; prevention of new
// bad data is the write-boundary guard (healAndValidateContent called by
// the resume write handlers), not this endpoint.
userMgmtRoutes.post("/:id/resumes/heal", async (c) => {
  const result = await healUserResumes(c.var.user.sub, c.req.param("id"));
  if (!result.ok) return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
  return c.json(ok({ userId: c.req.param("id"), ...result.report }), 200);
});

// ── Plan override (SuperAdmin comp / trial / custom token limit) ─────────────
// Thin adapters — all logic + validation lives in the handler module so it
// can be unit-tested with fakes (see __tests__/plan-override-handlers.test.ts).

userMgmtRoutes.put("/:id/plan-override", async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = await handleSetPlanOverride(
    buildPlanOverrideDeps(),
    c.var.user.sub,
    c.req.param("id"),
    body,
  );
  return c.json(result.body as any, result.status as any);
});

userMgmtRoutes.delete("/:id/plan-override", async (c) => {
  const result = await handleClearPlanOverride(
    buildPlanOverrideDeps(),
    c.var.user.sub,
    c.req.param("id"),
  );
  return c.json(result.body as any, result.status as any);
});

// ── AI Posting Agent kill switch (SuperAdmin) ────────────────────────────────
userMgmtRoutes.post("/:id/posting-agent/pause", async (c) => {
  const userId = c.req.param("id");
  const settings = await pausePostingAgent(userId, "admin");
  return c.json(ok({ settings }), 200);
});
