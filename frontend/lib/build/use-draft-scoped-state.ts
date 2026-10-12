/**
 * State that belongs to the draft on screen — the chat, the AI Tool runs, the
 * plan's checkmarks, the open stage, dismissed findings. A new draft (a new
 * parse, another résumé, Start over) starts it over; a reload brings it back.
 *
 * Remembered per saved résumé in this browser (`hv:build:session:v1:<id>:<slice>`),
 * so reopening `/studio/<projectId>` picks up where the visitor left off. A
 * draft with no saved row yet is kept in memory only, and is written the
 * moment it gets one. Not résumé content: it never enters Undo or autosave.
 *
 * `empty`, `revive` and `persist` must be stable (module-level).
 */
import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";

const PREFIX = "hv:build:session:v1";

interface Options<T> {
  /** A new draft (new identity) starts the state over. */
  draftKey: unknown;
  /** The saved résumé the state is remembered under; null = not yet. */
  resumeId: string | null;
  /** Which piece of the session this is, e.g. "runs". */
  slice: string;
  empty: T;
  /** Check what storage gave back; null ignores it. */
  revive: (stored: unknown) => T | null;
  /** What is kept between visits (drop in-flight entries, cap the size). */
  persist?: (value: T) => T;
}

const keyOf = (resumeId: string, slice: string) => `${PREFIX}:${resumeId}:${slice}`;

function load<T>(resumeId: string | null, slice: string, revive: (stored: unknown) => T | null): T | null {
  if (!resumeId) return null;
  try {
    const raw = localStorage.getItem(keyOf(resumeId, slice));
    return raw ? revive(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function store(resumeId: string, slice: string, value: unknown): void {
  try {
    localStorage.setItem(keyOf(resumeId, slice), JSON.stringify(value));
  } catch {
    // Private mode / quota — the session simply isn't remembered.
  }
}

/**
 * A review saved the open résumé as a NEW résumé (a version of the master):
 * the session — chat, runs, plan checks, stage, dismissed findings — moves
 * with it, so opening the new one does not start the steps over.
 */
export function carryDraftSession(fromResumeId: string, toResumeId: string): void {
  if (fromResumeId === toResumeId) return;
  try {
    const from = `${PREFIX}:${fromResumeId}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(from)) continue;
      const raw = localStorage.getItem(key);
      if (raw !== null) localStorage.setItem(keyOf(toResumeId, key.slice(from.length)), raw);
    }
  } catch {
    // Private mode / quota — the new résumé starts its own session.
  }
}

interface Held<T> {
  /** The résumé this value belongs to (null: an unsaved draft). */
  owner: string | null;
  value: T;
}

export function useDraftScopedState<T>({ draftKey, resumeId, slice, empty, revive, persist }: Options<T>) {
  const [held, setHeld] = useState<Held<T>>(() => ({ owner: resumeId, value: load(resumeId, slice, revive) ?? empty }));
  // Lets async work notice that the draft it started on was replaced.
  const draftRef = useRef(draftKey);

  useEffect(() => {
    const restore = (): Held<T> => ({ owner: resumeId, value: load(resumeId, slice, revive) ?? empty });
    if (draftRef.current !== draftKey) {
      draftRef.current = draftKey;
      setHeld(restore());
      return;
    }
    // Same draft, its id arrived. A new draft that has done something keeps
    // it under that id; one that hasn't (an opened résumé whose id catches
    // up a render later — /studio/:id) loads what that résumé already has,
    // never writes its empty state over it. Another résumé id: load that one.
    setHeld((h) =>
      h.owner === resumeId ? h : h.owner === null && h.value !== empty ? { owner: resumeId, value: h.value } : restore(),
    );
  }, [draftKey, resumeId, slice, revive, empty]);

  useEffect(() => {
    // Only ever write a value under the résumé it belongs to.
    if (!held.owner || held.owner !== resumeId) return;
    store(held.owner, slice, persist ? persist(held.value) : held.value);
  }, [held, resumeId, slice, persist]);

  const set = useCallback((update: SetStateAction<T>) => {
    setHeld((h) => ({
      owner: h.owner,
      value: typeof update === "function" ? (update as (prev: T) => T)(h.value) : update,
    }));
  }, []);

  return { value: held.value, set, draftRef };
}
