// passkeys.ts — FIDO2/WebAuthn (Passkey) routes.
//
// Supports ES256 (P-256 ECDSA) — used by Apple Touch ID, Face ID, Windows Hello,
// Android fingerprint, and hardware security keys.
//
// Flow:
//   Registration:
//     POST /api/auth/passkey/register/begin    → returns challenge + options
//     POST /api/auth/passkey/register/complete → verifies attestation, stores credential
//
//   Authentication:
//     POST /api/auth/passkey/login/begin       → returns challenge + options (no userId needed)
//     POST /api/auth/passkey/login/complete    → verifies assertion, returns JWT

import { Hono } from "hono";
import { eq, and, lt } from "drizzle-orm";
import { z } from "zod";
import { SignJWT } from "jose";
import type { Env, Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

const { webauthnCredentials, webauthnChallenges, users } = schema;

export const passkeyRoutes = new Hono<AppEnv>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function fromB64url(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(str.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function getRpId(url: string): string {
  try { return new URL(url).hostname; } catch { return "hired.video"; }
}

/** Parse CBOR-encoded COSE key (minimal — only handles P-256 EC keys). */
async function importCOSEPublicKey(coseKey: Uint8Array): Promise<CryptoKey> {
  // Minimal CBOR decoder for COSE EC2 key (kty=2, crv=1, x=..., y=...)
  // We expect the key in a standard format from the authenticator.
  // For robustness, support both raw COSE map and DER SubjectPublicKeyInfo.

  // Try importing as raw SPKI first (some authenticators send it pre-formatted)
  try {
    return await crypto.subtle.importKey("spki", coseKey, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
  } catch {
    // Fall back to manual CBOR parsing for COSE_Key map format
    // Locate x and y coordinates (32 bytes each) at known CBOR offsets.
    // This is a simplified parser that works for most authenticator outputs.
    const offset = coseKey.findIndex((b, i) =>
      // Look for CBOR map structure with typical P-256 key markers
      b === 0x04 && coseKey[i + 1] !== undefined,
    );
    const rawPoint = offset >= 0 ? coseKey.slice(offset, offset + 65) : coseKey.slice(-65);

    return await crypto.subtle.importKey(
      "raw",
      rawPoint,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["verify"],
    );
  }
}

async function verifyES256Signature(
  publicKey: CryptoKey,
  authData: Uint8Array,
  clientDataJSON: Uint8Array,
  sig: Uint8Array,
): Promise<boolean> {
  const clientDataHash = await crypto.subtle.digest("SHA-256", clientDataJSON);
  const verifyData = new Uint8Array(authData.length + 32);
  verifyData.set(authData);
  verifyData.set(new Uint8Array(clientDataHash), authData.length);

  // WebAuthn signatures are DER-encoded — convert to raw (r || s) for WebCrypto
  let rawSig = sig;
  if (sig[0] === 0x30) {
    const rLen = sig[3];
    const rStart = 4 + (sig[4] === 0x00 ? 1 : 0);
    const r = sig.slice(rStart, 4 + rLen);
    const sOffset = 4 + rLen + 2;
    const sLen = sig[sOffset - 1];
    const sStart = sOffset + (sig[sOffset] === 0x00 ? 1 : 0);
    const s = sig.slice(sStart, sOffset + sLen);
    rawSig = new Uint8Array(64);
    rawSig.set(r.slice(-32), 32 - Math.min(r.length, 32));
    rawSig.set(s.slice(-32), 64 - Math.min(s.length, 32));
  }

  return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, rawSig, verifyData);
}

// ─── Registration Begin ───────────────────────────────────────────────────────

passkeyRoutes.post("/register/begin", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const origin = c.req.header("origin") ?? "https://hired.video";
  const rpId = getRpId(origin);

  // Clean up expired challenges
  await db.delete(webauthnChallenges).where(lt(webauthnChallenges.expiresAt, new Date()));

  const challengeBytes = crypto.getRandomValues(new Uint8Array(32));
  const challengeB64 = b64url(challengeBytes.buffer);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await db.insert(webauthnChallenges).values({
    userId,
    challenge: challengeB64,
    type: "registration",
    expiresAt,
  } as any);

  // Fetch user for display name
  const [user] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);

  const options = {
    challenge: challengeB64,
    rp: { id: rpId, name: "hired.video" },
    user: {
      id: b64url(new TextEncoder().encode(userId).buffer as ArrayBuffer),
      name: user?.email ?? userId,
      displayName: user?.name ?? "User",
    },
    pubKeyCredParams: [
      { alg: -7, type: "public-key" },   // ES256
      { alg: -257, type: "public-key" }, // RS256
    ],
    timeout: 300_000,
    attestation: "none",
    authenticatorSelection: {
      userVerification: "preferred",
      residentKey: "preferred",
    },
  };

  return c.json(success(options), 200);
});

// ─── Registration Complete ────────────────────────────────────────────────────

const RegisterCompleteSchema = z.object({
  id: z.string(),
  rawId: z.string(),
  type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: z.string(),
    attestationObject: z.string(),
  }),
  name: z.string().max(100).default("My Passkey"),
});

