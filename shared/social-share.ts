/**
 * Social share-intent SSoT — the ONE place that knows how to turn a
 * shareable thing ({url, title, text}) into a per-network web-intent URL.
 *
 * This is the PUBLIC web-intent layer (opens the network's "share this URL"
 * page in a new tab). It is deliberately distinct from:
 *   - shared/social-platforms.ts — the OAuth *connection* identity (publish
 *     to a connected account); and
 *   - the LLM "generate a LinkedIn post" flow (LinkedInPostModal).
 *
 * Pure + framework-free so the reusable <ShareMenu> (and any card that wants
 * a Share affordance) builds intent URLs from one source — no per-card
 * `window.open("https://twitter.com/intent...")` string drift.
 *
 * Labels are exposed as i18n keys (`labelKey`), never literals, so consumers
 * render via `t()`.
 */

export interface SharePayload {
  /** Absolute, canonical URL to share. */
  url: string;
  /** Short title / headline (used as the tweet text, email subject, etc.). */
  title?: string;
  /** Optional longer body (email body, WhatsApp message prefix). */
  text?: string;
}

export interface ShareNetworkDef {
  /** Stable id (also the icon key on the frontend). */
  id: string;
  /** i18n key for the network's display name (e.g. "LinkedIn"). */
  labelKey: string;
  /** Build the web-intent URL for this network from the payload. */
  buildUrl: (payload: SharePayload) => string;
}

function enc(v: string | undefined): string {
  return encodeURIComponent(v ?? "");
}

/**
 * The supported share networks, in display order. Adding a network here is
 * the only change required to surface it in every ShareMenu (the frontend
 * maps `id` → icon).
 */
export const SHARE_NETWORKS: readonly ShareNetworkDef[] = [
  {
    id: "linkedin",
    labelKey: "share.network.linkedin",
    // LinkedIn's share-offsite only accepts the URL; the title is carried by
    // the destination page's OpenGraph tags.
    buildUrl: ({ url }) => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`,
  },
  {
    id: "x",
    labelKey: "share.network.x",
    buildUrl: ({ url, title }) =>
      `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(title)}`,
  },
  {
    id: "facebook",
    labelKey: "share.network.facebook",
    buildUrl: ({ url }) => `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
  },
  {
    id: "whatsapp",
    labelKey: "share.network.whatsapp",
    buildUrl: ({ url, title }) =>
      `https://wa.me/?text=${enc([title, url].filter(Boolean).join(" "))}`,
  },
  {
    id: "email",
    labelKey: "share.network.email",
    buildUrl: ({ url, title, text }) =>
      `mailto:?subject=${enc(title)}&body=${enc([text, url].filter(Boolean).join("\n\n"))}`,
  },
] as const;

/** Look up a single network definition by id. */
export function shareNetwork(id: string): ShareNetworkDef | undefined {
  return SHARE_NETWORKS.find((n) => n.id === id);
}
