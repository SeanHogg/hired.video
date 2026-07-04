/**
 * Career360 Service — frontend wrapper for /api/career360.
 *
 * Mirrors the shapes from `shared/career360-types.ts`. Re-validates the
 * response payload through Zod so a malformed server doc surfaces as a
 * ValidationError rather than crashing the page.
 */

import { z } from "zod";
import {
  CareerTargetDocSchema,
  Career360OutcomesSchema,
  EvaluationResultSchema,
  SuggestTargetsResponseSchema,
  TargetSuggestionSchema,
  type EvaluateRequest,
  type EvaluationResult,
  type ResolveItemRequest,
  type SelectedTarget,
  type SelectTargetRequest,
} from "@shared/career360-types";
import { apiClient } from "../api-client";

const ScoreHistorySeriesSchema = z.object({
  toolId: z.string(),
  label: z.string(),
  points: z.array(
    z.object({
      toolId: z.string(),
      recordedAt: z.string(),
      score: z.number(),
    }),
  ),
});

const StateResponseSchema = z.object({
  doc: z.union([CareerTargetDocSchema, z.null()]),
  history: z.array(ScoreHistorySeriesSchema),
  // Inner-ring funnel outcomes (#421). Defaulted so a payload from an
  // older API build (pre-outcomes) still validates as "no signal yet".
  outcomes: Career360OutcomesSchema.default([]),
});

// Inferred shape matches Zod's union output: `doc` may be undefined
// when older clients send a partial payload, so the page treats null
// and undefined as the same "no target yet" state.
export type Career360State = z.infer<typeof StateResponseSchema>;

const SuggestResponseSchema = SuggestTargetsResponseSchema;

const SelectResponseSchema = z.object({
  selected: z.lazy(() => CareerTargetDocSchema.shape.selected.unwrap()),
});

const EvaluateResponseSchema = z.object({
  evaluation: EvaluationResultSchema,
});

const ResolveResponseSchema = z.object({
  selected: z.lazy(() => CareerTargetDocSchema.shape.selected.unwrap()),
});

export class Career360Service {
  async getState(): Promise<Career360State> {
    const res = await apiClient.get<Career360State>(
      "/api/career360",
      StateResponseSchema,
    );
    return res.data;
  }

  async suggest(): Promise<z.infer<typeof TargetSuggestionSchema>[]> {
    const res = await apiClient.post(
      "/api/career360/suggest",
      {},
      SuggestResponseSchema,
    );
    return res.data.suggestions;
  }

  async select(request: SelectTargetRequest): Promise<SelectedTarget> {
    const res = await apiClient.post(
      "/api/career360/select",
      request,
      SelectResponseSchema,
    );
    return res.data.selected;
  }

  async clear(): Promise<void> {
    await apiClient.delete("/api/career360/target");
  }

  /** Re-score a single gap or roadmap step against the seeker's current
   *  full profile. Returns a verdict + explanation so the row can show
   *  whether the LLM still thinks the item is open. Read-only — the
   *  saved Career 360 plan isn't mutated. */
  async evaluate(request: EvaluateRequest): Promise<EvaluationResult> {
    const res = await apiClient.post(
      "/api/career360/evaluate",
      request,
      EvaluateResponseSchema,
    );
    return res.data.evaluation;
  }

  /** Mark a gap or roadmap step done (or reopen it). Persists onto the
   *  saved plan and returns the updated target so the caller can render
   *  immediately. */
  async resolve(request: ResolveItemRequest): Promise<SelectedTarget> {
    const res = await apiClient.post(
      "/api/career360/resolve",
      request,
      ResolveResponseSchema,
    );
    return res.data.selected;
  }
}

export const career360Service = new Career360Service();
