/**
 * Outlook connector — isomorphic between server and browser. Delta
 * sync via `/me/mailFolders/inbox/messages/delta`.
 *
 * Initial sync: hit the delta endpoint without a token; persist the
 * returned `@odata.deltaLink` as the cursor.
 *
 * Subsequent syncs: hit the persisted deltaLink directly. The response
 * may paginate via `@odata.nextLink`; walk to the final page, persist
 * the new `@odata.deltaLink`. Removed messages come back as objects
 * with `@removed` — ignored in P1.
 */

import type {
  DeltaPullResult,
  EmailProvider,
  NormalisedEmail,
  ProviderAuth,
} from "./types.js";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const INITIAL_DELTA_PATH = "/me/mailFolders/inbox/messages/delta";

interface GraphMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  from?: { emailAddress?: { address?: string; name?: string } };
  receivedDateTime?: string;
  isRead?: boolean;
  internetMessageId?: string;
  "@removed"?: unknown;
}

interface GraphDeltaResp {
  value?: GraphMessage[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

async function graphFetch(auth: ProviderAuth, urlOrPath: string): Promise<GraphDeltaResp> {
  const url = urlOrPath.startsWith("https://") ? urlOrPath : `${GRAPH_BASE}${urlOrPath}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      Accept: "application/json",
      Prefer: 'odata.maxpagesize="50"',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Graph ${urlOrPath.slice(0, 80)} failed: ${res.status} ${body.slice(0, 400)}`);
  }
  return res.json() as Promise<GraphDeltaResp>;
}

function normalise(m: GraphMessage): NormalisedEmail | null {
  if ((m as any)["@removed"]) return null;
  const fromAddr = m.from?.emailAddress?.address ?? "";
  const fromName = m.from?.emailAddress?.name ?? null;
  const html = m.body?.contentType?.toLowerCase() === "html" ? (m.body?.content ?? null) : null;
  const text = m.body?.contentType?.toLowerCase() === "text" ? (m.body?.content ?? null) : null;
  return {
    providerMessageId: m.id,
    providerThreadId: m.conversationId ?? null,
    fromEmail: fromAddr,
    fromName: fromName && fromName.length > 0 ? fromName : null,
    subject: m.subject ?? "",
    snippet: (m.bodyPreview ?? "").slice(0, 600),
    bodyHtml: html,
    bodyText: text,
    receivedAt: m.receivedDateTime ?? new Date().toISOString(),
    rawMetadata: { internetMessageId: m.internetMessageId ?? null, isRead: !!m.isRead },
  };
}

export const outlookProvider: EmailProvider = {
  async pullDelta(auth, { cursor }): Promise<DeltaPullResult> {
    let url = cursor ?? INITIAL_DELTA_PATH;
    const messages: NormalisedEmail[] = [];
    let nextCursor: string | null = null;

    while (true) {
      const resp: GraphDeltaResp = await graphFetch(auth, url);
      for (const m of resp.value ?? []) {
        const n = normalise(m);
        if (n) messages.push(n);
      }
      if (resp["@odata.nextLink"]) {
        url = resp["@odata.nextLink"];
        continue;
      }
      if (resp["@odata.deltaLink"]) {
        nextCursor = resp["@odata.deltaLink"];
      }
      break;
    }
    return { messages, nextCursor };
  },
};
