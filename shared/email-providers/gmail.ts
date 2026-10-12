/**
 * Gmail connector — isomorphic between server (Cloudflare Worker) and
 * browser (PWA). Delta sync via `users.history.list`.
 *
 * Initial sync: fetch the most recent N message ids via
 * `users.messages.list`, capture each message's metadata, persist the
 * largest historyId we see as the cursor.
 *
 * Subsequent syncs: pass the stored historyId to `users.history.list`
 * and walk forward; the response's `historyId` becomes the new cursor.
 *
 * History list returns CHANGES (added / deleted / labelAdded /
 * labelRemoved); we filter to `messagesAdded` for the inbox flow.
 * Deletions and label changes are out of scope for P1.
 */

import type {
  DeltaPullResult,
  EmailProvider,
  NormalisedEmail,
  ProviderAuth,
} from "./types.js";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

interface GmailHeader { name: string; value: string }
interface GmailPayloadPart {
  mimeType: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number };
  parts?: GmailPayloadPart[];
}
interface GmailMessage {
  id: string;
  threadId: string;
  historyId?: string;
  internalDate?: string;     // ms since epoch (string)
  snippet?: string;
  payload?: GmailPayloadPart;
  labelIds?: string[];
}

function decodeBase64Url(data: string): string {
  const padded = data
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(data.length / 4) * 4, "=");
  try {
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

function findPart(part: GmailPayloadPart | undefined, mime: string): string | null {
  if (!part) return null;
  if (part.mimeType === mime && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  for (const sub of part.parts ?? []) {
    const found = findPart(sub, mime);
    if (found) return found;
  }
  return null;
}

function header(part: GmailPayloadPart | undefined, name: string): string | null {
  const h = part?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}

function parseFromHeader(value: string | null): { fromEmail: string; fromName: string | null } {
  if (!value) return { fromEmail: "", fromName: null };
  const m = /^\s*(?:"?([^"<]*?)"?\s*<)?([^>\s]+@[^>\s]+)/.exec(value);
  if (!m) return { fromEmail: value.trim(), fromName: null };
  const name = m[1]?.trim();
  return { fromEmail: m[2].trim(), fromName: name && name.length > 0 ? name : null };
}

async function gmailFetch<T>(
  auth: ProviderAuth,
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${GMAIL_BASE}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${auth.accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gmail ${path} failed: ${res.status} ${body.slice(0, 400)}`);
  }
  return res.json() as Promise<T>;
}

async function fetchMessage(auth: ProviderAuth, id: string): Promise<NormalisedEmail | null> {
  try {
    const m = await gmailFetch<GmailMessage>(auth, `/messages/${id}`, { format: "full" });
    const fromVal = header(m.payload, "From");
    const subjectVal = header(m.payload, "Subject") ?? "";
    const dateMs = Number(m.internalDate ?? "0");
    const html = findPart(m.payload, "text/html");
    const text = findPart(m.payload, "text/plain");
    const { fromEmail, fromName } = parseFromHeader(fromVal);
    return {
      providerMessageId: m.id,
      providerThreadId: m.threadId ?? null,
      fromEmail,
      fromName,
      subject: subjectVal,
      snippet: (m.snippet ?? "").slice(0, 600),
      bodyHtml: html,
      bodyText: text,
      receivedAt: new Date(dateMs || Date.now()).toISOString(),
      rawMetadata: { historyId: m.historyId, labelIds: m.labelIds ?? [] },
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[gmail] fetch ${id} failed:`, err);
    return null;
  }
}

export const gmailProvider: EmailProvider = {
  async pullDelta(auth, { cursor, backfillLimit }): Promise<DeltaPullResult> {
    if (!cursor) {
      // Initial backfill — most recent inbox messages, capped.
      const list = await gmailFetch<{ messages?: { id: string }[] }>(
        auth,
        "/messages",
        {
          maxResults: String(Math.min(backfillLimit, 50)),
          q: "in:inbox newer_than:14d",
        },
      );
      const ids = (list.messages ?? []).map((m) => m.id);
      const messages: NormalisedEmail[] = [];
      let maxHistoryId = "0";
      for (const id of ids) {
        const m = await fetchMessage(auth, id);
        if (!m) continue;
        messages.push(m);
        const hid = String(m.rawMetadata.historyId ?? "");
        if (hid && BigInt(hid) > BigInt(maxHistoryId)) maxHistoryId = hid;
      }
      return { messages, nextCursor: maxHistoryId !== "0" ? maxHistoryId : null };
    }

    // Incremental — walk history.list from the persisted cursor.
    interface HistoryEntry { messagesAdded?: { message: { id: string; threadId: string } }[] }
    interface HistoryResp {
      history?: HistoryEntry[];
      historyId?: string;
      nextPageToken?: string;
    }

    const ids = new Set<string>();
    let pageToken: string | undefined;
    let latestHistoryId = cursor;
    do {
      const params: Record<string, string> = {
        startHistoryId: cursor,
        historyTypes: "messageAdded",
      };
      if (pageToken) params.pageToken = pageToken;
      const resp = await gmailFetch<HistoryResp>(auth, "/history", params);
      for (const h of resp.history ?? []) {
        for (const a of h.messagesAdded ?? []) ids.add(a.message.id);
      }
      if (resp.historyId && BigInt(resp.historyId) > BigInt(latestHistoryId)) {
        latestHistoryId = resp.historyId;
      }
      pageToken = resp.nextPageToken;
    } while (pageToken);

    const messages: NormalisedEmail[] = [];
    for (const id of ids) {
      const m = await fetchMessage(auth, id);
      if (m) messages.push(m);
    }
    return { messages, nextCursor: latestHistoryId };
  },
};
