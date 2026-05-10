/**
 * Provider-agnostic shape used by the sync service. Each connector
 * (Gmail, Outlook) implements `EmailProvider`; the sync orchestrator
 * doesn't know which vendor it's pulling from.
 */

export interface NormalisedEmail {
  /** Vendor message id — durable across re-fetches. Stored as
   *  `external_email_messages.provider_message_id`. */
  providerMessageId: string;
  /** Vendor thread/conversation id, when present. */
  providerThreadId: string | null;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  snippet: string;
  bodyHtml: string | null;
  bodyText: string | null;
  receivedAt: Date;
  /** Headers + label/folder ids the classifier may consult. */
  rawMetadata: Record<string, unknown>;
}

export interface DeltaPullResult {
  messages: NormalisedEmail[];
  /** New cursor to persist on the account row — Gmail historyId or
   *  Outlook deltaLink. Null = nothing changed; keep the old cursor. */
  nextCursor: string | null;
}

/** Authenticated provider context — the sync orchestrator obtains an
 *  access token via OAuth refresh, then hands it to the connector. */
export interface ProviderAuth {
  accessToken: string;
}

export interface EmailProvider {
  /** Pull all messages newer than the persisted cursor, or do an
   *  initial backfill of the most recent N when cursor is null. */
  pullDelta(
    auth: ProviderAuth,
    options: { cursor: string | null; backfillLimit: number },
  ): Promise<DeltaPullResult>;
}
