/**
 * Google Ads OAuth 2.0 + account discovery (customers:listAccessibleCustomers).
 */

import { PaidMediaAdapterError, adapterFetch, type AdapterConfig, type PaidMediaAdapter } from "../../ports/adapter.js";
import type { ListedAdAccount, OAuthAuthUrlOptions, OAuthTokenSet } from "../../ports/types.js";
import { GOOGLE_ADS_API, GOOGLE_AUTH, GOOGLE_SCOPES, GOOGLE_TOKEN, assertConfigured, gAuthHeaders } from "./http.js";

export function createGoogleOAuth(
  config: AdapterConfig,
): Pick<PaidMediaAdapter, "buildAuthUrl" | "exchangeAuthCode" | "refreshAccessToken" | "listAdAccounts"> {
  return {
    buildAuthUrl(opts: OAuthAuthUrlOptions): string {
      if (!config.clientId) throw new PaidMediaAdapterError("google", "NOT_CONFIGURED", "Missing GOOGLE_CLIENT_ID");
      const params = new URLSearchParams({
        client_id:     config.clientId,
        redirect_uri:  opts.redirectUri,
        state:         opts.state,
        scope:         (opts.scopes ?? [GOOGLE_SCOPES]).join(" "),
        response_type: "code",
        access_type:   "offline",
        prompt:        "consent", // ensures refresh_token issued on reconnect
      });
      return `${GOOGLE_AUTH}?${params.toString()}`;
    },

    async exchangeAuthCode(code: string, redirectUri: string): Promise<OAuthTokenSet> {
      assertConfigured(config);
      const res = await adapterFetch("google", GOOGLE_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id:     config.clientId,
          client_secret: config.clientSecret,
          redirect_uri:  redirectUri,
          grant_type:    "authorization_code",
        }).toString(),
      });
      const t = await res.json() as { access_token: string; refresh_token?: string; expires_in: number; scope: string };
      return {
        accessToken:  t.access_token,
        refreshToken: t.refresh_token ?? null,
        expiresAt:    new Date(Date.now() + (t.expires_in - 30) * 1000),
        scopes:       t.scope,
      };
    },

    async refreshAccessToken(refreshToken: string): Promise<OAuthTokenSet> {
      assertConfigured(config);
      const res = await adapterFetch("google", GOOGLE_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id:     config.clientId,
          client_secret: config.clientSecret,
          grant_type:    "refresh_token",
        }).toString(),
      });
      const t = await res.json() as { access_token: string; expires_in: number; scope: string };
      return {
        accessToken:  t.access_token,
        refreshToken,
        expiresAt:    new Date(Date.now() + (t.expires_in - 30) * 1000),
        scopes:       t.scope,
      };
    },

    async listAdAccounts(accessToken: string): Promise<ListedAdAccount[]> {
      assertConfigured(config);
      // /customers:listAccessibleCustomers returns resource names like "customers/1234567890"
      const res = await adapterFetch("google", `${GOOGLE_ADS_API}/customers:listAccessibleCustomers`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}`, "developer-token": config.developerToken },
      });
      const list = await res.json() as { resourceNames?: string[] };
      const accounts: ListedAdAccount[] = [];
      for (const rn of list.resourceNames ?? []) {
        const id = rn.split("/")[1];
        if (!id) continue;
        // Fetch details with a GAQL search.
        try {
          const detailRes = await adapterFetch("google", `${GOOGLE_ADS_API}/customers/${id}/googleAds:search`, {
            method: "POST",
            headers: gAuthHeaders(accessToken, config.developerToken, id),
            body: JSON.stringify({ query: "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1" }),
          });
          const detail = await detailRes.json() as { results?: Array<{ customer?: any }> };
          const c = detail.results?.[0]?.customer;
          accounts.push({
            externalAccountId: id,
            name:              c?.descriptiveName ?? `Account ${id}`,
            currencyCode:      c?.currencyCode,
            timeZone:          c?.timeZone,
          });
        } catch {
          accounts.push({ externalAccountId: id, name: `Account ${id}` });
        }
      }
      return accounts;
    },
  };
}
