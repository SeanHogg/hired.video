/**
 * OAuth sign-in / account-link redirects (`/api/auth/oauth/:provider`,
 * routes/oauth.ts). Full-page navigations can't go through apiClient, so the
 * URL is built here from the API base SSoT — the login buttons and the
 * Settings "Connect" buttons can't drift onto different hosts.
 */

import { buildApiUrl } from "../api/base-url";
import { getAuthToken } from "../api/auth-token";

/** The provider start URL with `params` as its query string. */
export function oauthStartUrl(provider: string, params: URLSearchParams): string {
  return buildApiUrl(`/api/auth/oauth/${encodeURIComponent(provider)}?${params.toString()}`);
}

/** Start URL that LINKS `provider` to the signed-in account (`link_token`). */
export function oauthLinkUrl(provider: string, redirect: string): string {
  const params = new URLSearchParams({ redirect, link_token: getAuthToken() ?? "" });
  return oauthStartUrl(provider, params);
}
