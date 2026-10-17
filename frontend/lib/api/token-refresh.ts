/**
 * Sliding-session refresh. `POST /api/auth/refresh` re-issues a JWT from a
 * still-VALID bearer (it cannot revive an expired one), so the refresh has to
 * happen BEFORE expiry, not after a 401: the client calls
 * `ensureFreshToken()` ahead of every request and, once the stored token is
 * inside its last day, ONE single-flight refresh swaps it in place. A 401
 * after that is a real sign-out and still tears the session down.
 */

import { buildApiUrl } from "./base-url";
import { decodeJwtPayload, getAuthToken, setAuthToken } from "./auth-token";

/** Refresh once the token has less than this left (tokens live 7–30 days). */
const REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Don't hammer the endpoint when a refresh is refused. */
const RETRY_COOLDOWN_MS = 5 * 60 * 1000;
/** The guest copy kept for post-sign-in adoption (auth-service). */
const GUEST_TOKEN_KEY = "guest_token";

let inFlight: Promise<void> | null = null;
let lastAttemptAt = 0;

function needsRefresh(token: string): boolean {
  const exp = decodeJwtPayload<{ exp?: number }>(token)?.exp;
  if (typeof exp !== "number") return false;
  const msLeft = exp * 1000 - Date.now();
  return msLeft > 0 && msLeft < REFRESH_WINDOW_MS;
}

async function refresh(token: string): Promise<void> {
  lastAttemptAt = Date.now();
  try {
    const res = await fetch(buildApiUrl("/api/auth/refresh"), {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      credentials: "include",
    });
    if (!res.ok) return;
    const body = (await res.json()) as { data?: { token?: unknown } };
    const next = body?.data?.token;
    // Only swap when the session didn't change underneath us (sign-out,
    // account switch) while the refresh was in flight.
    if (typeof next !== "string" || getAuthToken() !== token) return;
    setAuthToken(next);
    try {
      if (localStorage.getItem(GUEST_TOKEN_KEY) === token) localStorage.setItem(GUEST_TOKEN_KEY, next);
    } catch {
      // storage blocked — the active token is what matters
    }
  } catch {
    // Transport failure — the current token is still valid; try again later.
  }
}

/** Refresh the stored token when it is close to expiry. Never throws. */
export async function ensureFreshToken(): Promise<void> {
  const token = getAuthToken();
  if (!token || !needsRefresh(token)) return;
  if (!inFlight && Date.now() - lastAttemptAt < RETRY_COOLDOWN_MS) return;
  inFlight ??= refresh(token).finally(() => {
    inFlight = null;
  });
  await inFlight;
}
