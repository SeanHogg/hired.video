/**
 * The checkout-kind registry — data, not if/else. routes/checkout.ts looks a
 * kind up here; adding a purchasable product = one handler + one entry.
 */
import type { CheckoutKind } from "../../../../../shared/checkout.js";
import { createBoostCheckoutKind } from "./kinds/boost.js";
import { createCourseCheckoutKind } from "./kinds/course.js";
import { createJobBoostCheckoutKind } from "./kinds/jobBoost.js";
import { createTokenPackCheckoutKind } from "./kinds/tokenPack.js";
import type { CheckoutKindHandler, CheckoutRegistry } from "./types.js";

export const CHECKOUT_REGISTRY: CheckoutRegistry = {
  boost: createBoostCheckoutKind(),
  job_boost: createJobBoostCheckoutKind(),
  course: createCourseCheckoutKind(),
  token_pack: createTokenPackCheckoutKind(),
};

export function checkoutHandler(kind: CheckoutKind): CheckoutKindHandler<CheckoutKind> {
  return CHECKOUT_REGISTRY[kind] as unknown as CheckoutKindHandler<CheckoutKind>;
}
