/**
 * Synchronous JWT claim reader.
 *
 * `useAuth()` is the canonical way to read the current user — but it's a
 * hook, so it can't be used in places like `ErrorBoundary`'s class
 * component render path or top-level error handlers that fire before
 * the React tree mounts. This module decodes the persisted JWT directly
 * from localStorage so those code paths can answer "is this user a
 * SuperAdmin?" synchronously without grabbing the React context.
 *
 * Mirrors the same token key + decoding scheme as auth-service.ts so
 * the two can never disagree.
 */

import { USER_ROLES } from "@shared/user-roles";

const TOKEN_KEY = "auth_token";

interface JwtPayload {
  sub?: string;
  email?: string;
  roles?: string[];
  exp?: number;
}

function decodeBase64Url(input: string): string | null {
  try {
    const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}

function readPayload(): JwtPayload | null {
  if (typeof localStorage === "undefined") return null;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const json = decodeBase64Url(parts[1]);
  if (!json) return null;
  try {
    const payload = JSON.parse(json) as JwtPayload;
    // Drop expired tokens — a stale localStorage shouldn't keep
    // pretending the user is signed in.
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/** True iff the currently-stored JWT carries the SuperAdmin role.
 *  Returns false on any decode failure or missing token — false is
 *  the right "least privilege" default for the error UI gate. */
export function isSuperAdminFromToken(): boolean {
  const payload = readPayload();
  if (!payload?.roles) return false;
  return payload.roles.includes(USER_ROLES.SUPER_ADMIN);
}

/** Email address from the JWT, or null if absent / token invalid.
 *  Used by the error UI as a fallback for the developer-only display
 *  path (so seanhogg@gmail.com still sees full details even if the
 *  SuperAdmin role isn't applied for that session). */
export function emailFromToken(): string | null {
  const payload = readPayload();
  return payload?.email ?? null;
}

/** The lead developer's account: sees developer views (raw errors,
 *  diagnostics) even on a session whose JWT lacks the SuperAdmin role. */
export const DEVELOPER_EMAIL = "seanhogg@gmail.com";

/** THE developer-view rule — SuperAdmin, or the lead developer's email.
 *  Every developer-only surface (error details, diagnostics) uses this. */
export function isDeveloperViewer(viewer: { isSuperAdmin: boolean; email?: string | null }): boolean {
  return viewer.isSuperAdmin || viewer.email?.toLowerCase() === DEVELOPER_EMAIL;
}

/** Same rule read from the stored JWT, for code that can't use useAuth(). */
export function isDeveloperViewerFromToken(): boolean {
  return isDeveloperViewer({ isSuperAdmin: isSuperAdminFromToken(), email: emailFromToken() });
}
