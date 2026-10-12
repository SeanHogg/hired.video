/**
 * Linked content types — the kind union, the palette / canvas summary
 * shape, and the per-kind meta contract every entry in
 * `LINKED_CONTENT_REGISTRY` (see `./index.ts`) satisfies.
 */
import type { ComponentType } from "react";

/** Entity kinds that can be embedded as a card on the v2 canvas.
 *  Adding a new kind = one entry in `LINKED_CONTENT_REGISTRY` + one
 *  body in `components/studio/v2/inline-bodies/registry.ts` — no other
 *  file needs a switch update. */
export type LinkedContentKind =
  | "resume"
  | "job"
  | "article"
  | "profile"
  | "company"
  | "video";

/** Tile metadata for the palette section (one row per item the current
 *  user owns). Fetched from `LinkedContentMeta.listForUser` and rendered
 *  with the same `LeftPanelTile` the static widget catalog uses. The
 *  same shape is also returned from `fetchSummary(id)` and consumed by
 *  the canvas-v2:linked-content applier — the optional `body` /
 *  `badges` fields are read by the canvas drawer to paint richer
 *  content (bullet lines, skill / tag chips) when present. Palette
 *  tiles ignore them. */
export interface LinkedContentSummary {
  kind: LinkedContentKind;
  id: string;
  title: string;
  /** Secondary line (e.g. "Active · Master") — optional, rendered as a
   *  hint / tooltip when present. */
  subtitle?: string;
  /** Body lines drawn beneath the subtitle in the canvas applier.
   *  Each line wraps independently — kinds should pre-bullet (e.g.
   *  prefix with `"• "`) where appropriate. Palette tiles ignore. */
  body?: string[];
  /** Pill chips drawn at the bottom of the canvas card (skills /
   *  tags / categories). Palette tiles ignore. */
  badges?: string[];
}

/** Per-kind metadata. The DOM body that renders the entity inside the
 *  canvas widget is NOT here (lib/ never imports components/) — it lives
 *  in `components/studio/v2/inline-bodies/registry.ts`
 *  (`LINKED_CONTENT_BODIES`), keyed by the same `LinkedContentKind`. */
export interface LinkedContentMeta {
  /** Singular display label ("Resume", "Job"). */
  label: string;
  /** Palette section heading ("Your resumes", "Your jobs"). */
  sectionLabel: string;
  /** Lucide icon used in the palette tile + empty-state body. */
  icon: ComponentType<{ className?: string }>;
  /** Destination opened by the canvas widget's CTA: the entity's PUBLIC
   *  page an anonymous viewer can open (a `shared/public-paths` builder),
   *  never an owner / editor route. The watch page links it and an export
   *  prints it as text + QR (#2312). */
  viewUrl: (id: string) => string;
  /** CTA button label rendered on the preview card. */
  ctaLabel: string;
  /** List the current user's owned items for the palette section.
   *  Errors are swallowed by the caller — the section just renders the
   *  empty state. */
  listForUser: () => Promise<LinkedContentSummary[]>;
  /** Fetch a single entity's render-friendly summary by id. Used by
   *  the canvas-v2 render pipeline's preload pass so the synchronous
   *  applier can draw a card without bringing the entity's full DOM
   *  renderer into the export path. Errors resolve to `null` so a
   *  broken / private id renders an empty card instead of crashing. */
  fetchSummary: (id: string) => Promise<LinkedContentSummary | null>;
}
