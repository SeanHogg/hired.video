/** Career 360 per-item re-evaluation (read-only LLM verdict) + resolved toggling. */

import { createLLMClient } from "../adapters/llm-client.js";
import {
  EvaluationResultSchema,
  type EvaluateRequest,
  type EvaluationResult,
  type ResolveItemRequest,
  type ResolvedItem,
  type SelectedTarget,
} from "../../../../shared/career360-types.js";
import type { JwtPayload } from "../../types/index.js";
import type { LLMEnv } from "../adapters/llm-client.js";
import {
  EVALUATE_SYSTEM_PROMPT,
  buildGapEvaluationPrompt,
  buildStepEvaluationPrompt,
} from "./prompts.js";
import { loadSeekerSnapshot, snapshotForPrompt } from "./seeker-snapshot.js";
import { loadDoc, persistDoc } from "./doc-store.js";

/** Re-score a single gap or roadmap step against the seeker's CURRENT
 *  full snapshot (including the master resume's certs / education /
 *  work). Returns a plain verdict the UI renders inline beneath the
 *  row so the seeker can confirm the LLM didn't miss something they
 *  already have. Doesn't mutate the saved doc — re-evaluation is
 *  read-only; the seeker decides whether to act on it. */
export async function evaluateItem(args: {
  userId: string;
  env: LLMEnv | undefined;
  user: JwtPayload | null | undefined;
  request: EvaluateRequest;
}): Promise<EvaluationResult> {
  const { userId, env, user, request } = args;
  const doc = await loadDoc(userId);
  const selected = doc?.selected;
  if (!selected) {
    throw new Error("NO_TARGET");
  }

  const item = resolveEvaluationItem(selected, request);
  const snapshot = await loadSeekerSnapshot(userId);
  const client = createLLMClient(env, user);

  const userMessage = `${snapshotForPrompt(snapshot)}

Active Career 360 target: ${selected.title}${selected.seniority ? ` (${selected.seniority})` : ""} on a ${selected.timelineMonths}-month horizon.

${item.prompt}`;

  const result = await client.callJson(
    "career_360_evaluate",
    {
      useCase: "career_360",
      systemPrompt: EVALUATE_SYSTEM_PROMPT,
      userMessage,
    },
    EvaluationResultSchema,
  );

  return result.data;
}

/** Toggle a single gap/step's resolved state and persist it onto the
 *  saved plan. Unlike `evaluateItem` (read-only), this mutates the doc so
 *  the seeker can permanently retire an item a re-evaluation showed is no
 *  longer a real gap. Returns the updated target so the client can render
 *  without a second round-trip. */
export async function setItemResolved(args: {
  userId: string;
  request: ResolveItemRequest;
}): Promise<SelectedTarget> {
  const { userId, request } = args;
  const doc = await loadDoc(userId);
  const selected = doc?.selected;
  if (!selected) {
    throw new Error("NO_TARGET");
  }

  // Validate the item still exists in the current plan so a stale client
  // can't resolve a phantom id.
  const exists =
    request.kind === "gap"
      ? selected.gaps.some((g) => g.id === request.itemId)
      : selected.roadmap.some((s) => s.id === request.itemId);
  if (!exists) {
    throw new Error("ITEM_NOT_FOUND");
  }

  const others = (selected.resolvedItems ?? []).filter(
    (r) => !(r.kind === request.kind && r.itemId === request.itemId),
  );
  const nextResolved: ResolvedItem[] = request.resolved
    ? [
        ...others,
        {
          itemId: request.itemId,
          kind: request.kind,
          verdict: request.verdict,
          resolvedAt: new Date().toISOString(),
        },
      ]
    : others;

  const nextSelected: SelectedTarget = { ...selected, resolvedItems: nextResolved };
  await persistDoc(userId, { ...doc, selected: nextSelected });
  return nextSelected;
}

function resolveEvaluationItem(
  selected: SelectedTarget,
  request: EvaluateRequest,
): { kind: "gap" | "step"; prompt: string } {
  if ("gapId" in request) {
    const gap = selected.gaps.find((g) => g.id === request.gapId);
    if (!gap) throw new Error("ITEM_NOT_FOUND");
    return { kind: "gap", prompt: buildGapEvaluationPrompt(gap) };
  }
  const step = selected.roadmap.find((s) => s.id === request.roadmapStepId);
  if (!step) throw new Error("ITEM_NOT_FOUND");
  return { kind: "step", prompt: buildStepEvaluationPrompt(step) };
}
