/**
 * Challenge runtime — pure data + reducer for tracking play-mode
 * progress against the `World3DState.challenges[]` definitions (gap
 * #1635, Phase 2 of the 3D world build).
 *
 * Frame-by-frame the host (`<GameStage3D>`) feeds entity-trigger events
 * here ("player overlapped collectible coin-3") and timer ticks; this
 * module returns the new progress + a list of just-completed challenge
 * ids so the HUD can flash a "+50 points" toast + the API can post a
 * gamification ledger entry.
 *
 * No React, no DOM — kept pure so:
 *   - the HUD reads + the API client reads from the same state
 *   - the AI agent's Phase-5 simulator can drive the tracker in tests
 *   - future replay-from-recording uses the same reducer
 */

import type {
  World3DChallenge,
  World3DChallengeKind,
  World3DEntityKind,
} from "@shared/game-state";

/** Trigger event emitted by sensor-physics entities when the player
 *  overlaps them (gap #1635 challenge runtime). The shape is the union
 *  of fields any challenge handler needs — `kind` for "collect coin vs
 *  reach goal", `tag` for "challenge X targets coins tagged Y". */
export interface EntityTriggerEvent {
  entityId: string;
  kind: World3DEntityKind;
  tag: string | null;
}

// ─── State + events ────────────────────────────────────────────────────

export interface ChallengeProgress {
  challengeId: string;
  /** Mirrors the parent challenge's `kind` so consumers don't need a
   *  separate lookup to render the right HUD chrome. */
  kind: World3DChallengeKind;
  /** Numerator + denominator. For `collect`: count-of-collected /
   *  count-required. For `reach`: 0/1 → 1/1 on overlap. For `timer`:
   *  ms-remaining / ms-budget. For `score`: score-so-far / target. */
  current: number;
  target: number;
  /** True after `current >= target` is first observed; the reducer
   *  emits the just-completed id on that tick and `completed` stays
   *  true thereafter (challenges don't un-complete in this phase). */
  completed: boolean;
  /** Entity ids already counted — prevents the same coin from being
   *  picked up twice (Rapier may fire onIntersectionEnter more than
   *  once across re-mounts). */
  consumedEntityIds: string[];
}

export interface ChallengeRuntimeState {
  challenges: Record<string, ChallengeProgress>;
  /** Wall-clock ms when the play session started — timer challenges
   *  compute remaining = budget - (now - startedAt). */
  startedAt: number;
}

export type ChallengeEvent =
  | { kind: "trigger"; event: EntityTriggerEvent }
  | { kind: "tick"; nowMs: number }
  | { kind: "score-delta"; delta: number };

export interface ChallengeReducerResult {
  state: ChallengeRuntimeState;
  /** Ids of challenges that transitioned from incomplete → complete
   *  on this event. Empty when nothing completed. Host consumes this
   *  to fire the API + flash the HUD toast (DRY: one completion event
   *  fan-out, not per-challenge-kind). */
  justCompleted: string[];
}

// ─── Initialization ────────────────────────────────────────────────────

/** Build the initial runtime state from the authored challenges. */
export function initChallengeRuntime(
  challenges: World3DChallenge[],
  nowMs: number,
): ChallengeRuntimeState {
  const out: Record<string, ChallengeProgress> = {};
  for (const c of challenges) {
    out[c.id] = {
      challengeId: c.id,
      kind: c.kind,
      current: 0,
      target: deriveTarget(c),
      completed: false,
      consumedEntityIds: [],
    };
  }
  return { challenges: out, startedAt: nowMs };
}

/** Per-kind target derivation. Single seam so HUD + reducer + author
 *  panel agree on "what does `target` mean for this kind". */
function deriveTarget(challenge: World3DChallenge): number {
  switch (challenge.kind) {
    case "collect":
      return numberParam(challenge.params, "count", 1);
    case "reach":
      return 1;
    case "score":
      return numberParam(challenge.params, "target", 100);
    case "timer":
      return numberParam(challenge.params, "budgetMs", 60_000);
  }
}

