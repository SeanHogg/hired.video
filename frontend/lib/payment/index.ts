/**
 * Payment-client registry.
 *
 * To swap providers, change `PAYMENT_PROVIDER` on the backend.  No frontend
 * code changes are required — `usePaymentFlow` calls `getPaymentClient(name)`
 * with whatever the API reports.
 *
 * To add a new provider:
 *   1. Implement PaymentClient in a new file (e.g. stripe-client.ts)
 *   2. Register it in the `clients` map below
 */

import type { PaymentClient } from "./types";
import { helcimClient } from "./helcim-client";

const clients: Record<string, PaymentClient> = {
  [helcimClient.name]: helcimClient,
};

export function getPaymentClient(providerName: string | undefined): PaymentClient | null {
  if (!providerName) return null;
  return clients[providerName] ?? null;
}

export type { PaymentClient, PaymentClientCallbacks, PaymentSuccessData, InitCollectionResult } from "./types";
