/**
 * Google Ads transport: pinned endpoints, status/channel maps, auth headers
 * and the configured-credentials guard shared by the adapter modules.
 */

import { PaidMediaAdapterError, adapterFetch, type AdapterConfig } from "../../ports/adapter.js";
import type { AdapterContext, ResourceStatus } from "../../ports/types.js";
import type { GooglePost } from "./apply-criteria.js";

export const GOOGLE_API_VERSION = "v16";
export const GOOGLE_ADS_API   = `https://googleads.googleapis.com/${GOOGLE_API_VERSION}`;
export const GOOGLE_AUTH      = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN     = "https://oauth2.googleapis.com/token";
export const GOOGLE_SCOPES    = "https://www.googleapis.com/auth/adwords";

export const G_STATUS: Record<ResourceStatus, "ENABLED" | "PAUSED" | "REMOVED"> = {
  draft:     "PAUSED",
  active:    "ENABLED",
  paused:    "PAUSED",
  archived:  "REMOVED",
  completed: "REMOVED",
  error:     "PAUSED",
};

export const G_CHANNEL: Record<string, string> = {
  AWARENESS:        "DISPLAY",
  TRAFFIC:          "SEARCH",
  LEAD_GENERATION:  "SEARCH",
  CONVERSIONS:      "SEARCH",
  VIDEO_VIEWS:      "VIDEO",
  APP_INSTALLS:     "MULTI_CHANNEL",
  JOB_APPLICATIONS: "SEARCH",
};

export function gAuthHeaders(accessToken: string, developerToken: string, externalAccountId: string): HeadersInit {
  return {
    Authorization:     `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "login-customer-id": externalAccountId.replace(/-/g, ""),
    "Content-Type":    "application/json",
  };
}

export function assertConfigured(config: AdapterConfig): asserts config is AdapterConfig & {
  clientId: string;
  clientSecret: string;
  developerToken: string;
} {
  if (!config.clientId || !config.clientSecret) {
    throw new PaidMediaAdapterError("google", "NOT_CONFIGURED", "Missing GOOGLE_CLIENT_ID/SECRET");
  }
  if (!config.developerToken) {
    throw new PaidMediaAdapterError("google", "NOT_CONFIGURED", "Missing GOOGLE_ADS_DEVELOPER_TOKEN");
  }
}

/** Customer-scoped JSON POST with the adapter's auth + error mapping. */
export function customerPost(ctx: AdapterContext, developerToken: string): GooglePost {
  return async (path, body) => {
    const res = await adapterFetch("google", `${GOOGLE_ADS_API}/customers/${ctx.externalAccountId}/${path}`, {
      method: "POST",
      headers: gAuthHeaders(ctx.accessToken, developerToken, ctx.externalAccountId),
      body: JSON.stringify(body),
    });
    return res.json();
  };
}
