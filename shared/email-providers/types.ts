/**
 * Provider-agnostic shape for the email-sync providers (Gmail, Outlook).
 * Used by both the server's cron sweep and the client-driven PWA
 * orchestrator — the providers themselves are isomorphic (browser
 * `fetch` + base64url decode + URL parsing all work in both envs).
 *
 * `NormalisedEmail` here carries `receivedAt` as an ISO 8601 string
 * because the providers feed both an HTTP wire boundary (client → server
 * ingest) and a DB insert that takes a Date. The single string shape
 * lets us share one code path; the persistence layer wraps `new Date(…)`
 * at the insert site.
 */

import type {
  ClassifierInput,
  NormalisedEmailWire,
} from "../email-classification/index.js";

export type NormalisedEmail = NormalisedEmailWire;

export interface DeltaPullResult {
  messages: NormalisedEmail[];
  /** New cursor to persist on the account row — Gmail historyId or
   *  Outlook deltaLink. Null = nothing changed; keep the old cursor. */
  nextCursor: string | null;
}

export interface ProviderAuth {
  accessToken: string;
}

export interface EmailProvider {
  pullDelta(
    auth: ProviderAuth,
    options: { cursor: string | null; backfillLimit: number },
  ): Promise<DeltaPullResult>;
}

// Re-export so provider implementations only import from one place.
export type { ClassifierInput };
