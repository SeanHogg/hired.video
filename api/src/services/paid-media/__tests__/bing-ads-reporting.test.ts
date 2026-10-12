/**
 * #977 Microsoft Advertising — ads (Campaign Management v13 /Ads) and
 * reporting (Reporting v13 submit → poll → download), request shapes.
 * Reporting never waits: one poll per call, `pending` otherwise.
 *
 * Run: node --import tsx --test src/services/paid-media/__tests__/bing-ads-reporting.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createBingAdapter } from "../adapters/bing/index.js";
import { finalUrlSuffix } from "../adapters/bing/ads.js";
import { buildReportRequest, parseCsv, reportCsvToRows, unzipFirstEntry } from "../adapters/bing/reporting.js";
import { isPendingInsights, type InsightsQuery } from "../ports/types.js";
import { ADAPTER_CFG as CFG, ADAPTER_CTX as CTX, RawBody, useFetchStub } from "./fetch-stub.js";

const { calls, responses } = useFetchStub();
const MS = "https://campaign.api.bingads.microsoft.com/CampaignManagement/v13";
const REPORTING = "https://reporting.api.bingads.microsoft.com/Reporting/v13";

const AD = {
  internalId: "ad-1", externalAdSetId: "4242", externalCreativeId: "synthetic:cr-1", name: "Fall hiring — search",
  status: "active" as const, destinationUrl: "https://hired.video/jobs/123",
  utmSource: null, utmMedium: null, utmCampaign: "fall-hiring", utmContent: null, utmTerm: null,
};

describe("#977 Bing ads on v13 /Ads", () => {
  it("createAd: AddAds with AssetLink headlines/descriptions and a UTM FinalUrlSuffix", async () => {
    responses.push({ AdIds: [9001], PartialErrors: [] });
    const ref = await createBingAdapter(CFG).createAd(CTX, {
      ...AD,
      headlines: ["Senior TypeScript Engineer", "Remote-friendly"],
      descriptions: ["Apply in two minutes"],
    } as typeof AD);
    assert.equal(ref.externalId, "9001");
    assert.equal(calls[0]!.url, `${MS}/Ads`);
    assert.equal(calls[0]!.init.method, "POST");
    const body = calls[0]!.body;
    assert.equal(body.AdGroupId, 4242);
    const ad = body.Ads[0];
    assert.equal(ad.Type, "ResponsiveSearch");
    assert.equal(ad.Status, "Active");
    assert.deepEqual(ad.Headlines, [
      { Asset: { Type: "TextAsset", Text: "Senior TypeScript Engineer" } },
      { Asset: { Type: "TextAsset", Text: "Remote-friendly" } },
    ]);
    assert.deepEqual(ad.Descriptions, [{ Asset: { Type: "TextAsset", Text: "Apply in two minutes" } }]);
    assert.deepEqual(ad.FinalUrls, ["https://hired.video/jobs/123"]);
    assert.equal(ad.FinalUrlSuffix, "utm_source=bing&utm_medium=cpc&utm_campaign=fall-hiring");
  });

  it("updateAd: UpdateAds carries the parent AdGroupId", async () => {
    responses.push({});
    await createBingAdapter(CFG).updateAd(CTX, "9001", { externalAdSetId: "4242", status: "paused" });
    assert.equal(calls[0]!.init.method, "PUT");
    assert.deepEqual(calls[0]!.body, { AdGroupId: 4242, Ads: [{ Id: 9001, Type: "ResponsiveSearch", Status: "Paused" }] });
    await assert.rejects(() => createBingAdapter(CFG).updateAd(CTX, "9001", { status: "paused" }), /externalAdSetId/);
  });

  it("deleteAd: DeleteAds with the parent; refuses without it", async () => {
    responses.push({});
    await createBingAdapter(CFG).deleteAd(CTX, "9001", { externalAdSetId: "4242" });
    assert.equal(calls[0]!.init.method, "DELETE");
    assert.deepEqual(calls[0]!.body, { AdGroupId: 4242, AdIds: [9001] });
    await assert.rejects(() => createBingAdapter(CFG).deleteAd(CTX, "9001"), /externalAdSetId/);
  });

  it("finalUrlSuffix drops empty UTM fields and encodes values", () => {
    assert.equal(
      finalUrlSuffix({ ...AD, utmCampaign: "fall hiring & more", utmTerm: "ts" }),
      "utm_source=bing&utm_medium=cpc&utm_campaign=fall+hiring+%26+more&utm_term=ts",
    );
  });
});

// Shaped like a real Microsoft CSV (FormatVersion 2.0, header row, quoted).
const CSV = [
  '"TimePeriod","CampaignId","Impressions","Clicks","Spend","Conversions"',
  '"2026-10-01","555","1200","34","12.50","2"',
  '"2026-10-02","555","980","21","8.25","1"',
  '"2026-10-02","777","50","1","0.40","0"',
].join("\r\n");

const QUERY: InsightsQuery = { resourceKind: "campaign", externalIds: ["555"], since: "2026-10-01", until: "2026-10-02" };

/** A one-entry zip archive, stored (method 0), as the download returns. */
function storedZip(name: string, text: string): Uint8Array {
  const data = new TextEncoder().encode(text);
  const nameBytes = new TextEncoder().encode(name);
  const out = new Uint8Array(30 + nameBytes.length + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x04034b50, true);
  v.setUint16(8, 0, true); // stored
  v.setUint32(18, data.length, true);
  v.setUint32(22, data.length, true);
  v.setUint16(26, nameBytes.length, true);
  out.set(nameBytes, 30);
  out.set(data, 30 + nameBytes.length);
  return out;
}

