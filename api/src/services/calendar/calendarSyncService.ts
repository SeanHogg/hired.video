/**
 * Calendar connect + two-way sync use cases (#11).
 *
 *   • OAuth: consent redirect (state carries userId/provider/redirect/ts) and
 *     the callback that exchanges the code and stores the connection.
 *   • Sync: refresh the token, push unsynced platform events upstream (one
 *     batch stamp), pull upcoming provider events back (one dedup read + one
 *     bulk update + one multi-row insert — see calendarSyncRepository).
 */

import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { HiringPipelineRepository } from "../../repositories/hiringPipelineRepository.js";
import { markEventsPushed, upsertPulledEvents } from "../../repositories/calendarSyncRepository.js";
import { CalendarConnections, type SyncableCalendar } from "../provider-connections/calendar-connections.js";
import { frontendBaseUrl } from "../../utils/public-urls.js";
import {
  buildCalendarConsentUrl,
  exchangeCalendarAuthCode,
  pullEventsFromProvider,
  pushEventToProvider,
  refreshCalendarAccessToken,
  type ProviderTokens,
} from "./calendarProviderApi.js";

export interface CalendarSyncResult {
  provider: string;
  pushed: number;
  pulled: number;
  error?: string;
}

interface OAuthState {
  userId: string;
  provider: string;
  redirect: string;
  ts: number;
}

const STATE_TTL_MS = 10 * 60 * 1000;
const PUSH_BATCH = 50;

/** Consent-screen URL for `provider`; 400 unknown provider, 503 unconfigured. */
export function beginCalendarConnect(userId: string, provider: string, redirect: string): string {
  // Embed userId + provider in state for the callback.
  const state = btoa(JSON.stringify({ userId, provider, redirect, ts: Date.now() }));
  return buildCalendarConsentUrl(provider, state);
}

/**
 * OAuth callback: validate state, exchange the code, store the connection.
 * Always resolves to the frontend URL to redirect to (success or error).
 */
export async function completeCalendarConnect(input: {
  provider: string;
  code?: string;
  state?: string;
}): Promise<string> {
  const frontendBase = frontendBaseUrl();
  if (!input.code || !input.state) return `${frontendBase}/settings/integrations?error=missing_params`;

  let state: OAuthState;
  try {
    state = JSON.parse(atob(input.state));
    if (Date.now() - state.ts > STATE_TTL_MS) throw new Error("expired");
  } catch {
    return `${frontendBase}/settings/integrations?error=invalid_state`;
  }

  let tokens: ProviderTokens;
  try {
    tokens = await exchangeCalendarAuthCode(input.provider, input.code);
  } catch {
    return `${frontendBase}${state.redirect}?error=calendar_auth_failed`;
  }

  // Upsert calendar connection (one per user + provider).
  await new CalendarConnections().saveOAuth({
    userId: state.userId,
    provider: input.provider,
    calendarName: input.provider === "google" ? "Google Calendar" : "Outlook Calendar",
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken ?? null,
    expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
  });

  return `${frontendBase}${state.redirect}?connected=${encodeURIComponent(input.provider)}`;
}

/**
 * Returns a valid access token for the connection, refreshing it first when it
 * is expired or within the skew window. Implements refresh-token rotation:
 * providers that hand back a new refresh token (Microsoft always; Google on
 * re-consent) have it persisted so the next refresh uses the current one.
 * Falls back to the stored access token when refresh isn't possible.
 */
async function ensureFreshAccessToken(calendars: CalendarConnections, conn: SyncableCalendar): Promise<string | null> {
  const SKEW_MS = 2 * 60 * 1000;
  const { accessToken: currentAccess, refreshToken: currentRefresh } = await calendars.openTokens(conn);
  const stillValid =
    !!conn.tokenExpiresAt && new Date(conn.tokenExpiresAt).getTime() - Date.now() > SKEW_MS;
  if (stillValid && currentAccess) return currentAccess;
  if (!currentRefresh) return currentAccess;

  const refreshed = await refreshCalendarAccessToken(conn.provider, currentRefresh);
  if (!refreshed) return currentAccess;
  try {
    await calendars.saveRefreshed(conn.id, {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
    });
  } catch {
    return currentAccess;
  }
  return refreshed.accessToken;
}

/** One connection: push unsynced events, then pull provider events back. */
export async function syncCalendar(userId: string, conn: SyncableCalendar): Promise<CalendarSyncResult> {
  const db = getDb();
  const calendars = new CalendarConnections(db);

  // Refresh the token up front so a full sync run never half-fails on expiry.
  const accessToken = await ensureFreshAccessToken(calendars, conn);
  if (!accessToken || conn.provider === "ical") {
    return { provider: conn.provider, pushed: 0, pulled: 0 };
  }

  const events = await new HiringPipelineRepository(db)
    .findUnsyncedScheduledEventsForUser(userId, PUSH_BATCH)
    .catch(() => []);

  // Provider pushes are inherently per-event (external API); the DB stamp for
  // every successfully pushed row is ONE statement afterwards.
  const pushedRows: Array<{ id: string; externalEventId: string }> = [];
  for (const ev of events) {
    const externalId = await pushEventToProvider(conn.provider, accessToken, ev);
    if (externalId) pushedRows.push({ id: ev.id, externalEventId: externalId });
  }
  await markEventsPushed(db, conn.id, pushedRows);

  // Pull: external events → scheduled_events. Pulled rows are stored
  // syncedToCalendar:true with externalEventId set, so the push query above
  // (syncedToCalendar=false) never echoes them back upstream.
  const pulledEvents = await pullEventsFromProvider(conn.provider, accessToken);
  const pulled = await upsertPulledEvents(db, userId, conn.id, pulledEvents);

  return { provider: conn.provider, pushed: pushedRows.length, pulled };
}

/** Sync every active connection; 404 when the user has none. */
export async function syncAllCalendarsForUser(userId: string): Promise<{ synced: number; results: CalendarSyncResult[] }> {
  const calendars = new CalendarConnections();
  const connections = await calendars.listActive(userId);
  if (!connections.length) throw new DomainError(404, "NOT_FOUND", "No connected calendars");

  const results: CalendarSyncResult[] = [];
  for (const conn of connections) {
    try {
      const r = await syncCalendar(userId, conn);
      await calendars.markSynced(conn.id);
      results.push(r);
    } catch (err) {
      results.push({ provider: conn.provider, pushed: 0, pulled: 0, error: String(err) });
    }
  }
  return { synced: results.length, results };
}
