import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import { success } from "../types/index.js";
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
} from "../services/account.js";

export const accountRoutes = new Hono<{ Variables: Variables }>();

// Account / Organization API (stubbed service layer)
accountRoutes.get("/users", async (c) =>
  c.json(success({ result: await listAccountUsers() }), 200),
);

accountRoutes.post("/invite", async (c) =>
  c.json(await inviteAccountUser(await c.req.json()), 200),
);

accountRoutes.put("/roles", async (c) => {
  await updateAccountRoles();
  return c.json(success({ success: true }), 200);
});

accountRoutes.delete("/users/:id", async (c) => {
  await removeAccountUser(c.req.param("id"));
  return c.json(success({ success: true }), 200);
});

accountRoutes.get("/available", async (c) =>
  c.json(success({ result: await getAvailableAccounts() }), 200),
);

accountRoutes.post("/switch", async (c) => {
  const { accountId } = await c.req.json();
  await switchAccount(accountId);
  return c.json(success({ success: true, message: "Switched account" }), 200);
});

accountRoutes.get("/invitation/:id", async (c) =>
  c.json(await getInvitationDetails(c.req.param("id")), 200),
);

accountRoutes.post("/accept-invitation/:id", async (c) =>
  c.json(await acceptInvitation(c.req.param("id")), 200),
);

accountRoutes.get("/invitations/pending", async (c) =>
  c.json({ success: true, data: await listPendingInvitations() }, 200),
);

accountRoutes.get("/settings", async (c) =>
  c.json({ success: true, data: await getAccountSettings() }, 200),
);

accountRoutes.post("/settings", async (c) =>
  c.json({ success: true, data: await updateAccountSettings(await c.req.json()) }, 200),
);

accountRoutes.get("/analytics", async (c) =>
  c.json({ success: true, data: await getAccountAnalytics() }, 200),
);

accountRoutes.post("/bulk-invite", async (c) =>
  c.json(await bulkInviteUsers(await c.req.json()), 200),
);

accountRoutes.post("/invitation/:id/resend", async (c) => {
  await resendInvitation(c.req.param("id"));
  return c.json(success({ success: true }), 200);
});

accountRoutes.post("/invitation/:id/cancel", async (c) => {
  await cancelInvitation(c.req.param("id"));
  return c.json(success({ success: true }), 200);
});

accountRoutes.get("/invitation-analytics", async (c) =>
  c.json({ success: true, data: await getInvitationAnalytics() }, 200),
);

accountRoutes.post("/deleteaccount", async (c) => {
  await deleteAccount();
  return c.json(success({ success: true }), 200);
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
