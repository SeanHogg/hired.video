/**
 * Provider bounce/complaint webhook classifier (#1975) — pure + testable.
 *
 * Maps a raw SendPulse event payload onto the set of addresses that must drop
 * onto the hard `email_suppressions` list (non-user-reversible). SendPulse posts
 * either a single event object or an array of them; field names vary across its
 * SMTP / bulk products, so we read the event kind from any of `event` / `type` /
 * `status` / `category` and the address from `email` / `to` / `recipient`.
 *
 * Hard suppression = permanent send-reputation / compliance signals only:
 * hard bounce, spam complaint, provider-level block/blacklist, and provider
 * unsubscribe. Soft/transient signals (soft_bounce, delivered, open, click) are
 * deliberately NOT suppressed — suppressing on a soft bounce would burn
 * deliverable addresses.
 */

/** Event kinds that warrant permanent suppression, normalized to lowercase
 *  with non-alphanumerics collapsed to "_". */
const HARD_EVENTS = new Set([
  "hard_bounce",
  "hardbounce",
  "bounce", // SendPulse "bounce" on the SMTP webhook is the hard variant
  "spam",
  "spam_complaint",
  "spamcomplaint",
  "complaint",
  "mark_as_spam",
  "markasspam",
  "block",
  "blocked",
  "blacklist",
  "blacklisted",
  "unsubscribe",
  "unsubscribed",
]);

export interface HardSuppression {
  email: string;
  reason: string;
}

function normalizeKind(raw: unknown): string {
  return String(raw ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function pickEmail(event: Record<string, unknown>): string | null {
  const candidate =
    event.email ?? event.to ?? event.recipient ?? event.address ?? null;
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim().toLowerCase();
  // Cheap shape guard — must look like an address, never an empty/garbage row.
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed) ? trimmed : null;
}

function pickKind(event: Record<string, unknown>): string {
  // First non-empty of the known event-kind fields.
  return (
    normalizeKind(event.event) ||
    normalizeKind(event.type) ||
    normalizeKind(event.status) ||
    normalizeKind(event.category)
  );
}

/**
 * Extract the hard-suppression set from a raw webhook body. Deduped by address
 * (first reason wins). Tolerant of a single object, an array, or a wrapped
 * `{ data: [...] }` / `{ events: [...] }` envelope; returns `[]` for anything
 * unparseable rather than throwing (a malformed webhook must not 500).
 */
export function extractHardSuppressions(body: unknown): HardSuppression[] {
  let events: unknown[];
  if (Array.isArray(body)) {
    events = body;
  } else if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    if (Array.isArray(obj.data)) events = obj.data;
    else if (Array.isArray(obj.events)) events = obj.events;
    else events = [obj];
  } else {
    return [];
  }

  const byEmail = new Map<string, HardSuppression>();
  for (const raw of events) {
    if (!raw || typeof raw !== "object") continue;
    const event = raw as Record<string, unknown>;
    const kind = pickKind(event);
    if (!HARD_EVENTS.has(kind)) continue;
    const email = pickEmail(event);
    if (!email || byEmail.has(email)) continue;
    byEmail.set(email, { email, reason: kind });
  }
  return [...byEmail.values()];
}
