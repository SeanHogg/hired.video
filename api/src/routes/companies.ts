import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import { success } from "../types/index.js";
import { buildCompanyMetadata, buildCompanyProfile } from "../services/company.js";

export const companyRoutes = new Hono<{ Variables: Variables }>();

// Public company listing (frontend expects this endpoint)
companyRoutes.get("/public", (c) =>
  c.json(
    success({
      items: [],
      total: 0,
      page: Number(c.req.query("page") ?? 1),
      limit: Number(c.req.query("limit") ?? 10),
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    }),
    200,
  ),
);

companyRoutes.get("/trending", (c) =>
  c.json(success([]), 200),
);

companyRoutes.get("/me/followed", (c) =>
  c.json(success([]), 200),
);

companyRoutes.get("/slug/:slug", (c) =>
  c.json(success(buildCompanyMetadata(c.req.param("slug"))), 200),
);

companyRoutes.get("/:id/jobs", (c) =>
  c.json(success([]), 200),
);

companyRoutes.post("/:id/follow", (c) =>
  c.json(success({ success: true }), 200),
);

companyRoutes.delete("/:id/follow", (c) =>
  c.json(success({ success: true }), 200),
);

companyRoutes.get("/:id/following-status", (c) =>
  c.json(success({ isFollowing: false }), 200),
);

companyRoutes.get("/:id/stats", (c) =>
  c.json(success({ jobsCount: 0, followersCount: 0, activeJobsCount: 0 }), 200),
);

companyRoutes.get("/:id", (c) =>
  c.json(success(buildCompanyProfile(c.req.param("id"))), 200),
);

companyRoutes.put("/:id", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(success({ ...buildCompanyProfile(c.req.param("id")), ...body }), 200);
});

// Fallback for other company routes (not implemented)
companyRoutes.all("*", (c) =>
  c.json(
    { error: { code: "NOT_IMPLEMENTED", message: "Company routes coming soon" } },
    501,
  ),
);
