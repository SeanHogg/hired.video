import { Hono } from "hono";
import type { Variables, AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { listAllModuleStatuses } from "../services/auth/moduleStatus.js";

// Public (authed) endpoint consumed by the frontend ModuleGate hook. Returns
// every module's slug + active flag so UI can hide or disable features that
// superadmins have toggled off.
export const moduleRoutes = new Hono<AppEnv>();

moduleRoutes.get("/status", async (c) => {
  const statuses = await listAllModuleStatuses();
  return c.json(success(statuses), 200);
});
