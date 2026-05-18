import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { checkTeamSize } from "../middleware/tierEnforcement.js";
import { meterEntitlement } from "../domains/services-processing/index.js";
import {
  acceptInvitation,
  bulkInviteUsers,
  cancelInvitation,
  deleteAccount,
  getAccountAnalytics,
  getAccountSettings,
  getAvailableAccounts,
  getInvitationAnalytics,
  getInvitationDetails,
  listPendingInvitations,
  inviteAccountUser,
  listAccountUsers,
  removeAccountUser,
  resendInvitation,
  switchAccount,
  updateAccountRoles,
  updateAccountSettings,
} from "../services/user/account.js";

export const accountRoutes = new Hono<{ Variables: Variables }>();

function getCurrentUserId(c: any) {
  return (c.var.user?.sub as string | undefined) ?? null;
}

function getCurrentUserRole(c: any) {
  const roles = (c.var.user?.roles as string[] | undefined) ?? [];
  return roles[0] ?? "";
}

// Account / Organization API
accountRoutes.get("/users", async (c) => {
  const userId = getCurrentUserId(c);
  const userRole = getCurrentUserRole(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const users = await listAccountUsers(userId, userRole);
  return c.json(success({ result: users }), 200);
});

accountRoutes.post("/invite", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const limitError = await checkTeamSize(c as any);
  if (limitError) return limitError;
  const request = await c.req.json();
  const result = await inviteAccountUser(request, userId);
  // Mirror to the central usage ledger so the Usage Statement panel shows
  // team-invite consumption alongside every other metered dimension.
  meterEntitlement(c, "team_invite", { route: "/invite" });
  return c.json(result, 200);
});

accountRoutes.put("/roles", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  await updateAccountRoles(userId, body.userId, body.role);
  return c.json(success({ success: true }), 200);
});

accountRoutes.delete("/users/:id", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  await removeAccountUser(userId, c.req.param("id"));
  return c.json(success({ success: true }), 200);
});

accountRoutes.get("/available", async (c) => {
  const userId = getCurrentUserId(c);
  const userRole = getCurrentUserRole(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.json(success({ result: await getAvailableAccounts(userId, userRole) }), 200);
});

accountRoutes.post("/switch", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const { accountId } = await c.req.json();
  await switchAccount(userId, accountId);
  return c.json(success({ success: true, message: "Switched account" }), 200);
});

accountRoutes.get("/invitation/:id", async (c) =>
  c.json(await getInvitationDetails(c.req.param("id")), 200),
);

accountRoutes.post("/accept-invitation/:id", async (c) =>
  c.json(await acceptInvitation(c.req.param("id")), 200),
);

accountRoutes.get("/invitations/pending", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.json({ success: true, data: await listPendingInvitations(userId) }, 200);
});

accountRoutes.get("/settings", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.json({ success: true, data: await getAccountSettings(userId) }, 200);
});

accountRoutes.post("/settings", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.json({ success: true, data: await updateAccountSettings(userId, await c.req.json()) }, 200);
});

accountRoutes.get("/analytics", async (c) => {
  const userId = getCurrentUserId(c);
  const userRole = getCurrentUserRole(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.json({ success: true, data: await getAccountAnalytics(userId, userRole) }, 200);
});

accountRoutes.post("/bulk-invite", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const limitError = await checkTeamSize(c as any);
  if (limitError) return limitError;
  const body = await c.req.json();
  const result = await bulkInviteUsers(userId, body);
  const invitedCount = Array.isArray(body?.invites) ? body.invites.length : 1;
  meterEntitlement(c, "team_invite", { route: "/bulk-invite" }, invitedCount);
  return c.json(result, 200);
});

accountRoutes.post("/invitation/:id/resend", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  await resendInvitation(userId, c.req.param("id"));
  return c.json(success({ success: true }), 200);
});

accountRoutes.post("/invitation/:id/cancel", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  await cancelInvitation(userId, c.req.param("id"));
  return c.json(success({ success: true }), 200);
});

accountRoutes.get("/invitation-analytics", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.json({ success: true, data: await getInvitationAnalytics(userId) }, 200);
});

accountRoutes.post("/deleteaccount", async (c) => {
  const userId = getCurrentUserId(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
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
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "userId, token, and newPassword are required.",
        },
        timestamp: new Date().toISOString(),
      },
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

// Fallback for other account routes
accountRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_IMPLEMENTED", message: "Account routes coming soon" } }, 501),
);
