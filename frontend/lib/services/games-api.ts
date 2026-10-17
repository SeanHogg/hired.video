/**
 * games-api — thin client for the 3D-world game studio API surfaces
 * (gap #1636 family). Every call routes through the shared apiClient /
 * `buildApiUrl` so requests land on `api.hired.video` instead of the frontend's own
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

import { apiClient } from "@/lib/api-client";
import { buildApiUrl, getApiBaseUrl } from "@/lib/api/base-url";

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
  // Translate http(s) → ws(s); leave explicit ws:// / wss:// alone.
  let url: URL;
  try {
    url = new URL(buildApiUrl(`/api/games/${encodeURIComponent(projectId)}/socket`, override ?? getApiBaseUrl()));
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

/** JSON call through the shared apiClient (base URL, Bearer + the active
 *  SuperAdmin X-Emulation-Token, `{ success, data }` envelope validation —
 *  an SPA-shell HTML response is rejected, never slid through as success).
 *  Returns the unwrapped `data`; throws on network or HTTP failure. Callers
 *  `.catch(...)` and own their error UX, so no global error toast. */
export function gamesApiJson<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  return apiClient.fetchData<T>(path, {
    method: opts.method ?? "GET",
    body: opts.body ?? undefined,
    suppressErrorEvent: true,
  });
}
