import { Hono } from "hono";
import type { Variables } from "../types/index.js";

export const searchRoutes = new Hono<{ Variables: Variables }>();

// Placeholder / stub search endpoint.
// The frontend expects a JSON payload with pagination metadata.
searchRoutes.get("/public", (c) => {
  const page = Number(c.req.query("page") ?? 1);
  const limit = Number(c.req.query("limit") ?? 20);

  return c.json(
    {
      items: [],
      total: 0,
      page,
      limit,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    },
    200,
  );
});

// Fallback for other search routes (not implemented)
searchRoutes.all("*", (c) =>
  c.json(
    { error: { code: "NOT_IMPLEMENTED", message: "Search routes coming soon" } },
    501,
  ),
);
