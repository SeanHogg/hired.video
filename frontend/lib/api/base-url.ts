/**
 * API base-URL SSoT. Every transport (apiClient, SSE hub, XHR uploads, OAuth
 * redirects, image URLs) resolves the API origin through `getApiBaseUrl()` —
 * runtime `/config.js` first, then build-time env, then the live API.
 */

import { runtimeConfig } from "../runtime-config";

const LIVE_API = "https://api.hired.video";

/** The API base with no trailing slash. May or may not end in `/api`. */
export function getApiBaseUrl(): string {
  const raw =
    runtimeConfig.apiUrl ||
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    LIVE_API;
  return raw.replace(/\/+$/, "");
}

/**
 * Resolve `endpoint` (e.g. `/api/resumes/abc?x=1`) against `baseUrl`,
 * de-duplicating `/api` when the base already ends in it. Paths are passed
 * through VERBATIM — backend routes are case-sensitive and path params
 * (base64url tokens, ids) must never be re-cased. Absolute URLs pass through.
 */
export function buildApiUrl(endpoint: string, baseUrl: string = getApiBaseUrl()): string {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;

  const cleanEndpoint = endpoint.replace(/^\/+/, "");
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const joined =
    /\/api$/i.test(cleanBase) && /^api\//i.test(cleanEndpoint)
      ? `${cleanBase}/${cleanEndpoint.slice(4)}`
      : `${cleanBase}/${cleanEndpoint}`;

  // Collapse accidental double slashes in the path (never the protocol's).
  const [path, query] = splitOnce(joined, "?");
  const collapsed = path.replace(/([^:]\/)\/+/g, "$1");
  return query === undefined ? collapsed : `${collapsed}?${query}`;
}

function splitOnce(value: string, sep: string): [string, string | undefined] {
  const i = value.indexOf(sep);
  return i === -1 ? [value, undefined] : [value.slice(0, i), value.slice(i + 1)];
}
