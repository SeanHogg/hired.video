/**
 * Vendor Sync — connector interface.
 *
 * A `VendorConnector` is the contract the rest of the sync pipeline talks
 * to. Each vendor (LinkedIn, Indeed, GitHub, ...) ships a small config
 * implementing this shape and registers it in `./index.ts`.
 *
 * The two ends of the sync are intentionally asymmetric:
 *
 *   import (vendor → hired.video):
 *     `extractFromHtml` is shared across vendors (one LLM pipeline keyed on
 *     a JSON Resume schema). Connectors only declare whether they support
 *     extension-driven extraction at all (`supportsExtensionExtract`) — the
 *     selectors live in the extension's `shared/profile-parsers.js`.
 *
 *   export (hired.video → vendor):
 *     `renderExportBlocks` produces vendor-shaped paste-ready text from a
 *     JSON Resume. The default renderer in `./default-blocks.ts` covers
 *     ~80% of vendors verbatim; LinkedIn/GitHub override only the bits
 *     that need platform-specific shaping.
 *
 * Why a thin per-vendor file instead of one big switch:
 * `renderExportBlocks` per LinkedIn is genuinely different from GitHub
 * (paragraph-style about vs README markdown), and that branching either
 * lives at the call site (DRY violation: every consumer reasons about
 * vendor) or inside the registry entry (this design). Putting the rule
 * with the registry entry is the one place it earns its keep.
 */

import type { ResumeContent } from "../../../../../shared/resume.js";

/** Surfaces the connector groups itself under in the tool-page UI. */
export type VendorCategory =
  | "professional"   // LinkedIn
  | "job-board"      // Indeed, Glassdoor, ZipRecruiter, Monster, Dice
  | "startup"        // Wellfound (formerly AngelList)
  | "developer"      // GitHub
  | "portfolio";     // Personal site

/** Single paste-ready chunk rendered from the user's JSON Resume,
 *  scoped to a section the vendor exposes (About, Experience, ...). The
 *  tool-page UI renders one card per block with a "Copy" button and a
 *  character-count vs `charLimit` indicator. */
export interface ExportBlock {
  /** Vendor-relative section label, e.g. "About", "Headline", "Experience". */
  section: string;
  /** Optional sub-heading for multi-entry sections — e.g. each work entry
   *  becomes a block with `subSection` = "Acme Corp · Senior Engineer". */
  subSection?: string;
  /** Ready-to-paste text. */
  text: string;
  /** Plain text vs markdown — drives whether the card shows a "Render" toggle. */
  format?: "plain" | "markdown";
  /** Platform constraint (LinkedIn headline = 220, About = 2600, etc.).
   *  Card surfaces a red counter when text length exceeds it. */
  charLimit?: number;
  /** Per-block destination override. When set, the block's card opens
   *  this URL instead of the connector-level `editProfileUrl` — needed
   *  when a single connector's blocks belong to multiple destinations
   *  (e.g. GitHub Bio → /settings/profile; GitHub README → the special
   *  `<user>/<user>` repo, not settings). */
  openTargetUrl?: string;
  /** Raw CSS selector inside the vendor's profile-edit modal that this
   *  block's text should be typed into. When set, the block surfaces
   *  an "Auto-fill" button that asks the extension to write `text`
   *  into the matching element on the vendor tab. Single-field at a
   *  time, user-initiated — the user opens the edit modal first; we
   *  never auto-open modals or auto-save. */
  autofillSelector?: string;
}

export interface VendorConnector {
  /** Stable id — used in URLs (`/api/vendor-sync/:id/...`), audit log,
   *  and the extension's parser dispatch. Lowercase kebab. */
  id: string;
  /** Human-facing name on the tool-page card. */
  label: string;
  /** Lucide icon name (mapped client-side; backend ships the string). */
  iconKey: string;
  category: VendorCategory;
  /** One-line marketing copy for the card. */
  description: string;
  /** Where to send the user to edit their profile when they take the
   *  manual route. May read user fields (e.g. external handle) — kept as
   *  a plain string for v1; promote to `(user) => string` only when an
   *  vendor needs it. */
  editProfileUrl: string;

  /** True iff the extension's content scripts can scrape this vendor's
   *  profile pages today. Drives the "Sync from extension" CTA on the
   *  card — the card returns null on that CTA when false (no prop-drilled
   *  capability flag). */
  supportsExtensionExtract: boolean;
  /** True iff the extension can DOM-fill fields back to this vendor's
   *  profile editor. Drives the "Push update via extension" CTA. v1
   *  ships this false everywhere — the autofill flow lands in a follow-up
   *  PR. Logged in the gap register. */
  supportsExtensionWrite: boolean;

  /** Render the user's JSON Resume into vendor-shaped paste blocks. */
  renderExportBlocks(content: ResumeContent): ExportBlock[];
}
