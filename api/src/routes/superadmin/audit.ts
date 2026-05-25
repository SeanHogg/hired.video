import { Hono } from "hono";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { ok } from "../../utils/response.js";
import { listAuditLog } from "../../utils/audit.js";

const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const auditRoutes = new Hono<AppEnv>();

auditRoutes.get("/", async (c) => {
  const query = PaginationSchema.safeParse(c.req.query());
  if (!query.success) return c.json({ error: { code: "BAD_REQUEST", message: query.error.issues[0].message } }, 400);
  return c.json(ok(await listAuditLog(query.data.page, query.data.limit)), 200);
});
