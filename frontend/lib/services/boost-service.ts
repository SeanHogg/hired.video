/**
 * Polymorphic Boost Service
 *
 * Any user-generated subject (review, feed_post, video, resume,
 * voice_clone, …) can be promoted by its owner via
 * `boostService.create({ subjectType, subjectId, ... })`, which starts the
 * paid checkout (POST /api/checkout {kind:"boost"}): the boost comes back
 * 'active' only when Campaign $ covered it; otherwise it is
 * 'pending_payment' until the USD payment is confirmed (useBoostPayment).
 * Listing / cancelling boosts is /api/boosts.
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import { checkoutService } from "@/lib/services/checkout-service";
import { checkoutIdFor, type BoostableSubject } from "@shared/checkout";

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
  subjectType: BoostableSubject;
  subjectId: string;
  budgetCents: number;
  durationDays: number;
  placementType?: string;
  pricingModel?: "flat" | "cpm" | "cpc";
}

/** The checkout id of a boost (the boost id is its key) — for useCheckoutPayment. */
export function boostCheckoutId(boostId: string): string {
  return checkoutIdFor("boost", boostId);
}

export class BoostService {
  async create(input: CreateBoostInput): Promise<Boost> {
    const checkout = await checkoutService.start<"boost">({ kind: "boost", ...input });
    return BoostSchema.parse(checkout.details.boost);
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
