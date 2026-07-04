/**
 * Tenant learning portability routes (#2281) — export/import a tenant's learning
 * content + records. Mounted at /api/learning/portability (authenticated,
 * owner-scoped: the owner is always the signed-in user).
 *
 * Export endpoints are deliberately NOT cached — a migration snapshot must
 * reflect the latest data at the moment it's taken (see portability-service).
 */
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import {
  exportManifest,
  exportResultsCsv,
  exportStatements,
  importStatements,
} from "../services/learning/portability-service.js";
import type { ResolvedLrsCredential } from "../services/learning/lrs-service.js";

export const learningPortabilityRoutes = new Hono<{ Variables: Variables } & AppEnv>();

const { lrsCredentials } = schema;

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

// ── Export (company leaving) ────────────────────────────────────────────────
learningPortabilityRoutes.get("/export/manifest", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const manifest = await exportManifest(userId, new Date().toISOString());
  c.header("Content-Disposition", 'attachment; filename="learning-manifest.json"');
  return c.json(manifest, 200);
});

learningPortabilityRoutes.get("/export/results.csv", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const csv = await exportResultsCsv(userId);
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", 'attachment; filename="learning-results.csv"');
  return c.body(csv, 200);
});

learningPortabilityRoutes.get("/export/statements", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const out = await exportStatements(userId);
  c.header("Content-Disposition", 'attachment; filename="learning-statements.json"');
  // Raw xAPI-shaped payload (statements array + export metadata), not the
  // platform envelope — so it can be re-imported anywhere that speaks xAPI.
  return c.json(out, 200);
});

// ── Import (company transitioning in) ───────────────────────────────────────
const ImportSchema = z.object({
  credentialId: z.string().uuid(),
  // Accept either a bare statements array or a full export envelope.
  statements: z.array(z.record(z.string(), z.unknown())).max(50_000),
});

learningPortabilityRoutes.post("/import/statements", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => ({}));
  // Unwrap an export envelope ({ statements: [...] }) transparently.
  const normalized = Array.isArray((body as any)?.statements?.statements)
    ? { ...body, statements: (body as any).statements.statements }
    : body;
  const parsed = ImportSchema.safeParse(normalized);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);

  const db = getDb();
  // The target credential must belong to the signed-in user.
  const [cred] = await db.select().from(lrsCredentials)
    .where(and(eq(lrsCredentials.id, parsed.data.credentialId), eq(lrsCredentials.ownerUserId, userId)))
    .limit(1);
  if (!cred) return c.json(error("NOT_FOUND", "LRS credential not found"), 404);

  const credential: ResolvedLrsCredential = {
    credentialId: cred.id,
    ownerUserId: cred.ownerUserId,
    ownerCompanyId: cred.ownerCompanyId ?? null,
    permission: cred.permission as ResolvedLrsCredential["permission"],
  };
  const result = await importStatements(credential, parsed.data.statements);
  return c.json(success(result), 200);
});
