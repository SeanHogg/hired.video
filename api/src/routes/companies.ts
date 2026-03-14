import { Hono } from "hono";
import type { Variables } from "../types/index.js";

export const companyRoutes = new Hono<{ Variables: Variables }>();

// Public company listing (frontend expects this endpoint)
companyRoutes.get("/public", (c) =>
  c.json(
    {
      success: true,
      data: {
        items: [],
        total: 0,
        page: Number(c.req.query("page") ?? 1),
        limit: Number(c.req.query("limit") ?? 10),
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    },
    200,
  ),
);

// Fallback for other company routes (not implemented)
companyRoutes.all("*", (c) =>
  c.json(
    { error: { code: "NOT_IMPLEMENTED", message: "Company routes coming soon" } },
    501,
  ),
);
