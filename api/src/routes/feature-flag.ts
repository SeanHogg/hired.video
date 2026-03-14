import { Hono } from "hono";
import type { Variables } from "../types/index.js";

export const featureFlagRoutes = new Hono<{ Variables: Variables }>();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

featureFlagRoutes.get("/", (c) => {
  const now = new Date().toISOString();
  const flags = [
    {
      key: "new-dashboard",
      name: "New Dashboard",
      description: "Enables the new dashboard experience",
      enabled: false,
      rolloutPercentage: 0,
      conditions: {},
      createdAt: now,
      updatedAt: now,
    },
  ];

  const userFlags: Record<string, boolean> = Object.fromEntries(
    flags.map((flag) => [flag.key, flag.enabled]),
  );

  return c.json(ok({ flags, userFlags }), 200);
});

featureFlagRoutes.all("*", (c) =>
  c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Feature flag route not implemented" },
      timestamp: new Date().toISOString(),
    },
    501,
  ),
);
