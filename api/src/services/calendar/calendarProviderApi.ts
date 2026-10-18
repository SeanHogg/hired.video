/**
 * Google Calendar / Microsoft Graph HTTP adapter (#11). Pure provider I/O —
 * OAuth consent URL, code exchange, token refresh, push one event, pull
 * upcoming events. No database access; persistence lives in
 * CalendarConnections + the calendar repositories.
 */

import { DomainError } from "../../domains/errors.js";
import type { PulledCalendarEvent } from "../../repositories/calendarSyncRepository.js";
import { apiBaseUrl } from "../../utils/public-urls.js";
import { getEnv } from "../../utils/env.js";

interface CalendarProviderConfig {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
}

const CALENDAR_PROVIDERS: Record<string, CalendarProviderConfig> = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.readonly"],
  },
  outlook: {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["https://graph.microsoft.com/Calendars.ReadWrite", "offline_access"],
  },
};

export interface ProviderTokens {
  accessToken: string;
  /** Present only when the provider issued / rotated one. */
  refreshToken?: string;
  expiresIn: number;
}

/** Shape a platform event needs to be pushed upstream. */
export interface PushableCalendarEvent {
  title: string;
  description?: string | null;
  startAt: Date | string;
  endAt: Date | string;
  timezone?: string | null;
  location?: string | null;
  meetingUrl?: string | null;
}

function clientCredentials(provider: string): { clientId: string; clientSecret: string } {
  const google = provider === "google";
  return {
    clientId: getEnv(google ? "GOOGLE_CLIENT_ID" : "MICROSOFT_CLIENT_ID"),
    clientSecret: getEnv(google ? "GOOGLE_CLIENT_SECRET" : "MICROSOFT_CLIENT_SECRET"),
  };
}

function callbackUrl(provider: string): string {
  return `${apiBaseUrl()}/api/calendar/connect/${provider}/callback`;
}

/**
 * Provider consent-screen URL. `state` is opaque to this adapter.
 * Throws 400 for an unknown provider, 503 when its client id is unset.
 */
export function buildCalendarConsentUrl(provider: string, state: string): string {
  const cfg = CALENDAR_PROVIDERS[provider];
  if (!cfg) throw new DomainError(400, "BAD_REQUEST", `Unknown provider: ${provider}`);
  const { clientId } = clientCredentials(provider);
  if (!clientId) throw new DomainError(503, "SERVICE_UNAVAILABLE", `${provider} calendar not configured`);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl(provider),
    response_type: "code",
    scope: cfg.scopes.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return `${cfg.authUrl}?${params.toString()}`;
}

/** Exchange an authorization code for tokens. Throws on any failure. */
export async function exchangeCalendarAuthCode(provider: string, code: string): Promise<ProviderTokens> {
  const cfg = CALENDAR_PROVIDERS[provider];
  if (!cfg) throw new Error(`Unknown provider: ${provider}`);
  const { clientId, clientSecret } = clientCredentials(provider);
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl(provider),
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  const data: any = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || undefined,
    expiresIn: data.expires_in ?? 3600,
  };
}

/**
 * Refresh-token grant. Returns null when refresh isn't possible (unknown
 * provider, missing client credentials, provider rejection, no access token).
 */
export async function refreshCalendarAccessToken(provider: string, refreshToken: string): Promise<ProviderTokens | null> {
  const cfg = CALENDAR_PROVIDERS[provider];
  if (!cfg) return null;
  const { clientId, clientSecret } = clientCredentials(provider);
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        // Microsoft requires the scope on refresh; Google ignores it.
        ...(provider === "outlook" ? { scope: cfg.scopes.join(" ") } : {}),
      }).toString(),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (!data.access_token) return null;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || undefined,
      expiresIn: Number(data.expires_in ?? 3600),
    };
  } catch {
    return null;
  }
}

/**
 * Pushes one platform event to the provider's calendar and returns the created
 * external event id (or null on failure / unsupported provider). Google uses
 * Calendar v3; Outlook uses Microsoft Graph.
 */
