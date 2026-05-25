/**
 * Public certificate verification — `/api/verify/:certNumber`.
 *
 * No auth required: anyone holding the cert number (a recruiter, the
 * recipient sharing on LinkedIn, a hiring manager) can call this to
 * confirm the cert is genuinely issued + signed by hired.video and
 * still active.
 *
 * Returns the canonical payload + status, not the raw signed_payload
 * blob — the signature stays server-side so it can't be cargo-culted
 * into a forged cert.
 */
import { Hono } from "hono";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb } from "../db/index.js";
import { CertificateService } from "../services/learning/certificate-service.js";
import { getJwtSecret } from "../utils/jwt.js";

export const verifyRoutes = new Hono<{ Variables: Variables } & AppEnv>();

verifyRoutes.get("/:certNumber", async (c) => {
  const certService = new CertificateService(getDb(), getJwtSecret());
  const result = await certService.verify(c.req.param("certNumber"));
  if (!result.valid) {
    return c.json(success({ valid: false, reason: result.reason }), 200);
  }
  const { certificate, payload } = result;
  return c.json(success({
    valid: true,
    certNumber: certificate.certNumber,
    issuedAt: certificate.issuedAt,
    expiresAt: certificate.expiresAt,
    courseTitle: payload.courseTitle,
    recipientName: payload.recipientName,
    finalScorePct: payload.finalScorePct,
    issuer: "hired.video",
  }), 200);
});