function numberParam(params: Record<string, unknown>, key: string, fallback: number): number {
  const v = params[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Pull the optional tag filter on a challenge's params (e.g. "collect
 *  only entities tagged coin"). Returns null when the challenge applies
 *  to any entity of the matching kind. */
function challengeTag(challenge: World3DChallenge): string | null {
  const v = challenge.params["tag"];
  return typeof v === "string" && v.length > 0 ? v : null;
}

// ─── Reducer ───────────────────────────────────────────────────────────

export function applyChallengeEvent(
  state: ChallengeRuntimeState,
  challenges: World3DChallenge[],
  event: ChallengeEvent,
): ChallengeReducerResult {
  const next: Record<string, ChallengeProgress> = { ...state.challenges };
  const justCompleted: string[] = [];

  for (const challenge of challenges) {
    const prev = next[challenge.id];
    if (!prev || prev.completed) continue;
    const filterTag = challengeTag(challenge);
    const updated = applyToChallenge(prev, challenge, filterTag, event, state.startedAt);
    if (updated === prev) continue;
    next[challenge.id] = updated;
    if (!prev.completed && updated.completed) {
      justCompleted.push(challenge.id);
    }
  }

  return { state: { ...state, challenges: next }, justCompleted };
}

function applyToChallenge(
  prev: ChallengeProgress,
  challenge: World3DChallenge,
  filterTag: string | null,
  event: ChallengeEvent,
  startedAt: number,
): ChallengeProgress {
  switch (challenge.kind) {
    case "collect":
      return applyCollect(prev, event, filterTag);
    case "reach":
      return applyReach(prev, event, filterTag);
    case "score":
      return applyScore(prev, event);
    case "timer":
      return applyTimer(prev, event, startedAt);
  }
}

function applyCollect(
  prev: ChallengeProgress,
  event: ChallengeEvent,
  filterTag: string | null,
): ChallengeProgress {
  if (event.kind !== "trigger") return prev;
  const e = event.event;
  if (e.kind !== "collectible") return prev;
  if (filterTag !== null && e.tag !== filterTag) return prev;
  if (prev.consumedEntityIds.includes(e.entityId)) return prev;
  const current = prev.current + 1;
  return {
    ...prev,
    current,
    consumedEntityIds: [...prev.consumedEntityIds, e.entityId],
    completed: current >= prev.target,
  };
}

function applyReach(
  prev: ChallengeProgress,
  event: ChallengeEvent,
  filterTag: string | null,
): ChallengeProgress {
  if (event.kind !== "trigger") return prev;
  const e = event.event;
  if (e.kind !== "goal") return prev;
  if (filterTag !== null && e.tag !== filterTag) return prev;
  return { ...prev, current: 1, completed: true };
}

function applyScore(
  prev: ChallengeProgress,
  event: ChallengeEvent,
): ChallengeProgress {
  if (event.kind !== "score-delta") return prev;
  const current = prev.current + event.delta;
  return { ...prev, current, completed: current >= prev.target };
}

function applyTimer(
  prev: ChallengeProgress,
  event: ChallengeEvent,
  startedAt: number,
): ChallengeProgress {
  if (event.kind !== "tick") return prev;
  const elapsed = event.nowMs - startedAt;
  const remaining = Math.max(0, prev.target - elapsed);
  // Timer "completes" at zero remaining — survive-the-clock semantics.
  // A countdown-failure variant lands in Phase 2b (gap register).
  return { ...prev, current: remaining, completed: remaining <= 0 };
}

// ─── HUD helpers ───────────────────────────────────────────────────────

/** Human-readable progress line for the play-mode HUD. */
export function formatProgress(progress: ChallengeProgress): string {
  switch (progress.kind) {
    case "collect":
      return `${progress.current} / ${progress.target}`;
    case "reach":
      return progress.completed ? "Done" : "Get there";
    case "score":
      return `${progress.current} / ${progress.target} pts`;
    case "timer": {
      const sec = Math.ceil(progress.current / 1000);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}:${s.toString().padStart(2, "0")}`;
    }
  }
}
