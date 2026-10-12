// Pure snapshot mutations for the recruiter kanban. Extracted out of
// JobPipelineKanban so the optimistic-update logic is testable in isolation
// and reusable from any other surface that holds a PipelineSnapshot.

import type {
  PipelineEntry,
  PipelineSnapshot,
  PipelineStage,
} from "@/lib/services/job-pipeline-service";

/** Move an entry to a target stage. Returns the original snapshot if the
 *  entry isn't found (so callers can no-op on stale IDs). */
export function moveEntry(
  snap: PipelineSnapshot,
  entryId: string,
  target: PipelineStage,
): PipelineSnapshot {
  let moved: PipelineEntry | null = null;
  const stages = snap.stages.map((g) => {
    const idx = g.entries.findIndex((e) => e.id === entryId);
    if (idx === -1) return g;
    moved = { ...g.entries[idx], stage: target, stageChangedAt: new Date().toISOString() };
    const entries = [...g.entries.slice(0, idx), ...g.entries.slice(idx + 1)];
    return { ...g, entries, count: entries.length };
  });
  if (!moved) return snap;
  const next = stages.map((g) =>
    g.stage === target
      ? { ...g, entries: [moved as PipelineEntry, ...g.entries], count: g.entries.length + 1 }
      : g,
  );
  return { ...snap, stages: next };
}

/** Drop an entry from the snapshot; total decrements only if found. */
export function removeEntry(snap: PipelineSnapshot, entryId: string): PipelineSnapshot {
  let removed = false;
  const stages = snap.stages.map((g) => {
    const idx = g.entries.findIndex((e) => e.id === entryId);
    if (idx === -1) return g;
    removed = true;
    const entries = [...g.entries.slice(0, idx), ...g.entries.slice(idx + 1)];
    return { ...g, entries, count: entries.length };
  });
  return removed ? { ...snap, stages, total: snap.total - 1 } : snap;
}

/** Insert a new entry into its stage column at the head. */
export function insertEntry(snap: PipelineSnapshot, entry: PipelineEntry): PipelineSnapshot {
  const stages = snap.stages.map((g) =>
    g.stage === entry.stage
      ? { ...g, entries: [entry, ...g.entries], count: g.entries.length + 1 }
      : g,
  );
  return { ...snap, stages, total: snap.total + 1 };
}

/** Find which stage currently owns an entry (returns null if absent). */
export function findEntryStage(
  snap: PipelineSnapshot,
  entryId: string,
): PipelineStage | null {
  const group = snap.stages.find((g) => g.entries.some((e) => e.id === entryId));
  return group ? group.stage : null;
}
