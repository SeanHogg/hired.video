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
  SuggestTargetsResponseSchema,
  TargetSuggestionSchema,
  type CareerTargetDoc,
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
}

export const career360Service = new Career360Service();