passkeyRoutes.post("/register/complete", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = RegisterCompleteSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid credential data"), 400);

  const db = getDb();
  const origin = c.req.header("origin") ?? "https://hired.video";
  const rpId = getRpId(origin);

  // 1. Decode and verify clientDataJSON
  const clientDataBytes = fromB64url(parsed.data.response.clientDataJSON);
  const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes)) as Record<string, unknown>;

  if (clientData.type !== "webauthn.create") return c.json(error("VERIFICATION_FAILED", "Invalid ceremony type"), 400);

  // 2. Verify challenge
  const [challengeRow] = await db
    .select()
    .from(webauthnChallenges)
    .where(and(
      eq(webauthnChallenges.challenge, clientData.challenge as string),
      eq(webauthnChallenges.userId, userId),
      eq(webauthnChallenges.type, "registration"),
    ))
    .limit(1);

  if (!challengeRow || new Date(challengeRow.expiresAt) < new Date()) {
    return c.json(error("VERIFICATION_FAILED", "Challenge invalid or expired"), 400);
  }
  await db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, challengeRow.id));

  // 3. Verify origin
  if (clientData.origin !== origin && !String(clientData.origin).endsWith(".hired.video")) {
    return c.json(error("VERIFICATION_FAILED", "Origin mismatch"), 400);
  }

  // 4. Decode attestationObject (CBOR — we extract authData directly)
  // For "none" attestation, the attestationObject is: {fmt: "none", attStmt: {}, authData: bytes}
  // We store the credential ID and public key from authData.
  const attObjBytes = fromB64url(parsed.data.response.attestationObject);

  // authData is the last major component — locate it by finding the credentialId length at offset 55
  // Standard layout: 37 bytes fixed header + variable attested credential data
  const authData = attObjBytes.slice(attObjBytes.indexOf(0xa3) + 1); // simplified extraction
  // More reliable: find authData after CBOR map header
  // For now use a well-known offset heuristic (works for all "none" attestations)
  const authDataStart = attObjBytes.findIndex((_, i) =>
    i > 4 && attObjBytes[i - 1] === 0x58 && attObjBytes[i] >= 37,
  );
  const authDataFinal = authDataStart > 0
    ? attObjBytes.slice(authDataStart + 1, authDataStart + 1 + attObjBytes[authDataStart])
    : attObjBytes.slice(-Math.min(attObjBytes.length - 10, 256));

  // Verify rpIdHash (first 32 bytes of authData must be SHA-256(rpId))
  const rpIdHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rpId));
  const rpIdHashActual = authDataFinal.slice(0, 32);
  const rpHashesMatch = new Uint8Array(rpIdHash).every((b, i) => b === rpIdHashActual[i]);
  if (!rpHashesMatch) return c.json(error("VERIFICATION_FAILED", "RP ID hash mismatch"), 400);

  // Flags byte at offset 32: bit 0 = UP (user present), bit 2 = UV (user verified), bit 6 = AT (attested data present)
  const flags = authDataFinal[32];
  if (!(flags & 0x01)) return c.json(error("VERIFICATION_FAILED", "User not present"), 400);

  // credentialIdLength at offset 53, credentialId at offset 55
  const credIdLen = (authDataFinal[53] << 8) | authDataFinal[54];
  const credentialId = b64url(authDataFinal.slice(55, 55 + credIdLen).buffer);
  const coseKey = authDataFinal.slice(55 + credIdLen);
  const publicKey = b64url(coseKey.buffer);
  const signCount = (authDataFinal[33] << 24) | (authDataFinal[34] << 16) | (authDataFinal[35] << 8) | authDataFinal[36];

  // 5. Store credential
  await db.insert(webauthnCredentials).values({
    userId,
    credentialId,
    publicKey,
    algorithm: -7, // ES256
    signCount,
    name: parsed.data.name,
    isBackedUp: Boolean(flags & 0x10),
  } as any);

  return c.json(success({ credentialId, name: parsed.data.name }), 201);
});

// ─── Authentication Begin ─────────────────────────────────────────────────────

passkeyRoutes.post("/login/begin", async (c) => {
  const db = getDb();
  const origin = c.req.header("origin") ?? "https://hired.video";
  const rpId = getRpId(origin);

  await db.delete(webauthnChallenges).where(lt(webauthnChallenges.expiresAt, new Date()));

  const challengeBytes = crypto.getRandomValues(new Uint8Array(32));
  const challengeB64 = b64url(challengeBytes.buffer);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await db.insert(webauthnChallenges).values({
    userId: null,
    challenge: challengeB64,
    type: "authentication",
    expiresAt,
  } as any);

  return c.json(success({
    challenge: challengeB64,
    rpId,
    timeout: 300_000,
    userVerification: "preferred",
    allowCredentials: [], // empty = resident key (passkey) flow — browser picks
  }), 200);
});

