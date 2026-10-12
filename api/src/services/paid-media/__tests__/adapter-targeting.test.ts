/**
 * #976 Google Ads request-shape tests — TargetingSpec → ONE
 * googleAds:mutate batch (CampaignCriterion geo/language/device +
 * AdGroupCriterion age/gender), and the update-time GAQL delta.
 * Bing: bing-adapter.test.ts. TikTok: tiktok-adapter.test.ts.
 *
 * `fetch` is stubbed; every assertion is against the body each vendor
 * documents (links in the adapter modules).
 *
 * Run: node --import tsx --test src/services/paid-media/__tests__/adapter-targeting.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGoogleAdsAdapter } from "../adapters/google/index.js";
import { buildGoogleCriteriaPlan, parseExistingCriteria } from "../adapters/google/criteria.js";
import { ADAPTER_CFG, ADAPTER_CTX, SAMPLE_SPEC, adSetInput, useFetchStub } from "./fetch-stub.js";

const { calls, responses } = useFetchStub();
const CFG = ADAPTER_CFG;
const CTX = ADAPTER_CTX;
const SPEC = SAMPLE_SPEC;

describe("#976 Google Ads criteria", () => {
  it("createAdSet sends the ad group, then ONE googleAds:mutate with every criterion", async () => {
    responses.push({ results: [{ resourceName: "customers/1234567890/adGroups/777" }] }, { results: [] });
    const ref = await createGoogleAdsAdapter(CFG).createAdSet(CTX, adSetInput(SPEC));
    assert.equal(ref.externalId, "777");
    assert.equal(calls.length, 2);
    assert.match(calls[1]!.url, /\/v16\/customers\/1234567890\/googleAds:mutate$/);
    assert.equal((calls[1]!.init.headers as Record<string, string>)["developer-token"], "dev-token");

    const ops = calls[1]!.body.mutateOperations as any[];
    const campaign = "customers/1234567890/campaigns/555";
    const adGroup = "customers/1234567890/adGroups/777";
    const creates = ops.map((o) => o.campaignCriterionOperation?.create ?? o.adGroupCriterionOperation?.create);
    assert.ok(creates.every(Boolean), "only create operations on a fresh ad group");

    const geo = creates.filter((c) => c.location).map((c) => c.location.geoTargetConstant);
    assert.deepEqual(geo, ["geoTargetConstants/2840", "geoTargetConstants/2124"]);
    assert.ok(creates.filter((c) => c.location || c.language || c.device).every((c) => c.campaign === campaign));
    assert.deepEqual(creates.filter((c) => c.language).map((c) => c.language.languageConstant), ["languageConstants/1000"]);

    const devices = Object.fromEntries(creates.filter((c) => c.device).map((c) => [c.device.type, c.bidModifier]));
    assert.deepEqual(devices, { MOBILE: 1, DESKTOP: 0, TABLET: 0, CONNECTED_TV: 0 });

    const ages = creates.filter((c) => c.ageRange);
    assert.deepEqual(ages.map((c) => c.ageRange.type), ["AGE_RANGE_18_24", "AGE_RANGE_45_54", "AGE_RANGE_55_64", "AGE_RANGE_65_UP"]);
    assert.ok(ages.every((c) => c.negative === true && c.adGroup === adGroup));
    assert.deepEqual(creates.filter((c) => c.gender).map((c) => [c.gender.type, c.negative]), [["MALE", true]]);

    assert.deepEqual((ref.raw as any).criteria.skipped, ["geo:ZZ"]);
  });

  it("an empty spec sends no criteria call", async () => {
    responses.push({ results: [{ resourceName: "customers/1234567890/adGroups/778" }] });
    await createGoogleAdsAdapter(CFG).createAdSet(CTX, adSetInput({}));
    assert.equal(calls.length, 1);
  });

  it("updateAdSet reads existing criteria via GAQL and mutates only the delta", async () => {
    responses.push(
      { results: [] }, // adGroups:mutate (name/status)
      { results: [
        { campaignCriterion: { resourceName: "customers/1234567890/campaignCriteria/555~2840", location: { geoTargetConstant: "geoTargetConstants/2840" } } },
        { campaignCriterion: { resourceName: "customers/1234567890/campaignCriteria/555~2826", location: { geoTargetConstant: "geoTargetConstants/2826" } } },
        { campaignCriterion: { resourceName: "customers/1234567890/campaignCriteria/555~30001", device: { type: "DESKTOP" } } },
      ] },
      { results: [] },
      { results: [] },
    );
    await createGoogleAdsAdapter(CFG).updateAdSet(CTX, "777", { externalCampaignId: "555", targeting: { geo: { countries: ["US"] } } });
    assert.equal(calls.filter((c) => c.url.endsWith("googleAds:search")).length, 2);
    const mutate = calls.filter((c) => c.url.endsWith("googleAds:mutate"));
    assert.equal(mutate.length, 1, "one batch");
    const ops = mutate[0]!.body.mutateOperations as any[];
    assert.deepEqual(ops, [
      { campaignCriterionOperation: { remove: "customers/1234567890/campaignCriteria/555~2826" } },
      { campaignCriterionOperation: { update: { resourceName: "customers/1234567890/campaignCriteria/555~30001", bidModifier: 1 }, updateMask: "bidModifier" } },
    ]);
  });

  it("parseExistingCriteria keys ad-group demographics", () => {
    const parsed = parseExistingCriteria([
      { adGroupCriterion: { resourceName: "rn-a", ageRange: { type: "AGE_RANGE_18_24" } } },
      { adGroupCriterion: { resourceName: "rn-g", gender: { type: "MALE" } } },
    ]);
    assert.deepEqual(parsed.map((p) => p.key), ["age:AGE_RANGE_18_24", "gender:MALE"]);
    const plan = buildGoogleCriteriaPlan({ customerId: "1", campaignId: "2", adGroupId: "3", spec: { demographics: { genders: ["male"] } }, existing: parsed });
    assert.deepEqual(plan.mutateOperations, [
      { adGroupCriterionOperation: { remove: "rn-a" } },
      { adGroupCriterionOperation: { remove: "rn-g" } },
      { adGroupCriterionOperation: { create: { adGroup: "customers/1/adGroups/3", negative: true, gender: { type: "FEMALE" } } } },
    ]);
  });
});
