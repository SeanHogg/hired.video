/**
 * Polymorphic Boost Service
 *
 * Wraps /api/boosts. Any user-generated subject (review, feed_post,
 * video, resume, voice_clone, …) can be promoted by its owner via
 * `boostService.create({ subjectType, subjectId, ... })`.
 *
 * Creation runs the paid checkout server-side: the boost comes back
 * 'active' only when Campaign $ covered it; otherwise it is
 * 'pending_payment' until the USD payment is confirmed.
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import type { InitCollectionResult } from "@/lib/payment";

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

  /** Opens the payment widget for exactly the USD still owed on a boost
   *  (server-chosen amount). */
  async startPayment(boostId: string): Promise<InitCollectionResult> {
    const returnUrl = window.location.href;
    const res = await apiClient.request<{ collection: InitCollectionResult }>(
      `/api/boost-checkout/boosts/${encodeURIComponent(boostId)}/pay`,
      { method: "POST", body: { successUrl: returnUrl, cancelUrl: returnUrl }, suppressErrorEvent: true },
    );
    return res.data.collection;
  }

  /** Server re-reads the transaction from the provider before activating. */
  async confirmPayment(boostId: string, transactionId: string): Promise<{ activated: boolean; pending: boolean }> {
    const res = await apiClient.request<{ activated: boolean; pending: boolean }>(
      `/api/boost-checkout/boosts/${encodeURIComponent(boostId)}/confirm-payment`,
      { method: "POST", body: { transactionId }, suppressErrorEvent: true },
    );
    return res.data;
  }

  async cancel(boostId: string): Promise<void> {
    await apiClient.post(`/api/boosts/${boostId}/cancel`);
  }
}

export const boostService = new BoostService();
