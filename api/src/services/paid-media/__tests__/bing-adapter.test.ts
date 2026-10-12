/**
 * #977 Microsoft Advertising request-shape tests (Campaign Management v13):
 * AddAdGroups + ONE AddAdGroupCriterions on create; UpdateAdGroups +
 * GetAdGroupCriterionsByIds + ONE delete batch + ONE add batch on update;
 * DeleteAdGroups with the parent campaign; campaigns on /Campaigns.
 *
 * Run: node --import tsx --test src/services/paid-media/__tests__/bing-adapter.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createBingAdapter } from "../adapters/bing/index.js";
import { buildBingCriteriaDelta, buildBingCriteriaPlan } from "../adapters/bing/criteria.js";
import { ADAPTER_CFG as CFG, ADAPTER_CTX as CTX, SAMPLE_SPEC as SPEC, adSetInput, useFetchStub } from "./fetch-stub.js";

const { calls, responses } = useFetchStub();
const MS = "https://campaign.api.bingads.microsoft.com/CampaignManagement/v13";

describe("#977 Microsoft Advertising ad groups + criteria", () => {
  it("createAdSet: AddAdGroups, then ONE AddAdGroupCriterions call", async () => {
    responses.push({ AdGroupIds: [4242], PartialErrors: [] }, { AdGroupCriterionIds: [1, 2, 3] });
    const ref = await createBingAdapter(CFG).createAdSet(CTX, adSetInput(SPEC));
    assert.equal(ref.externalId, "4242");
    assert.equal(calls.length, 2);

    assert.equal(calls[0]!.url, `${MS}/AdGroups`);
    assert.equal(calls[0]!.init.method, "POST");
    assert.equal(calls[0]!.body.CampaignId, 555);
    assert.equal(calls[0]!.body.AdGroups[0].Name, "Recruiters — US/CA");
    assert.deepEqual(calls[0]!.body.AdGroups[0].CpcBid, { Amount: 1.5 });

    assert.equal(calls[1]!.url, `${MS}/AdGroupCriterions`);
    assert.equal(calls[1]!.init.method, "POST");
    const headers = calls[1]!.init.headers as Record<string, string>;
    assert.equal(headers.DeveloperToken, "dev-token");
    assert.equal(headers.CustomerAccountId, "1234567890");

    const body = calls[1]!.body;
    assert.equal(body.CriterionType, "Targets");
    const items = body.AdGroupCriterions as any[];
    assert.ok(items.every((i) => i.Type === "BiddableAdGroupCriterion" && i.AdGroupId === 4242 && i.Status === "Active"));
    const byType = (t: string) => items.filter((i) => i.Criterion.Type === t);
    assert.deepEqual(byType("LocationCriterion").map((i) => i.Criterion.LocationId), [190, 32]);
    assert.deepEqual(byType("AgeCriterion").map((i) => i.Criterion.AgeRange), ["TwentyFiveToThirtyFour", "ThirtyFiveToFortyNine"]);
    assert.deepEqual(byType("GenderCriterion").map((i) => i.Criterion.GenderType), ["Female"]);
    assert.deepEqual(
      byType("DeviceCriterion").map((i) => [i.Criterion.DeviceName, i.CriterionBid.Multiplier]),
      [["Computers", -100], ["Smartphones", 0], ["Tablets", -100]],
    );
    assert.ok(items.every((i) => i.CriterionBid.Type === "BidMultiplier"));
    assert.deepEqual((ref.raw as any).skipped, ["geo:ZZ"]);
  });

  it("createAdSet surfaces PartialErrors when no id comes back", async () => {
    responses.push({ AdGroupIds: [null], PartialErrors: [{ Code: 1201, Message: "Invalid campaign" }] });
    await assert.rejects(() => createBingAdapter(CFG).createAdSet(CTX, adSetInput({})), /Failed to create Bing ad group/);
  });

  it("updateAdSet: UpdateAdGroups, read criterions, ONE delete batch + ONE add batch", async () => {
    responses.push(
      {}, // PUT /AdGroups
      { AdGroupCriterions: [
        { Id: 11, Criterion: { Type: "LocationCriterion", LocationId: 190 }, CriterionBid: { Type: "BidMultiplier", Multiplier: 0 } },
        { Id: 12, Criterion: { Type: "LocationCriterion", LocationId: 188 }, CriterionBid: { Type: "BidMultiplier", Multiplier: 0 } },
        { Id: 13, Criterion: { Type: "GenderCriterion", GenderType: "Male" }, CriterionBid: { Type: "BidMultiplier", Multiplier: 0 } },
      ] },
      {}, // DELETE
      { AdGroupCriterionIds: [21] }, // POST add
    );
    await createBingAdapter(CFG).updateAdSet(CTX, "4242", {
      externalCampaignId: "555",
      name: "Renamed",
      targeting: { geo: { countries: ["US", "CA"] } },
    });
    assert.deepEqual(calls.map((c) => [c.init.method, c.url.replace(MS, "")]), [
      ["PUT", "/AdGroups"],
      ["POST", "/AdGroupCriterions/QueryByIds"],
      ["DELETE", "/AdGroupCriterions"],
      ["POST", "/AdGroupCriterions"],
    ]);
    assert.deepEqual(calls[0]!.body, { CampaignId: 555, AdGroups: [{ Id: 4242, Name: "Renamed" }] });
    assert.deepEqual(calls[1]!.body, { AdGroupCriterionIds: null, AdGroupId: 4242, CriterionType: "Targets" });
    assert.deepEqual(calls[2]!.body, { AdGroupCriterionIds: [12, 13], AdGroupId: 4242, CriterionType: "Targets" });
    assert.deepEqual(calls[3]!.body.AdGroupCriterions.map((i: any) => i.Criterion.LocationId), [32]);
  });

  it("updateAdSet without targeting only updates the ad group", async () => {
    responses.push({});
    await createBingAdapter(CFG).updateAdSet(CTX, "4242", { externalCampaignId: "555", status: "paused" });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]!.body.AdGroups, [{ Id: 4242, Status: "Paused" }]);
  });

  it("deleteAdSet: DeleteAdGroups with the parent campaign; refuses without it", async () => {
    responses.push({});
    await createBingAdapter(CFG).deleteAdSet(CTX, "4242", { externalCampaignId: "555" });
    assert.equal(calls[0]!.init.method, "DELETE");
    assert.equal(calls[0]!.url, `${MS}/AdGroups`);
    assert.deepEqual(calls[0]!.body, { CampaignId: 555, AdGroupIds: [4242] });
    await assert.rejects(() => createBingAdapter(CFG).deleteAdSet(CTX, "4242"), /externalCampaignId/);
  });

  it("an unchanged spec produces no delete or add", () => {
    const plan = buildBingCriteriaPlan("7", { geo: { countries: ["US"] } });
    const existing = plan.body!.AdGroupCriterions.map((c, i) => ({ ...c, Id: i + 1 }));
    const delta = buildBingCriteriaDelta("7", { geo: { countries: ["US"] } }, existing);
    assert.equal(delta.remove, null);
    assert.equal(delta.add, null);
  });

  it("an empty spec builds no request; numeric regions pass through; unmapped countries are skipped", () => {
    assert.equal(buildBingCriteriaPlan("1", {}).body, null);
    const plan = buildBingCriteriaPlan("9", { geo: { countries: ["FR"], regions: ["60123", "US-CA"] } });
    assert.deepEqual(plan.body!.AdGroupCriterions.map((i: any) => i.Criterion.LocationId), [60123]);
    assert.deepEqual(plan.skipped, ["geo:FR"]);
  });
});

describe("Microsoft Advertising campaigns (v13)", () => {
  it("createCampaign posts to /Campaigns with the account id", async () => {
    responses.push({ CampaignIds: [555] });
    const ref = await createBingAdapter(CFG).createCampaign(CTX, {
      internalId: "c-1", name: "Fall hiring", objective: "TRAFFIC", status: "active",
      budgetCents: null, dailyBudgetCents: 2500, currencyCode: "USD", startAt: null, endAt: null, metadata: {},
    });
    assert.equal(ref.externalId, "555");
    assert.equal(calls[0]!.url, `${MS}/Campaigns`);
    assert.equal(calls[0]!.body.AccountId, 1234567890);
    assert.equal(calls[0]!.body.Campaigns[0].DailyBudget, 25);
    assert.equal(calls[0]!.body.Campaigns[0].BudgetType, "DailyBudgetStandard");
  });
});
