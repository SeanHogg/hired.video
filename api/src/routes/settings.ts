import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import { success } from "../types/index.js";
import {
	defaultAccountSettings,
	defaultJobPreferences,
	defaultNotificationPreferences,
	defaultPrivacyPreferences,
	defaultSecuritySettings,
} from "../services/settings.js";
export const settingsRoutes = new Hono<{ Variables: Variables }>();

settingsRoutes.get("/", (c) =>
	c.json(
		success({
			notifications: {
				email: true,
				push: true,
				marketing: false,
				weekly: true,
			},
			privacy: {
				profileVisible: true,
				showEmail: false,
				showPhone: false,
				showLocation: false,
				indexable: true,
				allowMessages: true,
				showActivity: true,
			},
			jobPreferences: defaultJobPreferences(),
			account: defaultAccountSettings(),
			security: defaultSecuritySettings(),
		}),
		200,
	),
);

settingsRoutes.get("/notifications", (c) =>
	c.json(success(defaultNotificationPreferences()), 200),
);
settingsRoutes.put("/notifications", async (c) =>
	c.json(success({ ...defaultNotificationPreferences(), ...(await c.req.json().catch(() => ({}))) }), 200),
);

settingsRoutes.get("/privacy", (c) =>
	c.json(success(defaultPrivacyPreferences()), 200),
);
settingsRoutes.put("/privacy", async (c) =>
	c.json(success({ ...defaultPrivacyPreferences(), ...(await c.req.json().catch(() => ({}))) }), 200),
);

settingsRoutes.get("/job-preferences", (c) =>
	c.json(success(defaultJobPreferences()), 200),
);
settingsRoutes.put("/job-preferences", async (c) =>
	c.json(success({ ...defaultJobPreferences(), ...(await c.req.json().catch(() => ({}))) }), 200),
);

settingsRoutes.get("/account", (c) =>
	c.json(success(defaultAccountSettings()), 200),
);
settingsRoutes.put("/account", async (c) =>
	c.json(success({ ...defaultAccountSettings(), ...(await c.req.json().catch(() => ({}))) }), 200),
);

settingsRoutes.get("/security", (c) =>
	c.json(success(defaultSecuritySettings()), 200),
);
settingsRoutes.put("/security", async (c) =>
	c.json(success({ ...defaultSecuritySettings(), ...(await c.req.json().catch(() => ({}))) }), 200),
);

settingsRoutes.post("/security/2fa/enable", (c) =>
	c.json(success({ qrCode: "stub-qr-code", backupCodes: ["CODE1", "CODE2", "CODE3"] }), 200),
);
settingsRoutes.post("/security/2fa/disable", (c) =>
	c.json(success({ success: true }), 200),
);

settingsRoutes.get("/export", (c) =>
	c.json(success({ message: "Export started" }), 200),
);

settingsRoutes.all("*", (c) =>
	c.json({ error: { code: "NOT_IMPLEMENTED", message: "Settings routes coming soon" } }, 501),
);
