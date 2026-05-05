/**
 * Audio-effect registry — parallel to the visual `registry.ts` but the
 * apply contract is "extend a Web Audio graph", not "mutate a canvas".
 *
 * Same DRY rule applies: the audio mixer iterates a track's `effects`
 * array and asks the registry to wire each one into the chain. Adding
 * a new audio effect is one `registerAudioEffect()` call.
 *
 * Two contracts coexist because audio effects compose differently:
 *   • Graph-style effects (EQ, compressor, limiter) hand back the new
 *     output node so the next effect's input connects to it.
 *   • Buffer-style effects (gate) pre-process the decoded AudioBuffer
 *     before the BufferSourceNode is scheduled. The mixer runs all
 *     buffer-stage transforms first, then assembles the graph.
 *
 * Effects can declare BOTH stages (`processBuffer` + `connect`) when an
 * effect needs both — today none do, but the contract is open.
 */

import type { ClipEffect } from "@shared/timeline";
import type { EffectParamHint } from "./registry";

export interface AudioEffectGraphContext {
  ctx: BaseAudioContext;
}

/**
 * Wire an effect into the audio graph after the track gain node. The
 * function MUST connect `input` to its first internal node and return
 * the final node — the mixer connects that to whatever comes next.
 */
export type AudioEffectConnect = (
  effect: ClipEffect,
  input: AudioNode,
  context: AudioEffectGraphContext,
) => AudioNode;

/**
 * Pre-process an AudioBuffer in-place (or replace it). Used by
 * buffer-stage effects (gate) that don't fit a graph-only model. The
 * function returns the buffer to use — usually the same one mutated
 * in place, but a new buffer is allowed when sample-rate / channel
 * changes are needed.
 */
export type AudioEffectProcessBuffer = (
  effect: ClipEffect,
  buffer: AudioBuffer,
  audioCtx: BaseAudioContext,
) => AudioBuffer;

export interface AudioEffectDefinition {
  kind: string;
  label: string;
  category: "audio";
  defaults: Record<string, unknown>;
  paramHints?: Record<string, EffectParamHint>;
  proOnly?: boolean;
  /** Graph-stage wiring. Omit when the effect is buffer-stage only. */
  connect?: AudioEffectConnect;
  /** Buffer-stage pre-processor. Omit when the effect is graph-stage only. */
  processBuffer?: AudioEffectProcessBuffer;
}

const REGISTRY = new Map<string, AudioEffectDefinition>();

export function registerAudioEffect(def: AudioEffectDefinition): void {
  if (REGISTRY.has(def.kind)) {
    throw new Error(`Audio effect kind '${def.kind}' is already registered`);
  }
  REGISTRY.set(def.kind, def);
}

export function getAudioEffectDefinition(kind: string): AudioEffectDefinition | null {
  return REGISTRY.get(kind) ?? null;
}

/** All registered audio effects, sorted by label for stable picker order. */
export function listAudioEffects(): AudioEffectDefinition[] {
  return Array.from(REGISTRY.values()).sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Apply every buffer-stage audio effect on a track's effect list to
 * the supplied buffer. Order matches the user's stack. Effects with
 * no `processBuffer` hook are skipped here (they'll run in the graph
 * stage instead). Single dispatch point — the mixer never branches on
 * effect kind.
 */
export function processAudioBuffer(
  effects: ClipEffect[] | undefined,
  buffer: AudioBuffer,
  audioCtx: BaseAudioContext,
): AudioBuffer {
  if (!effects || effects.length === 0) return buffer;
  let current = buffer;
  for (const eff of effects) {
    const def = REGISTRY.get(eff.kind);
    if (!def?.processBuffer) continue;
    current = def.processBuffer(eff, current, audioCtx);
  }
  return current;
}

/**
 * Build the graph chain for a track's effects, attaching it to the
 * supplied input node. Returns the final output node. Effects with no
 * `connect` hook are skipped (they ran in the buffer stage). When no
 * graph-stage effect is registered, returns the input unchanged.
 */
export function connectAudioEffectChain(
  effects: ClipEffect[] | undefined,
  input: AudioNode,
  audioCtx: BaseAudioContext,
): AudioNode {
  if (!effects || effects.length === 0) return input;
  let node: AudioNode = input;
  const ctx: AudioEffectGraphContext = { ctx: audioCtx };
  for (const eff of effects) {
    const def = REGISTRY.get(eff.kind);
    if (!def?.connect) continue;
    node = def.connect(eff, node, ctx);
  }
  return node;
}

/** Reset the registry — exported for tests; production never calls this. */
export function _resetAudioRegistryForTests(): void {
  REGISTRY.clear();
}
