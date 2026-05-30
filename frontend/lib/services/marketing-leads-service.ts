/**
 * Thin client for `/api/marketing/leads` triage actions — used by the
 * /outreach Inbox tab to flip a contact-inquiry row's status (new →
 * contacted → converted → closed) directly from the row, per gap
 * #1526. The list / source-prefix filter surface stays in the server
 * route; this client only covers the per-row status PATCH so the inbox
 * row can self-contain its action.
 */

import { apiClient } from "@/lib/api-client";

export type MarketingLeadStatus =
  | "new"
  | "contacted"
  | "converted"
  | "closed";

export interface MarketingLead {
  id: string;
  status: MarketingLeadStatus | string;
  convertedAt?: string | null;
  updatedAt?: string | null;
}

/** Transitions the triage state on a single lead row. Returns the
 *  updated row so the caller can refresh local optimistic state
 *  without a second round-trip. */
export async function updateLeadStatus(
  leadId: string,
  status: MarketingLeadStatus,
): Promise<MarketingLead> {
  const response = await apiClient.patch<MarketingLead>(
    `/api/marketing/leads/${leadId}/status`,
    { status },
  );
  return response.data;
}
