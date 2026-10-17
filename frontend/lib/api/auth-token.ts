/**
 * Auth-token + impersonation-header SSoT for every HTTP path in the SPA.
 *
 * The singleton `apiClient`, the SSE notifications hub, the XHR upload path,
 * beacons and any hand-rolled `fetch` read the bearer and the SuperAdmin
 * X-Emulation-Token from HERE — nothing else touches `localStorage` for the
 * token, so the auth rules can't drift between transports.
 */

export const AUTH_TOKEN_KEY = "auth_token";
export const REFRESH_TOKEN_KEY = "refresh_token";

/** The persisted bearer, or null (signed out / storage blocked). */
export function getAuthToken(): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // Storage blocked (private mode) — the session stays in memory only.
  }
}

// Module-level getter populated by AuthProvider when an impersonation session
// is active. Kept here (not in a React context) so non-React transports can
// read the current token on every request without prop-drilling.
let _emulationTokenGetter: () => string | null = () => null;

/** Called by AuthProvider whenever the impersonation session changes. */
export function setEmulationTokenGetter(getter: () => string | null): void {
  _emulationTokenGetter = getter;
}

export function getEmulationToken(): string | null {
  return _emulationTokenGetter();
}

// Admin endpoints require the real SA bearer; attaching an emulation token
// makes superAdminMiddleware reject with 403 ("Impersonation tokens cannot
// access SuperAdmin endpoints"). Skip the header for the /admin/ prefix.
export function shouldAttachEmulationToken(url: string): boolean {
  try {
    const path = /^https?:\/\//i.test(url) ? new URL(url).pathname : url;
    return !/\/api\/admin\//i.test(path);
  } catch {
    return !/\/api\/admin\//i.test(url);
  }
}

/** The X-Emulation-Token header for `url`, when an impersonation is active. */
export function emulationHeaders(url: string): Record<string, string> {
  const emuToken = _emulationTokenGetter();
  return emuToken && shouldAttachEmulationToken(url) ? { "X-Emulation-Token": emuToken } : {};
}

/**
 * Standard auth headers (Bearer + X-Emulation-Token) for any transport that
 * can't route through `apiClient.request` (XHR progress uploads, beacons,
 * `keepalive` fetches) — exactly what the singleton attaches.
 */
export function standardAuthHeaders(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const token = getAuthToken();
  if (token) out.Authorization = `Bearer ${token}`;
  return { ...out, ...emulationHeaders(url) };
}

/** Decode a JWT's payload (no signature check — display/expiry use only). */
export function decodeJwtPayload<T extends object = { exp?: number }>(token: string): T | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as T;
  } catch {
    return null;
  }
}