// ─── Authentication Complete ──────────────────────────────────────────────────

const LoginCompleteSchema = z.object({
  id: z.string(),
  rawId: z.string(),
  type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: z.string(),
    authenticatorData: z.string(),
    signature: z.string(),
    userHandle: z.string().optional(),
  }),
});

passkeyRoutes.post("/login/complete", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = LoginCompleteSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid assertion data"), 400);

  const db = getDb();
  const origin = c.req.header("origin") ?? "https://hired.video";
  const rpId = getRpId(origin);

  // 1. Verify clientDataJSON
  const clientDataBytes = fromB64url(parsed.data.response.clientDataJSON);
  const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes)) as Record<string, unknown>;

  if (clientData.type !== "webauthn.get") return c.json(error("VERIFICATION_FAILED", "Invalid ceremony type"), 400);

  // 2. Verify challenge
  const [challengeRow] = await db
    .select()
    .from(webauthnChallenges)
    .where(and(
      eq(webauthnChallenges.challenge, clientData.challenge as string),
      eq(webauthnChallenges.type, "authentication"),
    ))
    .limit(1);

  if (!challengeRow || new Date(challengeRow.expiresAt) < new Date()) {
    return c.json(error("VERIFICATION_FAILED", "Challenge invalid or expired"), 400);
  }
  await db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, challengeRow.id));

  // 3. Look up credential
  const credentialId = parsed.data.id;
  const [cred] = await db
    .select()
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.credentialId, credentialId))
    .limit(1);

  if (!cred) return c.json(error("NOT_FOUND", "Credential not found"), 404);

  // 4. Verify origin and rpIdHash
  if (clientData.origin !== origin && !String(clientData.origin).endsWith(".hired.video")) {
    return c.json(error("VERIFICATION_FAILED", "Origin mismatch"), 400);
  }

  const authDataBytes = fromB64url(parsed.data.response.authenticatorData);
  const rpIdHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rpId));
  if (!new Uint8Array(rpIdHash).every((b, i) => b === authDataBytes[i])) {
    return c.json(error("VERIFICATION_FAILED", "RP ID hash mismatch"), 400);
  }

  const flags = authDataBytes[32];
  if (!(flags & 0x01)) return c.json(error("VERIFICATION_FAILED", "User not present"), 400);

  // 5. Verify signature
  const publicKeyBytes = fromB64url(cred.publicKey);
  let publicKey: CryptoKey;
  try {
    publicKey = await importCOSEPublicKey(publicKeyBytes);
  } catch {
    return c.json(error("VERIFICATION_FAILED", "Could not import public key"), 400);
  }

  const sigBytes = fromB64url(parsed.data.response.signature);
  const valid = await verifyES256Signature(
    publicKey,
    authDataBytes,
    clientDataBytes,
    sigBytes,
  );

  if (!valid) return c.json(error("VERIFICATION_FAILED", "Signature verification failed"), 401);

  // 6. Check and update sign counter
  const newCount = (authDataBytes[33] << 24) | (authDataBytes[34] << 16) | (authDataBytes[35] << 8) | authDataBytes[36];
  if (cred.signCount > 0 && newCount <= cred.signCount) {
    // Potential cloned authenticator — log but don't block (could be a synced passkey)
    console.warn(`[passkey] sign count regression for credential ${credentialId}: ${cred.signCount} → ${newCount}`);
  }

  await db
    .update(webauthnCredentials)
    .set({ signCount: newCount, lastUsedAt: new Date() } as any)
    .where(eq(webauthnCredentials.id, cred.id));

  // 7. Fetch user and issue JWT
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, cred.userId))
    .limit(1);

  if (!user) return c.json(error("NOT_FOUND", "User not found"), 404);

  const secret = new TextEncoder().encode(c.env?.JWT_SECRET ?? "dev-secret");
  const token = await new SignJWT({ sub: user.id, email: user.email, role: user.role, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

  return c.json(success({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } }), 200);
});

// ─── List / Delete registered passkeys ───────────────────────────────────────

passkeyRoutes.get("/credentials", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const creds = await db
    .select({
      id: webauthnCredentials.id,
      name: webauthnCredentials.name,
      isBackedUp: webauthnCredentials.isBackedUp,
      lastUsedAt: webauthnCredentials.lastUsedAt,
      createdAt: webauthnCredentials.createdAt,
    })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, userId));

  return c.json(success(creds), 200);
});

passkeyRoutes.delete("/credentials/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  await db.delete(webauthnCredentials).where(and(
    eq(webauthnCredentials.id, c.req.param("id")),
    eq(webauthnCredentials.userId, userId),
  ));

  return c.json(success(true), 200);
});
