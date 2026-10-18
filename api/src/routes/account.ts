import { Hono } from "hono";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { servicesProcessor } from "../domains/services-processing/index.js";
import {
  AcceptInvitationRequestSchema,
  BulkInviteRequestSchema,
  InviteUserRequestSchema,
} from "../../../shared/account.js";
import {
  acceptInvitation,
  bulkInviteUsers,
  cancelInvitation,
  deleteAccount,
  getAccountAnalytics,
  getAccountSettings,
  getAvailableAccounts,
  getInvitationAnalytics,
  getInvitationDetailsByToken,
  listPendingInvitations,
  inviteAccountUser,
  listAccountUsers,
  removeAccountUser,
  resendInvitation,
  switchAccount,
  updateAccountRoles,
  updateAccountSettings,
} from "../services/user/account.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const accountRoutes = new Hono<AppEnv>();

function getCurrentUserRole(c: any) {
  const roles = (c.var.user?.roles as string[] | undefined) ?? [];
  return roles[0] ?? "";
}

// Account / Organization API
accountRoutes.get("/users", async (c) => {
  const userId = requireUser(c);
  const userRole = getCurrentUserRole(c);
  const users = await listAccountUsers(userId, userRole);
  return c.json(success({ result: users }), 200);
});

accountRoutes.post("/invite", validateJson(InviteUserRequestSchema, () => error("VALIDATION_ERROR", "Invalid invitation request")), async (c) => {
  const userId = requireUser(c);
  const limitError = await servicesProcessor.enforce(c, "team_invite");
  if (limitError) return limitError;
  const body = c.req.valid("json");
  const result = await inviteAccountUser(body, userId);
  // Mirror to the central usage ledger so the Usage Statement panel shows
  // team-invite consumption alongside every other metered dimension.
  servicesProcessor.meterEvent(c, "team_invite", { route: "/invite" });
  return c.json(result, 200);
});

accountRoutes.put("/roles", async (c) => {
  const userId = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  await updateAccountRoles(userId, body.userId, body.role);
  return c.json(success({ success: true }), 200);
});

accountRoutes.delete("/users/:id", async (c) => {
  const userId = requireUser(c);
  await removeAccountUser(userId, c.req.param("id"));
  return c.json(success({ success: true }), 200);
});

accountRoutes.get("/available", async (c) => {
  const userId = requireUser(c);
  const userRole = getCurrentUserRole(c);
  return c.json(success({ result: await getAvailableAccounts(userId, userRole) }), 200);
});

accountRoutes.post("/switch", async (c) => {
  const userId = requireUser(c);
  const { accountId } = await c.req.json();
  await switchAccount(userId, accountId);
  return c.json(success({ success: true, message: "Switched account" }), 200);
});

// Public (token-bearer) — the accept page loads this before the invitee has
// signed in. Keyed by the secret token, NOT an enumerable id (gap #1674).
accountRoutes.get("/invitation/by-token/:token", async (c) =>
  c.json(await getInvitationDetailsByToken(c.req.param("token")), 200),
);

// Authenticated — the caller's email must match the invite (gap #1674). The
// token travels in the body so it isn't logged in URLs/referrers.
accountRoutes.post("/accept-invitation", validateJson(AcceptInvitationRequestSchema, () => error("VALIDATION_ERROR", "Missing invitation token")), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return c.json(await acceptInvitation(body.token, userId), 200);
});

accountRoutes.get("/invitations/pending", async (c) => {
  const userId = requireUser(c);
  return c.json({ success: true, data: await listPendingInvitations(userId) }, 200);
});

accountRoutes.get("/settings", async (c) => {
  const userId = requireUser(c);
  return c.json({ success: true, data: await getAccountSettings(userId) }, 200);
});

accountRoutes.post("/settings", async (c) => {
  const userId = requireUser(c);
  return c.json({ success: true, data: await updateAccountSettings(userId, await c.req.json()) }, 200);
});

accountRoutes.get("/analytics", async (c) => {
  const userId = requireUser(c);
  const userRole = getCurrentUserRole(c);
  return c.json({ success: true, data: await getAccountAnalytics(userId, userRole) }, 200);
});

accountRoutes.post("/bulk-invite", validateJson(BulkInviteRequestSchema, () => error("VALIDATION_ERROR", "Invalid bulk-invite request")), async (c) => {
  const userId = requireUser(c);
  const limitError = await servicesProcessor.enforce(c, "team_invite");
  if (limitError) return limitError;
  const body = c.req.valid("json");
  const result = await bulkInviteUsers(userId, body);
  servicesProcessor.meterEvent(c, "team_invite", { route: "/bulk-invite" }, body.invites.length);
  return c.json(result, 200);
});

accountRoutes.post("/invitation/:id/resend", async (c) => {
  const userId = requireUser(c);
  await resendInvitation(userId, c.req.param("id"));
  return c.json(success({ success: true }), 200);
});

accountRoutes.post("/invitation/:id/cancel", async (c) => {
  const userId = requireUser(c);
  await cancelInvitation(userId, c.req.param("id"));
  return c.json(success({ success: true }), 200);
});

accountRoutes.get("/invitation-analytics", async (c) => {
  const userId = requireUser(c);
  return c.json({ success: true, data: await getInvitationAnalytics(userId) }, 200);
});

accountRoutes.post("/deleteaccount", async (c) => {
  const userId = requireUser(c);
  // Optional `transferToEmail` lets the user hand off personal videos to
  // a kept-alive identity (eg coach, partner, successor) before the
  // soft-delete fires. Company-owned content is unaffected.
  const body = await c.req.json().catch(() => ({} as any));
  const transferToEmail =
    typeof body?.transferToEmail === "string" && body.transferToEmail.trim()
      ? body.transferToEmail.trim()
      : null;
  const result = await deleteAccount(userId, { transferToEmail });
  return c.json(success({ success: true, ...result }), 200);
});

// Legacy password reset flow endpoints used by frontend pages
accountRoutes.post("/reset-password", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = body && typeof body.email === "string" ? body.email : "";
  return c.json(
    {
      success: true,
      data: {
        message: "If an account exists for this email, password reset instructions were sent.",
        email,
      },
      timestamp: new Date().toISOString(),
    },
    200,
  );
});

accountRoutes.post("/confirm-password-reset", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const hasRequiredFields =
    body &&
    typeof body.userId === "string" &&
    typeof body.token === "string" &&
    typeof body.newPassword === "string";

  if (!hasRequiredFields) {
    return c.json(
      error("VALIDATION_ERROR", "userId, token, and newPassword are required."),
      400,
    );
  }

  return c.json(
    {
      success: true,
      data: { message: "Password reset successful." },
      timestamp: new Date().toISOString(),
    },
    200,
  );
});