describe("#977 Bing reporting (Reporting v13)", () => {
  it("submit body: daily campaign report scoped to the account, custom range", () => {
    const req = buildReportRequest("1234567890", QUERY).ReportRequest;
    assert.equal(req.Type, "CampaignPerformanceReportRequest");
    assert.equal(req.Format, "Csv");
    assert.equal(req.Aggregation, "Daily");
    assert.deepEqual(req.Scope, { AccountIds: [1234567890] });
    assert.deepEqual(req.Columns, ["TimePeriod", "CampaignId", "Impressions", "Clicks", "Spend", "Conversions"]);
    assert.deepEqual(req.Time.CustomDateRangeStart, { Day: 1, Month: 10, Year: 2026 });
    assert.equal(buildReportRequest("1", { ...QUERY, resourceKind: "ad_set" }).ReportRequest.Type, "AdGroupPerformanceReportRequest");
  });

  it("first pull: submit + ONE poll; not ready → pending (no waiting)", async () => {
    responses.push({ ReportRequestId: "rr-1" }, { ReportRequestStatus: { Status: "Pending" } });
    const r = await createBingAdapter(CFG).pullInsights(CTX, QUERY);
    assert.ok(isPendingInsights(r));
    assert.equal(r.reportRequestId, "rr-1");
    assert.deepEqual(calls.map((c) => c.url), [`${REPORTING}/GenerateReport/Submit`, `${REPORTING}/GenerateReport/Poll`]);
    assert.deepEqual(calls[1]!.body, { ReportRequestId: "rr-1" });
  });

  it("later pull with pendingReportId: poll → download → rows (no resubmit)", async () => {
    responses.push(
      { ReportRequestStatus: { Status: "Success", ReportDownloadUrl: "https://bingadsappsstorage.blob.core.windows.net/r/rr-1.zip?sig=x" } },
      new RawBody(storedZip("report.csv", CSV)),
    );
    const r = await createBingAdapter(CFG).pullInsights(CTX, { ...QUERY, pendingReportId: "rr-1" });
    assert.equal(calls.length, 2);
    assert.equal(calls[0]!.url, `${REPORTING}/GenerateReport/Poll`);
    assert.equal(calls[1]!.init.method, "GET");
    assert.ok(Array.isArray(r));
    assert.deepEqual(r.map((x) => [x.externalId, x.date, x.impressions, x.clicks, x.spendCents, x.conversions]), [
      ["555", "2026-10-01", 1200, 34, 1250, 2],
      ["555", "2026-10-02", 980, 21, 825, 1],
    ]);
  });

  it("Success with no download URL = no data; Error status throws", async () => {
    responses.push({ ReportRequestStatus: { Status: "Success", ReportDownloadUrl: null } });
    assert.deepEqual(await createBingAdapter(CFG).pullInsights(CTX, { ...QUERY, pendingReportId: "rr-2" }), []);
    responses.push({ ReportRequestStatus: { Status: "Error" } });
    await assert.rejects(() => createBingAdapter(CFG).pullInsights(CTX, { ...QUERY, pendingReportId: "rr-3" }), /failed \(Error\)/);
  });

  it("unzips a deflated entry too", async () => {
    const deflated = new Uint8Array(await new Response(new Blob([new TextEncoder().encode(CSV)]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
    const zip = storedZip("report.csv", "");
    const out = new Uint8Array(zip.length + deflated.length);
    out.set(zip);
    out.set(deflated, zip.length);
    const v = new DataView(out.buffer);
    v.setUint16(8, 8, true);
    v.setUint32(18, deflated.length, true);
    assert.equal(await unzipFirstEntry(out.buffer), CSV);
  });

  it("CSV parser handles quotes, doubled quotes and CRLF", () => {
    assert.deepEqual(parseCsv('"a","b ""x""",c\r\n1,"2,3",4'), [["a", 'b "x"', "c"], ["1", "2,3", "4"]]);
    assert.equal(reportCsvToRows("", QUERY).length, 0);
  });
});
