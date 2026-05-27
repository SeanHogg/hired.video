/**
 * games-api — thin client for the 3D-world game studio API surfaces
 * (gap #1636 family). Every call routes through `runtimeConfig.apiUrl`
 * so requests land on `api.hired.video` instead of the frontend's own
 * origin (which would return the SPA shell — the symptom that surfaced
 * as "Unexpected token '<', '<!doctype'..." JSON parse errors when the
 * first cut of the invite UI used relative `/api/` paths).
 *
 * Single seam for:
 *   - challenge-complete award (Phase 2)
 *   - invite CRUD + resolve + join (Phase 4)
 *   - AI agent turn + conversation hydrate (Phase 5)
 *   - WebSocket URL for the multiplayer signaling DO (Phase 3)
 *
 * Every consumer (InviteDialog, AIAgentPanel, PlayInvite, useGameRoom)
 * imports from here — no fetch site picks the base URL on its own.
 */

import { runtimeConfig } from "@/lib/runtime-config";

/** Resolve an absolute API URL from a relative API path. Trims a
 *  trailing slash on the base + drops a leading slash on the path so
 *  callers can pass either form. */
export function gamesApiUrl(path: string): string {
  const base = runtimeConfig.apiUrl.replace(/\/$/, "");
  const tail = path.startsWith("/") ? path : `/${path}`;
  return `${base}${tail}`;
}

/** WebSocket URL for the multiplayer signaling DO. Derived from
 *  `apiUrl` (so the WS endpoint follows the API host automatically)
 *  unless `VITE_GAME_REALTIME_URL` is set as an explicit override (for
 *  local dev pointing at a different DO instance). */
export function gamesSocketUrl(
  projectId: string,
  identity: { userId: string; displayName: string },
): string | null {
  const override = (import.meta as { env?: Record<string, string | undefined> }).env
    ?.VITE_GAME_REALTIME_URL;
  const base = (override ?? runtimeConfig.apiUrl).replace(/\/$/, "");
  if (!base) return null;
  // Translate http(s) → ws(s); leave explicit ws:// / wss:// alone.
  let url: URL;
  try {
    url = new URL(`${base}/api/games/${encodeURIComponent(projectId)}/socket`);
  } catch {
    return null;
  }
  if (url.protocol === "http:") url.protocol = "ws:";
  else if (url.protocol === "https:") url.protocol = "wss:";
  url.searchParams.set("userId", identity.userId);
  url.searchParams.set("name", identity.displayName);
  return url.toString();
}

interface FetchOpts {
  method?: "GET" | "POST" | "DELETE" | "PATCH";
  body?: unknown;
}

/** JSON fetch helper — sends + receives JSON, includes credentials.
 *  Returns the parsed `data` envelope on success, throws an Error on
 *  network or HTTP failure. Callers `.catch(...)` if they want to
 *  swallow; the helper itself never silently no-ops on a non-OK
 *  status (which is what would let an HTML response slide through as
 *  "success" again). */
export async function gamesApiJson<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const res = await fetch(gamesApiUrl(path), {
    method: opts.method ?? "GET",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    // Guard against the SPA-shell-return failure mode that triggered
    // the original bug — if a request comes back as text/html the
    // wrapper rejects cleanly so the caller doesn't try to JSON.parse
    // "<!doctype html>".
    throw new Error(
      `Games API did not return JSON for ${path} (status ${res.status}, content-type ${contentType || "missing"})`,
    );
  }
  const body = await res.json();
  if (!res.ok || !body?.success) {
    throw new Error(body?.error?.message ?? `Games API ${res.status}`);
  }
  return body.data as T;
}
