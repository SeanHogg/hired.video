/**
 * The kit's ONE undo history across its stores (pure parts).
 *
 * A kit edits two things: the résumé content (useContentHistory) and the
 * free elements on its pages (useKitDocumentLayers). Each keeps its own
 * snapshots; a JOURNAL records which store each undo step belongs to, in
 * time order, so the header's Undo / Redo (and ⌘Z) walk both as one
 * history (useKitHistory).
 *
 *   journal     which store made each step (past / future); one step can
 *               span stores (a media drop that also binds the résumé
 *               entry) — `joinStep` — and undoes / redoes as one
 *   snapshots   a store's own stacks, with typing / dragging coalesced into
 *               one step per burst (same group within COALESCE_MS)
 */

/** Bounded like the content history, with room for both stores. */
export const JOURNAL_LIMIT = 100;

/** One undo step: one store, or several changed together (in the order
 *  they were made). */
export type JournalEntry<S extends string> = S | readonly S[];

export interface Journal<S extends string> {
  past: JournalEntry<S>[];
  future: JournalEntry<S>[];
}

/** The stores of a step, in the order they were made. */
export function entrySources<S extends string>(e: JournalEntry<S>): readonly S[] {
  return typeof e === "string" ? [e as S] : e;
}

export function emptyJournal<S extends string>(): Journal<S> {
  return { past: [], future: [] };
}

/** A new step by `source`: it is the next to undo; nothing is left to redo. */
export function recordStep<S extends string>(j: Journal<S>, source: S): Journal<S> {
  return { past: [...j.past, source].slice(-JOURNAL_LIMIT), future: [] };
}

/** `source` changed as part of the LATEST step (not a step of its own):
 *  one Undo reverts both. With no step to join, it is a new step. */
export function joinStep<S extends string>(j: Journal<S>, source: S): Journal<S> {
  const last = j.past[j.past.length - 1];
  if (last === undefined) return recordStep(j, source);
  const sources = entrySources(last);
  const joined = sources.includes(source) ? last : [...sources, source];
  return { past: [...j.past.slice(0, -1), joined], future: [] };
}

function withoutSource<S extends string>(entries: JournalEntry<S>[], source: S): JournalEntry<S>[] {
  const out: JournalEntry<S>[] = [];
  for (const e of entries) {
    const left = entrySources(e).filter((s) => s !== source);
    if (left.length === 1) out.push(left[0]);
    else if (left.length > 1) out.push(left);
  }
  return out;
}

/** `source` let go of its history (a new draft, another project). */
export function forgetSource<S extends string>(j: Journal<S>, source: S): Journal<S> {
  return { past: withoutSource(j.past, source), future: withoutSource(j.future, source) };
}

export interface TakenStep<S extends string> {
  /** The step's last store (a one-store step: its store). */
  source: S;
  /** Every store of the step, in the order to run them (Undo: newest
   *  first; Redo: oldest first). */
  sources: readonly S[];
  next: Journal<S>;
}

/** The step Undo reverts, and the journal after it. */
export function takeUndo<S extends string>(j: Journal<S>): TakenStep<S> | null {
  const entry = j.past[j.past.length - 1];
  if (entry === undefined) return null;
  const sources = [...entrySources(entry)].reverse();
  return { source: sources[0], sources, next: { past: j.past.slice(0, -1), future: [entry, ...j.future] } };
}

export function takeRedo<S extends string>(j: Journal<S>): TakenStep<S> | null {
  const [entry, ...rest] = j.future;
  if (entry === undefined) return null;
  const sources = entrySources(entry);
  return { source: sources[sources.length - 1], sources, next: { past: [...j.past, entry].slice(-JOURNAL_LIMIT), future: rest } };
}

// ── One store's snapshots ─────────────────────────────────────────────────

export interface Snapshots<T> {
  past: T[];
  future: T[];
  last: { group: string; at: number } | null;
}

export function emptySnapshots<T>(): Snapshots<T> {
  return { past: [], future: [], last: null };
}

/** `current` is about to be replaced by an edit in `group` at `at`. A burst
 *  in the same group (within `coalesceMs`) stays ONE step: `newStep` false. */
export function snapshotCommit<T>(
  s: Snapshots<T>,
  current: T,
  group: string,
  at: number,
  coalesceMs: number,
  limit: number,
): { next: Snapshots<T>; newStep: boolean } {
  const coalesce = s.last !== null && s.last.group === group && at - s.last.at < coalesceMs;
  return {
    next: { past: coalesce ? s.past : [...s.past, current].slice(-limit), future: [], last: { group, at } },
    newStep: !coalesce,
  };
}

export function snapshotUndo<T>(s: Snapshots<T>, current: T): { next: Snapshots<T>; value: T } | null {
  const value = s.past[s.past.length - 1];
  if (value === undefined) return null;
  return { value, next: { past: s.past.slice(0, -1), future: [current, ...s.future], last: null } };
}

export function snapshotRedo<T>(s: Snapshots<T>, current: T, limit: number): { next: Snapshots<T>; value: T } | null {
  const [value, ...rest] = s.future;
  if (value === undefined) return null;
  return { value, next: { past: [...s.past, current].slice(-limit), future: rest, last: null } };
}
