/**
 * Upgrade-slug registry — single source of truth for `/pricing?upgrade=<slug>`
 * deep links (gap #810).
 *
 * When a Pro-gated feature wants to redirect a free user to /pricing with an
 * acknowledgement banner, it picks a slug from here. The Pricing page reads
 * the slug from the URL, renders `UPGRADE_REGISTRY[slug].banner`, and smooth-
 * scrolls the comparison-table row at `data-upgrade-id={slug}` into view.
 *
 * Adding a new gate: pick a slug, drop a row here with `banner` copy and the
 * `comparisonRowId` that already exists in the comparison table — or add a
 * new row in `Pricing.tsx` with `data-upgrade-id={slug}` and use that.
 *
 * Both the API (`api/src/routes/email-integration.ts`) and the frontend gate
 * helpers can import the slug constants so a typo at the redirect site fails
 * the typecheck instead of silently landing on a slug-less Pricing page.
 */

import { INBOX_SYNC_INCLUDED_ACCOUNTS, INBOX_SYNC_EXTRA_ACCOUNT_PRICE } from "./pricing.js";

export const UPGRADE_SLUGS = [
  "inbox-sync",
  "inbox-extra",
  "voice-clone",
  "brand-kit",
  "smart-notifications",
  "ai-tokens",
  "team-seats",
  "enterprise",
] as const;
export type UpgradeSlug = (typeof UPGRADE_SLUGS)[number];

export interface UpgradeRegistryEntry {
  /** Title shown in the acknowledgement banner above the plan cards. */
  title: string;
  /** Body copy under the title — should explain what the gate is and what
   *  the user gets by upgrading. */
  description: string;
  /** `data-upgrade-id` on a comparison-table row. The Pricing page smooth-
   *  scrolls this into view + applies the `data-upgrade-active` style so
   *  the user sees the exact line item that gates the feature. Leave
   *  undefined if no specific row applies (general upsell). */
  comparisonRowId?: string;
}

/** Single source of truth. Keys are the URL slugs; values are the banner
 *  copy + the scroll target. */
export const UPGRADE_REGISTRY: Record<UpgradeSlug, UpgradeRegistryEntry> = {
  "inbox-sync": {
    title: "Inbox Sync is a Pro feature",
    description: `Pro plans include ${INBOX_SYNC_INCLUDED_ACCOUNTS} connected Gmail / Outlook mailboxes — classify every recruiter pitch, ATS reply, interview invite, and offer into your unified inbox.`,
    comparisonRowId: "inbox-sync",
  },
  "inbox-extra": {
    title: "You've connected the included mailboxes",
    description: `Pro plans include ${INBOX_SYNC_INCLUDED_ACCOUNTS} mailboxes. Extra inboxes are $${INBOX_SYNC_EXTRA_ACCOUNT_PRICE}/mo each — add the seat add-on from Settings → Billing to connect more.`,
    comparisonRowId: "inbox-sync",
  },
  "voice-clone": {
    title: "Voice cloning is a Pro feature",
    description:
      "Clone your own voice (or a marketplace voice you've licensed) and use it across video narration, podcast intros, and AI-generated practice interview audio.",
    comparisonRowId: "voice-clone",
  },
  "brand-kit": {
    title: "Brand Kit is a Pro feature",
    description:
      "Apply your logo, colour palette, and font tokens across every video, resume export, and shared landing page so every external surface stays on brand.",
    comparisonRowId: "brand-kit",
  },
  "smart-notifications": {
    title: "AI-ranked notifications are a Pro feature",
    description:
      "Pro plans surface the highest-signal recruiter outreach, interview invites, and matched roles at the top of your notification feed via an LLM ranking pass.",
    comparisonRowId: "smart-notifications",
  },
  "ai-tokens": {
    title: "You've used your free monthly AI tokens",
    description:
      "Pro plans include 1M tokens / month + 24-hour rolling pack purchases. Free accounts get a starter monthly bucket — top up here to keep going.",
    comparisonRowId: "ai-tokens",
  },
  "team-seats": {
    title: "Add team seats to your workspace",
    description:
      "Every additional active member of your workspace is $9.95/mo and gets full Pro features. Add seats from Settings → Billing.",
    comparisonRowId: "team-seats",
  },
  enterprise: {
    title: "Looking for enterprise features?",
    description:
      "SOC 2, SSO, data residency, dedicated CSM, and 99.99% SLAs are available on enterprise contracts. Book a call to scope your rollout.",
    comparisonRowId: undefined,
  },
};

/** Type-safe URL builder so redirect sites don't typo the slug. Returns the
 *  Pricing route with the `?upgrade=` query already appended. */
export function pricingUpgradeUrl(slug: UpgradeSlug): string {
  return `/pricing?upgrade=${slug}`;
}

/** Read a slug from a raw query string. Returns null when the value isn't
 *  a recognised slug, so the Pricing page can short-circuit the banner. */
export function parseUpgradeSlug(raw: string | null | undefined): UpgradeSlug | null {
  if (!raw) return null;
  return (UPGRADE_SLUGS as readonly string[]).includes(raw) ? (raw as UpgradeSlug) : null;
}
