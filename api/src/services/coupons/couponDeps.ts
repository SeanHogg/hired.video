/**
 * Production wiring for CouponDeps. Tests never import this file; they
 * build deps from in-memory fakes (see __tests__/couponUseCases.test.ts).
 */
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { auditLog } from "../../utils/audit.js";
import { getSubscription, invalidateSubscriptionCache } from "../billing/BillingService.js";
import * as couponRepo from "./couponRepository.js";
import type { CouponDeps } from "./couponUseCases.js";

/** No 0/O/1/I — codes get read aloud and typed from screenshots. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

export function generateCouponCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

export function buildCouponDeps(): CouponDeps {
  const subscriptions = buildRepos(getDb()).subscriptions;
  return {
    coupons: couponRepo,
    plans: {
      findOverrideByUserId: (userId) => subscriptions.findOverrideByUserId(userId),
      upsertOverride: (input) => subscriptions.upsertOverride(input),
      getSubscription,
      invalidateForUser: invalidateSubscriptionCache,
    },
    audit: { log: auditLog },
    now: () => new Date(),
    generateCode: generateCouponCode,
  };
}
