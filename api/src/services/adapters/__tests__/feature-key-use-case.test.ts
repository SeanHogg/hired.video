/**
 * Coverage for the feature-key → use-case registry (#457).
 *
 * The registry lets SuperAdmin attribute per-call billing (`feature_key`)
 * up to the use-case profile that picked the model. The invariants worth
 * pinning: every registered value is a REAL use case (has a profile), the
 * `career_360` trio buckets together (the gap that prompted this), and the
 * forward/reverse lookups agree.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FEATURE_KEY_USE_CASE,
  USE_CASE_PROFILES,
  featureKeysForUseCase,
  useCaseForFeatureKey,
} from "../providers.js";

describe("FEATURE_KEY_USE_CASE registry", () => {
  it("maps every feature key to a use case that has a profile", () => {
    for (const [featureKey, useCase] of Object.entries(FEATURE_KEY_USE_CASE)) {
      assert.ok(
        useCase in USE_CASE_PROFILES,
        `${featureKey} → "${useCase}" is not a real use-case profile`,
      );
    }
  });

  it("buckets all three career_360 feature keys under the career_360 profile (#457)", () => {
    assert.equal(useCaseForFeatureKey("career_360_suggest"), "career_360");
    assert.equal(useCaseForFeatureKey("career_360_plan"), "career_360");
    assert.equal(useCaseForFeatureKey("career_360_evaluate"), "career_360");
    assert.deepEqual(featureKeysForUseCase("career_360"), [
      "career_360_evaluate",
      "career_360_plan",
      "career_360_suggest",
    ]);
  });

  it("forward and reverse lookups agree", () => {
    for (const [featureKey, useCase] of Object.entries(FEATURE_KEY_USE_CASE)) {
      assert.ok(
        featureKeysForUseCase(useCase).includes(featureKey),
        `${featureKey} missing from featureKeysForUseCase("${useCase}")`,
      );
    }
  });

  it("returns undefined for an unregistered feature key", () => {
    assert.equal(useCaseForFeatureKey("not_a_real_feature_key"), undefined);
  });
});
