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
  EvaluationResultSchema,
  SuggestTargetsResponseSchema,
  TargetSuggestionSchema,
  type CareerTargetDoc,
  type EvaluateRequest,
  type EvaluationResult,
  type SelectedTarget,
  type SelectTargetRequest,
  type ScoreHistorySeries,
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
}

export const career360Service = new Career360Service();
