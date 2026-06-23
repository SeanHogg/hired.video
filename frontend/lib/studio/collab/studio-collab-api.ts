/**
 * studio-collab-api — client seam for the real-time collaborative editing
 * transport (gap #2243). Single place that builds the WebSocket URL for the
 * `StudioRoom` Durable Object so no consumer hard-codes the host or the
 * token-passing scheme.
 *
 * Auth: a browser `WebSocket` can't set an Authorization header, so the JWT
 * rides as the `?access_token=` query param. The server route
 * ([studio-socket.ts](../../../../api/src/routes/studio-socket.ts)) verifies
 * it + enforces `canActFor` before forwarding to the DO.
 *
 * Gating: opt-in via `VITE_STUDIO_REALTIME` (truthy) — mirrors the game
 * room's `VITE_GAME_REALTIME_URL` rollout flag. When unset the hook returns a
 * disabled stub and the editor falls back to solo autosave with zero
 * behavioural change. URL host follows `runtimeConfig.apiUrl` (so requests
 * land on api.hired.video, not the SPA origin).
 */

import { runtimeConfig } from "@/lib/runtime-config";

/** True when real-time collaboration is switched on for this build. */
export function studioRealtimeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const flag = (import.meta as { env?: Record<string, string | undefined> }).env
    ?.VITE_STUDIO_REALTIME;
  return Boolean(flag) && flag !== "off" && flag !== "false" && flag !== "0";
}

/** Build the `wss://…/api/studio/:projectId/collab-socket?access_token=…`
 *  URL. Returns null when the transport can't be addressed (no base URL, no
 *  token, SSR) so the caller self-gates. */
export function studioCollabSocketUrl(projectId: string): string | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem("auth_token");
  if (!token) return null;
  const base = runtimeConfig.apiUrl.replace(/\/$/, "");
  if (!base) return null;
  let url: URL;
  try {
    url = new URL(`${base}/api/studio/${encodeURIComponent(projectId)}/collab-socket`);
  } catch {
    return null;
  }
  if (url.protocol === "http:") url.protocol = "ws:";
  else if (url.protocol === "https:") url.protocol = "wss:";
  url.searchParams.set("access_token", token);
  return url.toString();
}
