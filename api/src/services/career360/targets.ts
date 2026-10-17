/** Career 360 target lifecycle — suggest candidates, select (plan), clear. */

import { createLLMClient } from "../adapters/llm-client.js";
import {
  SuggestTargetsResponseSchema,
  type CareerTargetDoc,
  type RoadmapStep,
  type SelectedTarget,
  type SelectTargetRequest,
  type TargetSuggestion,
} from "../../../../shared/career360-types.js";
import type { JwtPayload } from "../../types/index.js";
import type { LLMEnv } from "../adapters/llm-client.js";
import { Career360PlanIngest } from "./plan-schema.js";
import { PLAN_SYSTEM_PROMPT, SUGGEST_SYSTEM_PROMPT } from "./prompts.js";
import { loadSeekerSnapshot, snapshotForPrompt } from "./seeker-snapshot.js";
import { loadDoc, persistDoc } from "./doc-store.js";

/** Generate 3 candidate targets from the seeker's profile + resume +
 *  skills, persist them on the document so the picker stays warm
 *  across reloads, and return the suggestions. */
export async function suggestTargets(args: {
  userId: string;
  env: LLMEnv | undefined;
  user: JwtPayload | null | undefined;
}): Promise<TargetSuggestion[]> {
  const snapshot = await loadSeekerSnapshot(args.userId);

  const client = createLLMClient(args.env, args.user);
  const result = await client.callJson(
    "career_360_suggest",
    {
      useCase: "career_360",
      systemPrompt: SUGGEST_SYSTEM_PROMPT,
      userMessage: snapshotForPrompt(snapshot),
    },
    SuggestTargetsResponseSchema,
  );

  // Stamp ids deterministically so the picker can key off them. The
  // LLM sometimes returns the same `id` it saw last call — overwrite.
  const suggestions = result.data.suggestions.map((s, i) => ({
    ...s,
    id: `sug_${Date.now().toString(36)}_${i}`,
  }));

  const existing = (await loadDoc(args.userId)) ?? {};
  const next: CareerTargetDoc = {
    ...existing,
    suggested: suggestions,
    suggestedAt: new Date().toISOString(),
  };
  await persistDoc(args.userId, next);

  return suggestions;
}

/** Lock in a target — either by id from the cached suggestion list, or
 *  free-form custom — run the gap-analysis LLM call, persist the full
 *  plan document, and return it. */
export async function selectTarget(args: {
  userId: string;
  env: LLMEnv | undefined;
  user: JwtPayload | null | undefined;
  request: SelectTargetRequest;
}): Promise<SelectedTarget> {
  const { userId, env, user, request } = args;

  const existing = (await loadDoc(userId)) ?? {};

  let baseTarget: {
    id: string;
    title: string;
    seniority?: string;
    description: string;
    why: string;
    timelineMonths: number;
  };

  if (request.fromSuggestionId) {
    const fromList = (existing.suggested ?? []).find(
      (s) => s.id === request.fromSuggestionId,
    );
    if (!fromList) {
      throw new Error("SUGGESTION_NOT_FOUND");
    }
    baseTarget = fromList;
  } else if (request.custom) {
    baseTarget = {
      id: `custom_${Date.now().toString(36)}`,
      title: request.custom.title,
      seniority: request.custom.seniority,
      description: request.custom.description ?? request.custom.title,
      why: "Self-selected by the user.",
      timelineMonths: request.custom.timelineMonths ?? 12,
    };
  } else {
    throw new Error("INVALID_REQUEST");
  }

  const snapshot = await loadSeekerSnapshot(userId);
  const client = createLLMClient(env, user);
  const planMessage = `${snapshotForPrompt(snapshot)}

Target: ${baseTarget.title}${baseTarget.seniority ? ` (${baseTarget.seniority})` : ""}
Description: ${baseTarget.description}
Timeline: ${baseTarget.timelineMonths} months

Build the plan.`;

  // Lenient ingest: gateway gets a strict `json_schema` derived from
  // `LenientPlanResponseSchema` so capable providers do vendor-side
  // conformance retry; horizon drift on free-tier models is coerced
  // onto the legal bucket inside `Career360PlanIngest.coerce` before
  // we ever see it. See gaps #532–#534.
  const result = await client.callJsonLenient(
    "career_360_plan",
    {
      useCase: "career_360",
      systemPrompt: PLAN_SYSTEM_PROMPT,
      userMessage: planMessage,
    },
    Career360PlanIngest,
  );

  // Stamp ids deterministically so the frontend can key gaps without
  // worrying about LLM-returned id collisions across runs.
  const stamp = Date.now().toString(36);
  const gaps = result.data.gaps.map((g, i) => ({ ...g, id: `gap_${stamp}_${i}` }));
  const roadmap: RoadmapStep[] = result.data.roadmap.map((step, i) => {
    const remappedCloses = step.closesGapIds
      .map((rawId) => {
        // The LLM tends to reuse the gap ids from its own output; normalize
        // by index when possible so links survive our id rewrite above.
        const numeric = Number.parseInt(rawId.replace(/[^0-9]/g, ""), 10);
        if (Number.isFinite(numeric) && numeric >= 0 && numeric < gaps.length) {
          return gaps[numeric].id;
        }
        return null;
      })
      .filter((id): id is string => !!id);
    return {
      ...step,
      id: `step_${stamp}_${i}`,
      closesGapIds: remappedCloses,
    };
  });

  const selected: SelectedTarget = {
    id: baseTarget.id,
    title: baseTarget.title,
    seniority: baseTarget.seniority,
    description: baseTarget.description,
    why: baseTarget.why,
    timelineMonths: baseTarget.timelineMonths,
    chosenAt: existing.selected?.chosenAt ?? new Date().toISOString(),
    rubric: result.data.rubric,
    gaps,
    roadmap,
    lastRefreshedAt: new Date().toISOString(),
    // A fresh plan re-stamps every gap/step id, so prior resolved marks
    // no longer reference anything — start clean.
    resolvedItems: [],
  };

  const next: CareerTargetDoc = {
    ...existing,
    selected,
  };
  await persistDoc(userId, next);

  return selected;
}

export async function clearTarget(userId: string): Promise<void> {
  const existing = (await loadDoc(userId)) ?? {};
  const { selected: _drop, ...rest } = existing;
  await persistDoc(userId, rest);
}