export async function pushEventToProvider(
  provider: string,
  accessToken: string,
  ev: PushableCalendarEvent,
): Promise<string | null> {
  const startIso = new Date(ev.startAt).toISOString();
  const endIso = new Date(ev.endAt).toISOString();
  const timeZone = ev.timezone || "UTC";

  try {
    if (provider === "google") {
      const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: ev.title,
          description: ev.description ?? "",
          ...(ev.location ? { location: ev.location } : {}),
          start: { dateTime: startIso, timeZone },
          end: { dateTime: endIso, timeZone },
        }),
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      return data.id ?? null;
    }

    if (provider === "outlook") {
      // Graph wants a local (offset-free) datetime + an explicit timeZone.
      const graphTime = (iso: string) => iso.replace(/\.\d+Z$/, "").replace(/Z$/, "");
      const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: ev.title,
          body: { contentType: "HTML", content: ev.description ?? "" },
          start: { dateTime: graphTime(startIso), timeZone },
          end: { dateTime: graphTime(endIso), timeZone },
          ...(ev.location ? { location: { displayName: ev.location } } : {}),
          ...(ev.meetingUrl ? { onlineMeetingUrl: ev.meetingUrl } : {}),
        }),
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      return data.id ?? null;
    }
  } catch {
    return null;
  }
  return null; // ical / unknown — nothing to push to
}

/**
 * Pulls upcoming events from the provider's calendar (now → +`days` days) and
 * returns them normalized. Google uses Calendar v3 `events.list` (singleEvents
 * so recurring instances expand); Outlook uses Graph `calendarView`. Cancelled
 * events and entries without a usable time window are dropped. Returns [] on
 * any failure / unsupported provider — pull is best-effort.
 */
export async function pullEventsFromProvider(
  provider: string,
  accessToken: string,
  days = 60,
): Promise<PulledCalendarEvent[]> {
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  const MAX = 100;

  try {
    if (provider === "google") {
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: String(MAX),
      });
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) return [];
      const data: any = await res.json();
      const out: PulledCalendarEvent[] = [];
      for (const it of (data.items ?? []) as any[]) {
        if (!it?.id || it.status === "cancelled") continue;
        const startRaw = it.start?.dateTime ?? (it.start?.date ? `${it.start.date}T00:00:00Z` : null);
        const endRaw = it.end?.dateTime ?? (it.end?.date ? `${it.end.date}T00:00:00Z` : null);
        if (!startRaw || !endRaw) continue;
        out.push({
          externalEventId: String(it.id),
          title: String(it.summary ?? "(untitled event)").slice(0, 500),
          description: it.description ?? null,
          startAt: new Date(startRaw),
          endAt: new Date(endRaw),
          timezone: it.start?.timeZone ?? "UTC",
          location: it.location ?? null,
          meetingUrl: it.hangoutLink ?? null,
        });
      }
      return out;
    }

    if (provider === "outlook") {
      const params = new URLSearchParams({
        startDateTime: timeMin,
        endDateTime: timeMax,
        $top: String(MAX),
        $orderby: "start/dateTime",
      });
      const res = await fetch(`https://graph.microsoft.com/v1.0/me/calendarView?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
      });
      if (!res.ok) return [];
      const data: any = await res.json();
      const out: PulledCalendarEvent[] = [];
      for (const it of (data.value ?? []) as any[]) {
        if (!it?.id || it.isCancelled) continue;
        // Graph returns offset-free local datetimes paired with an explicit
        // timeZone; with the Prefer header above that is UTC, so append Z.
        const toDate = (t: any): Date | null => {
          if (!t?.dateTime) return null;
          const s = String(t.dateTime);
          return new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`);
        };
        const startAt = toDate(it.start);
        const endAt = toDate(it.end);
        if (!startAt || !endAt) continue;
        out.push({
          externalEventId: String(it.id),
          title: String(it.subject ?? "(untitled event)").slice(0, 500),
          description: it.bodyPreview ?? null,
          startAt,
          endAt,
          timezone: it.start?.timeZone ?? "UTC",
          location: it.location?.displayName ?? null,
          meetingUrl: it.onlineMeeting?.joinUrl ?? null,
        });
      }
      return out;
    }
  } catch {
    return [];
  }
  return []; // ical / unknown — nothing to pull
}
