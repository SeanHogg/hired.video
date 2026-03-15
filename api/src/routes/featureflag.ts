import { Hono } from "hono";
import type { Variables } from "../types/index.js";

export const featureFlagRoutes = new Hono<{ Variables: Variables }>();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

const flags = [
  {
    key: "new_dashboard",
    name: "New dashboard",
    description: "Enable redesigned dashboard experience",
    enabled: false,
    rolloutPercentage: 0,
    conditions: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

featureFlagRoutes.get("/", (c) =>
  c.json(
    ok({
      flags,
      userFlags: {
        new_dashboard: false,
      },
    }),
    200,
  ),
);

featureFlagRoutes.all("*", (c) =>
  c.json(
    { success: false, error: { code: "NOT_IMPLEMENTED", message: "Feature flag route not implemented" }, timestamp: new Date().toISOString() },
    501,
  ),
);
