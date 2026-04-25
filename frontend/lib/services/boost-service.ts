/**
 * Polymorphic Boost Service
 *
 * Wraps /api/boosts. Any user-generated subject (review, feed_post,
 * video, resume, voice_clone, …) can be promoted by its owner via
 * `boostService.create({ subjectType, subjectId, ... })`.
 *
 * Stripe payment-intent integration is deferred (matches the
 * existing job_boosts / company_boosts state). The API currently
 * inserts boosts as `status='active'` directly — when payment wiring
 * lands, the create call will return a `clientSecret` for Stripe
 * confirmation and the row will start as `pending_payment`.
 */

import { z } from "zod";
import { apiClient } from "../api-client";

export const BoostSchema = z.object({
  id: z.string(),
  userId: z.string(),
  subjectType: z.string(),
  subjectId: z.string(),
  placementType: z.string(),
  pricingModel: z.string(),
  budgetCents: z.number(),
  spentCents: z.number(),
  rateUnitCents: z.number().nullish(),
  status: z.string(),
  impressions: z.number(),
  clicks: z.number(),
  startsAt: z.union([z.string(), z.date()]).nullish(),
  endsAt: z.union([z.string(), z.date()]).nullish(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});

export type Boost = z.infer<typeof BoostSchema>;

export interface CreateBoostInput {
  subjectType: string;
  subjectId: string;
  budgetCents: number;
  durationDays: number;
  placementType?: string;
  pricingModel?: "flat" | "cpm" | "cpc";
}

export class BoostService {
  async create(input: CreateBoostInput): Promise<Boost> {
    const responseSchema = z.object({ boost: BoostSchema });
    const res = await apiClient.post<z.infer<typeof responseSchema>>(
      "/api/boosts",
      input,
      responseSchema,
    );
    return res.data.boost;
  }

  async listMine(): Promise<Boost[]> {
    const responseSchema = z.object({ items: z.array(BoostSchema) });
    const res = await apiClient.get<z.infer<typeof responseSchema>>(
      "/api/boosts/me",
      responseSchema,
    );
    return res.data.items;
  }

  async listForSubject(subjectType: string, subjectId: string): Promise<Boost[]> {
    const responseSchema = z.object({ items: z.array(BoostSchema) });
    const res = await apiClient.get<z.infer<typeof responseSchema>>(
      `/api/boosts/${subjectType}/${subjectId}`,
      responseSchema,
    );
    return res.data.items;
  }

  async cancel(boostId: string): Promise<void> {
    await apiClient.post(`/api/boosts/${boostId}/cancel`);
  }
}

export const boostService = new BoostService();
