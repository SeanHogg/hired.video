/**
 * WebAuthn byte-level helpers for the passkey ceremonies — ES256 (P-256
 * ECDSA) only: Apple Touch ID / Face ID, Windows Hello, Android
 * fingerprint and hardware security keys. Pure functions, no I/O.
 */

import { base64UrlEncode, sha256Bytes } from "../../utils/crypto.js";

/** Parse CBOR-encoded COSE key (minimal — only handles P-256 EC keys). */
export async function importCOSEPublicKey(coseKey: Uint8Array): Promise<CryptoKey> {
  // Try importing as raw SPKI first (some authenticators send it pre-formatted)
  try {
    return await crypto.subtle.importKey("spki", coseKey, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
  } catch {
    // Fall back to manual CBOR parsing for COSE_Key map format: locate the
    // uncompressed point (0x04 || x || y). Simplified, works for most
    // authenticator outputs.
    const offset = coseKey.findIndex((b, i) => b === 0x04 && coseKey[i + 1] !== undefined);
    const rawPoint = offset >= 0 ? coseKey.slice(offset, offset + 65) : coseKey.slice(-65);
    return await crypto.subtle.importKey("raw", rawPoint, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
  }
}

export async function verifyES256Signature(
  publicKey: CryptoKey,
  authData: Uint8Array,
  clientDataJSON: Uint8Array,
  sig: Uint8Array,
): Promise<boolean> {
  const clientDataHash = await sha256Bytes(clientDataJSON);
  const verifyData = new Uint8Array(authData.length + 32);
  verifyData.set(authData);
  verifyData.set(clientDataHash, authData.length);

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

/** First 32 bytes of authenticator data must equal SHA-256(rpId). */
export async function rpIdHashMatches(authData: Uint8Array, rpId: string): Promise<boolean> {
  const expected = await sha256Bytes(rpId);
  return expected.every((b, i) => b === authData[i]);
}

/** Flags byte (offset 32): bit 0 = UP (user present). */
export function userPresent(authData: Uint8Array): boolean {
  return Boolean(authData[32] & 0x01);
}

/** Flags byte (offset 32): bit 4 = BS (backup state — multi-device passkey). */
export function isBackedUp(authData: Uint8Array): boolean {
  return Boolean(authData[32] & 0x10);
}

/** Big-endian sign counter at offsets 33–36. */
export function readSignCount(authData: Uint8Array): number {
  return (authData[33] << 24) | (authData[34] << 16) | (authData[35] << 8) | authData[36];
}

/**
 * Extract authData from a "none"-attestation attestationObject
 * ({fmt:"none", attStmt:{}, authData:bytes}) via the CBOR byte-string
 * header heuristic (0x58 <len>), falling back to the tail of the object.
 */
export function extractAttestationAuthData(attObjBytes: Uint8Array): Uint8Array {
  const authDataStart = attObjBytes.findIndex((_, i) => i > 4 && attObjBytes[i - 1] === 0x58 && attObjBytes[i] >= 37);
  return authDataStart > 0
    ? attObjBytes.slice(authDataStart + 1, authDataStart + 1 + attObjBytes[authDataStart])
    : attObjBytes.slice(-Math.min(attObjBytes.length - 10, 256));
}

/** Attested credential data: credentialIdLength at offset 53, credentialId
 *  at 55, then the COSE public key. Both returned base64url-encoded. */
export function readAttestedCredential(authData: Uint8Array): { credentialId: string; publicKey: string } {
  const credIdLen = (authData[53] << 8) | authData[54];
  return {
    credentialId: base64UrlEncode(authData.slice(55, 55 + credIdLen)),
    publicKey: base64UrlEncode(authData.slice(55 + credIdLen)),
  };
}
