/**
 * Interactive Comic state spec (#929 stub) — branching-panel runtime
 * built on top of the existing comic-state shape.
 *
 * RUNTIME TRACK: `mediaKind: "interactive_comic"` (not yet registered
 * in `MEDIA_KINDS` — registration ships when the runtime is wired so
 * we don't surface a broken kind in the picker. This file defines the
 * state shape so the AI scaffolder + future authoring UI can compile
 * against it without churn).
 *
 * SCOPE: choose-your-own-adventure comics. Each page can carry one or
 * more "choice gates" — at the end of a page the reader picks among
 * branches; each branch points to a next page id. Linear comics (the
 * existing `mediaKind: "comic"`) are a special case where every page
 * has exactly one branch pointing to `pageNumber + 1`.
 *
 * STATE SHAPE: extends `ComicSpec` (the comic Phase 1 state) with an
 * optional `branches` array per page + a `startPageId`. Readers that
 * encounter `branches.length > 1` render a choice UI; readers that
 * encounter no branches stop at end-of-story.
 *
 * Persistence: when the kind registers, it lands in
 * `studio_projects.comic_state` (the existing column — interactive
 * comics ARE comics, just with the branch fields populated).
 *
 * Pairs with: #938 + #939 (comic Phase 1 + 2 — the linear MVP).
 */

export const INTERACTIVE_COMIC_SCHEMA_VERSION = 1;

/** A choice the reader can make at the end of a page. */
export interface ChoiceBranch {
  /** Stable id — referenced by the reader's per-user progress state. */
  id: string;
  /** Button label the reader sees ("Take the deal" / "Walk away"). */
  label: string;
  /** Target page id this branch routes to. When the target id is
   *  missing from `pages` the reader falls through to end-of-story. */
  targetPageId: string;
  /** Optional condition: requires `flagsRequired` to all be set on
   *  the reader's state, AND `flagsForbidden` to all be unset.
   *  Powers locked branches that open only after earlier choices. */
  flagsRequired?: string[];
  flagsForbidden?: string[];
  /** When set, choosing this branch also sets these flags on the
   *  reader's state. Lets a branch grant a key / persona / trait. */
  flagsToSet?: string[];
}

/** A single page in the interactive comic. Layout + assets ride the
 *  existing ComicSpecPage shape — this interface only adds branching. */
export interface InteractiveComicPage {
  /** Stable id — branches target by id, not by page number, so
   *  page reordering doesn't break the graph. */
  id: string;
  /** Display-order index — drives the page picker in the editor. */
  pageNumber: number;
  /** When unspecified, the reader gets a single "Continue" button
   *  routing to the next page by `pageNumber`. */
  branches?: ChoiceBranch[];
  /** Free-form delegation back to the underlying ComicSpecPage shape
   *  (caption / protagonistLine / visualBrief / assets etc.) — the
   *  field is `unknown` here because importing ComicSpecPage would
   *  create a circular dep with `shared/comic-spec.ts`. Readers cast
   *  to `ComicSpecPage` after loading. */
  spec: unknown;
}

export interface InteractiveComicState {
  schemaVersion: number;
  /** Title — surfaced as the document title in the reader. */
  title: string;
  /** Which page the reader starts on. Defaults to the first page in
   *  `pages` when omitted. */
  startPageId: string;
  /** All pages in the comic. Ordering controls the "next page by
   *  index" fallback for branchless pages. */
  pages: InteractiveComicPage[];
}

/** Build a blank interactive comic state. Used by the editor's
 *  "Start interactive comic" template seed when the kind ships. */
export function createBlankInteractiveComicState(): InteractiveComicState {
  const firstPage: InteractiveComicPage = {
    id: `page-${Math.random().toString(36).slice(2, 10)}`,
    pageNumber: 1,
    spec: null,
  };
  return {
    schemaVersion: INTERACTIVE_COMIC_SCHEMA_VERSION,
    title: "Untitled",
    startPageId: firstPage.id,
    pages: [firstPage],
  };
}
