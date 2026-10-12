/**
 * Public unified search (`GET /api/search/public`) — the pure pieces split
 * out of routes/search.ts:
 *   - template result mapping carries what the template makes
 *     (mediaKind + documentKind) alongside the existing marketplace payload;
 *   - the cache paramKey keeps its exact historic format (it is embedded in
 *     the version-stamped KV key, so any drift orphans every warm entry);
 *   - category → included kinds, allowlist intersection, pagination.
 *
 * Fixtures mirror real `studio_templates` rows: a creator résumé template
 * folded in by mig 0519/0520 (media_kind 'document', document_kind
 * 'resume') and an ordinary first-party video template (document_kind NULL).
 *
 * Run: node --import tsx --test src/services/__tests__/public-search.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toTemplateItem } from "../search/searchItemMappers.js";
import { categoryInclusion, parsePublicSearchParams } from "../search/publicSearchParams.js";
import { allowEmpty, intersectAllowlists } from "../search/searchAllowlists.js";
import type { StudioTemplateRow } from "../../repositories/publicSearchRepository.js";

const HV_COMMUNITY_COMPANY_ID = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";

function templateRow(p: Partial<StudioTemplateRow> & Pick<StudioTemplateRow, "id" | "name">): StudioTemplateRow {
  return {
    creatorId: "3b9f0c1e-7d2a-4f5b-8e6c-1a2b3c4d5e6f",
    companyId: null,
    sourceProjectId: null,
    mediaKind: "video",
    documentKind: null,
    description: null,
    thumbnailUrl: null,
    previewVideoUrl: null,
    videoScript: {},
    durationSec: null,
    motion: null,
    language: null,
    tags: [],
    visibility: "public",
    listingSlug: null,
    priceCents: 0,
    currency: "USD",
    platformFeeBps: 500,
    consentAgreedAt: null,
    consentIp: null,
    consentUa: null,
    viewCount: 0,
    purchaseCount: 0,
    listingStatus: "draft",
    ipAttestation: null,
    reviewNotes: null,
    approvedAt: null,
    rejectedAt: null,
    publishedAt: new Date("2026-09-30T12:00:00.000Z"),
    createdAt: new Date("2026-09-01T08:00:00.000Z"),
    updatedAt: new Date("2026-10-01T09:30:00.000Z"),
    ...p,
  };
}

const resumeTemplate = templateRow({
  id: "a2d4f6b8-1c3e-4a5b-9d7f-0e2c4a6b8d1f",
  name: "Modern Two-Column",
  description: "Clean two-column résumé with a skills sidebar",
  mediaKind: "document",
  documentKind: "resume",
  listingSlug: "modern-two-column",
  tags: ["resume", "minimal"],
  priceCents: 499,
});

const videoTemplate = templateRow({
  id: "c1e3a5b7-2d4f-4b6a-8c0e-1f3a5c7e9b2d",
  name: "Sizzle Reel",
  companyId: HV_COMMUNITY_COMPANY_ID,
  durationSec: 30,
  motion: "cinematic",
});

describe("toTemplateItem — template kind", () => {
  it("carries mediaKind + documentKind for a résumé template", () => {
    const item = toTemplateItem(resumeTemplate, HV_COMMUNITY_COMPANY_ID);
    assert.equal(item.type, "template");
    assert.equal(item.mediaKind, "document");
    assert.equal(item.documentKind, "resume");
  });

  it("carries mediaKind 'video' and documentKind null for a video template", () => {
    const item = toTemplateItem(videoTemplate, HV_COMMUNITY_COMPANY_ID);
    assert.equal(item.mediaKind, "video");
    assert.equal(item.documentKind, null);
  });

  it("always includes documentKind (null when unset), never omits it", () => {
    const row = templateRow({ id: "d0e1f2a3-b4c5-4d6e-8f7a-9b0c1d2e3f4a", name: "Legacy podcast", mediaKind: "podcast" });
    const item = toTemplateItem(row, null);
    assert.ok("documentKind" in item);
    assert.equal(item.documentKind, null);
    assert.equal(item.mediaKind, "podcast");
  });

  it("keeps the existing marketplace payload unchanged", () => {
    const item = toTemplateItem(resumeTemplate, HV_COMMUNITY_COMPANY_ID);
    assert.equal(item.title, "Modern Two-Column");
    assert.equal(item.summary, "Clean two-column résumé with a skills sidebar");
    assert.equal(item.createdAt, "2026-09-30T12:00:00.000Z"); // publishedAt wins
    assert.equal(item.isFeatured, false);
    assert.deepEqual(item.template, {
      kind: "studio",
      id: resumeTemplate.id,
      slug: "modern-two-column",
      thumbnailUrl: null,
      previewVideoUrl: null,
      priceCents: 499,
      currency: "USD",
      durationSec: null,
      motion: null,
      language: null,
      tags: ["resume", "minimal"],
      creatorId: resumeTemplate.creatorId,
      companyId: null,
      firstParty: false,
      viewCount: 0,
      purchaseCount: 0,
    });
  });

  it("flags first-party templates (owned by the Hired.VIDEO Community company)", () => {
    const item = toTemplateItem(videoTemplate, HV_COMMUNITY_COMPANY_ID);
    assert.equal(item.isFeatured, true);
    assert.equal(item.template.firstParty, true);
    assert.equal(toTemplateItem(videoTemplate, null).template.firstParty, false);
  });
});

function reader(q: Record<string, string>) {
  return (name: string): string | undefined => q[name];
}

describe("parsePublicSearchParams — cache key + params", () => {
  it("produces the historic paramKey format for an empty query", () => {
    const p = parsePublicSearchParams(reader({}));
    assert.equal(
      p.paramKey,
      "q=|cat=all|loc=|emp=|exp=|rem=|smin=|smax=|aud=|co=|st=|ci=|lat=|lng=|rad=|fp=",
    );
    assert.equal(p.page, 1);
    assert.equal(p.limit, 20);
  });

  it("encodes every dataset param and excludes page/limit", () => {
    const p = parsePublicSearchParams(
      reader({
        search: "  Designer ",
        category: "Templates",
        location: "Austin",
        employmentType: "full_time",
        isRemote: "true",
        salaryMin: "90000",
        countryId: "233",
        firstParty: "true",
        page: "3",
        limit: "500",
      }),
    );
    assert.equal(
      p.paramKey,
      "q=designer|cat=templates|loc=austin|emp=full_time|exp=|rem=true|smin=90000|smax=|aud=|co=233|st=|ci=|lat=|lng=|rad=|fp=true",
    );
    assert.equal(p.search, "Designer");
    assert.equal(p.page, 3);
    assert.equal(p.limit, 100);
    assert.equal(p.firstPartyOnly, true);
    assert.equal(p.hasStructuredGeo, true);
    assert.equal(p.geoFilter.text, "Austin");
  });

  it("drops an unknown audience key instead of widening results", () => {
    const p = parsePublicSearchParams(reader({ audience: "not-a-real-audience" }));
    assert.equal(p.audienceKey, null);
    assert.match(p.paramKey, /\|aud=not-a-real-audience\|/);
  });
});

describe("categoryInclusion", () => {
  it("templates includes studio templates AND public résumés (#1613)", () => {
    const inc = categoryInclusion("templates");
    assert.equal(inc.templates, true);
    assert.equal(inc.resumes, true);
    assert.equal(inc.jobs, false);
  });

  it("all includes every kind; an unknown category includes none", () => {
    assert.ok(Object.values(categoryInclusion("all")).every(Boolean));
    assert.ok(Object.values(categoryInclusion("nope")).every((v) => !v));
  });
});

describe("allowlists", () => {
  it("null means no constraint; intersection short-circuits on empty", () => {
    assert.equal(intersectAllowlists(null, null), null);
    assert.deepEqual(intersectAllowlists(null, ["a"]), ["a"]);
    assert.deepEqual(intersectAllowlists(["a", "b"], ["b", "c"]), ["b"]);
    assert.deepEqual(intersectAllowlists(["a"], []), []);
    assert.equal(allowEmpty([]), true);
    assert.equal(allowEmpty(null), false);
  });
});
