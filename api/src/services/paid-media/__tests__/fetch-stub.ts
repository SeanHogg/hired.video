/**
 * Shared `fetch` stub for the ad-network adapter request-shape tests.
 * Records every call (URL, init, parsed JSON body) and answers with the
 * queued responses in order — JSON, or a RawBody for downloads ({} when
 * the queue is empty).
 */

import { afterEach, beforeEach } from "node:test";
import type { AdapterAdSetInput, AdapterContext, TargetingSpec } from "../ports/types.js";

export interface RecordedCall {
  url: string;
  init: RequestInit;
  body: any;
}

/** Queue one of these to answer with raw bytes / text instead of JSON. */
export class RawBody {
  constructor(public readonly body: string | Uint8Array) {}
}

export interface FetchStub {
  calls: RecordedCall[];
  responses: unknown[];
}

/** Install the stub for every test in the calling file. */
export function useFetchStub(): FetchStub {
  const stub: FetchStub = { calls: [], responses: [] };
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    stub.calls.length = 0;
    stub.responses.length = 0;
    globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
      stub.calls.push({ url: String(url), init, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const next = stub.responses.shift() ?? {};
      if (next instanceof RawBody) return new Response(next.body, { status: 200 });
      return new Response(JSON.stringify(next), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  return stub;
}

export const ADAPTER_CFG = { clientId: "cid", clientSecret: "secret", developerToken: "dev-token" };
export const ADAPTER_CTX: AdapterContext = { accessToken: "tok", externalAccountId: "1234567890", connectionId: "conn-1" };

/** A real-world spec: US + Canada (+ an unmapped code), English, 25-44, women, mobile only. */
export const SAMPLE_SPEC: TargetingSpec = {
  geo: { countries: ["US", "ca", "ZZ"] },
  demographics: { ageMin: 25, ageMax: 44, genders: ["female"], languages: ["en-US"] },
  devicePlatforms: ["mobile"],
};

export function adSetInput(targeting: TargetingSpec): AdapterAdSetInput {
  return {
    internalId: "as-1", externalCampaignId: "555", name: "Recruiters — US/CA", status: "active",
    bidStrategy: "manual", bidAmountCents: 150, optimizationGoal: "CLICKS",
    dailyBudgetCents: 2000, lifetimeBudgetCents: null, targeting,
    frequencyCapImpressions: null, frequencyCapHours: null, startAt: null, endAt: null,
  };
}
