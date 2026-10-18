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
import { success } from "../types/index.js";
import { CertificateService } from "../services/learning/certificate-service.js";

export const verifyRoutes = new Hono<{ Variables: Variables } & AppEnv>();

/** #1500 — published JWKS so a third party (LinkedIn, an LMS, an enterprise
 *  verifier) can validate an Ed25519-signed cert off-platform. Empty `keys`
 *  array when no asymmetric key is provisioned (certs stay HMAC same-origin).
 *  Registered before `/:certNumber`; the 2-segment path can't collide with
 *  the single-segment cert-number route. */
verifyRoutes.get("/.well-known/jwks.json", async (c) => {
  const certService = CertificateService.live();
  const jwk = await certService.publicJwk();
  return c.json({ keys: jwk ? [jwk] : [] }, 200);
});

verifyRoutes.get("/:certNumber", async (c) => {
  const certService = CertificateService.live();
  const result = await certService.verify(c.req.param("certNumber"));
  if (result.valid === false) {
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
