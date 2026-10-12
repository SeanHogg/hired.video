/**
 * StudioTemplateLicensesService — the ONE license path for every creator
 * template, résumé templates included (they are studio templates with
 * document_kind 'resume', granted as ('studio', <id>)). Uses an in-memory
 * repository with rows shaped like real `studio_templates` /
 * `template_licenses` rows, including a résumé template 0520 copied from
 * `resume_templates` (id + slug preserved).
 *
 * Run: node --import tsx --test src/services/studio/__tests__/studio-template-licenses.test.ts
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { StudioTemplateLicensesService } from "../StudioTemplateLicensesService.js";
import { StudioTemplatesError } from "../studioTemplatesErrors.js";
import type {
  IStudioTemplatesRepository,
  StudioTemplateRow,
  TemplateLicenseInsert,
  TemplateLicenseRow,
} from "../../../repositories/index.js";

const BUYER = "8c7b6a59-4e3d-4c2b-9a18-07f6e5d4c3b2";
const CREATOR = "3b9f0c1e-7d2a-4f5b-8e6c-1a2b3c4d5e6f";
const at = new Date("2026-03-02T17:04:11.000Z");

function template(p: Partial<StudioTemplateRow> & Pick<StudioTemplateRow, "id" | "name">): StudioTemplateRow {
  return {
    creatorId: CREATOR,
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
    consentAgreedAt: at,
    consentIp: null,
    consentUa: null,
    viewCount: 0,
    purchaseCount: 0,
    publishedAt: at,
    createdAt: at,
    updatedAt: at,
    ...p,
  };
}

/** A legacy résumé template as 0520 leaves it. */
const resumeTemplate = template({
  id: "6f1c2a9e-0b7d-4e7a-9a51-3c2d1e0f9a88",
  name: "Clinical Blue, two column",
  mediaKind: "document",
  documentKind: "resume",
  listingSlug: "clinical-blue-two-column-3fa9c1d2",
  priceCents: 299,
  platformFeeBps: 1000,
  videoScript: { entityKind: "resume", entityId: null, templateId: "healthcare-clinical-blue", pages: [] },
});

const freeResumeTemplate = template({
  id: "b2c4e6a8-1d3f-4b5a-9c7e-0f2a4c6e8a1b",
  name: "Plain one page",
  mediaKind: "document",
  documentKind: "resume",
  listingSlug: "plain-one-page-b2c4e6a8",
});

const privateTemplate = template({
  id: "0d8e1c55-2f6a-4b1e-8c3d-6a7b9e0f1a2b",
  name: "Draft reel",
  visibility: "private",
});

type RepoSlice = Pick<
  IStudioTemplatesRepository,
  | "findById"
  | "findBySlug"
  | "findLicense"
  | "insertLicense"
  | "incrementPurchaseCount"
  | "findLicensesForUser"
  | "findLicensedStudioTemplatesForUser"
>;

class FakeRepo implements RepoSlice {
  licenses: TemplateLicenseRow[] = [];
  purchaseCounts = new Map<string, number>();
  constructor(private readonly templates: StudioTemplateRow[]) {}
  async findById(id: string) {
    return this.templates.find((t) => t.id === id) ?? null;
  }
  async findBySlug(slug: string) {
    return this.templates.find((t) => t.listingSlug === slug) ?? null;
  }
  async findLicense(userId: string, kind: string, templateId: string) {
    return this.licenses.find((l) => l.userId === userId && l.templateKind === kind && l.templateId === templateId) ?? null;
  }
  async insertLicense(input: TemplateLicenseInsert) {
    if (await this.findLicense(input.userId, input.templateKind, input.templateId)) return null;
    const row: TemplateLicenseRow = {
      id: `lic-${this.licenses.length + 1}`,
      userId: input.userId,
      templateKind: input.templateKind,
      templateId: input.templateId,
      source: input.source,
      pricePaidCents: input.pricePaidCents ?? 0,
      creatorCutCents: input.creatorCutCents ?? 0,
      platformCutCents: input.platformCutCents ?? 0,
      paymentRef: input.paymentRef ?? null,
      grantedAt: at,
    };
    this.licenses.push(row);
    return row;
  }
  async incrementPurchaseCount(id: string) {
    this.purchaseCounts.set(id, (this.purchaseCounts.get(id) ?? 0) + 1);
  }
  async findLicensesForUser(userId: string) {
    return this.licenses.filter((l) => l.userId === userId);
  }
  async findLicensedStudioTemplatesForUser() {
    return [];
  }
}

let repo: FakeRepo;
let svc: StudioTemplateLicensesService;

beforeEach(() => {
  repo = new FakeRepo([resumeTemplate, freeResumeTemplate, privateTemplate]);
  svc = new StudioTemplateLicensesService({ repos: { studioTemplates: repo as unknown as IStudioTemplatesRepository } });
});

const isCode = (code: string) => (err: unknown) => err instanceof StudioTemplatesError && err.code === code;

describe("grantPurchase", () => {
  it("records a résumé template purchase as ('studio', id) with the listing's fee split", async () => {
    const lic = await svc.grantPurchase({
      userId: BUYER,
      kind: "studio",
      templateId: resumeTemplate.id,
      pricePaidCents: 299,
      paymentRef: "pi_3QxYz",
    });
    assert.equal(lic.templateKind, "studio");
    assert.equal(lic.templateId, resumeTemplate.id);
    assert.equal(lic.platformCutCents, 30); // 10% of 299, rounded
    assert.equal(lic.creatorCutCents, 269);
    assert.equal(lic.paymentRef, "pi_3QxYz");
    assert.equal(repo.purchaseCounts.get(resumeTemplate.id), 1);
  });

  it("resolves an older cart's listing slug to the canonical id", async () => {
    const lic = await svc.grantPurchase({
      userId: BUYER,
      kind: "studio",
      templateId: "clinical-blue-two-column-3fa9c1d2",
      pricePaidCents: 299,
    });
    assert.equal(lic.templateId, resumeTemplate.id);
  });

  it("is idempotent — a second fulfilment returns the first grant", async () => {
    const first = await svc.grantPurchase({ userId: BUYER, kind: "studio", templateId: resumeTemplate.id, pricePaidCents: 299 });
    const again = await svc.grantPurchase({
      userId: BUYER,
      kind: "studio",
      templateId: "clinical-blue-two-column-3fa9c1d2",
      pricePaidCents: 299,
    });
    assert.equal(again.id, first.id);
    assert.equal(repo.licenses.length, 1);
    assert.equal(repo.purchaseCounts.get(resumeTemplate.id), 1);
  });

  it("rejects a studio grant for a template that does not exist", async () => {
    await assert.rejects(
      svc.grantPurchase({ userId: BUYER, kind: "studio", templateId: "no-such-template", pricePaidCents: 100 }),
      isCode("NOT_FOUND"),
    );
  });
});

describe("claimFree", () => {
  it("grants a free public résumé template under 'studio'", async () => {
    const lic = await svc.claimFree(BUYER, freeResumeTemplate.id);
    assert.deepEqual([lic.templateKind, lic.templateId, lic.source], ["studio", freeResumeTemplate.id, "free"]);
    assert.equal(await svc.hasLicense(BUYER, "studio", freeResumeTemplate.id), true);
  });

  it("refuses a paid template and a private one", async () => {
    await assert.rejects(svc.claimFree(BUYER, resumeTemplate.id), isCode("VALIDATION_ERROR"));
    await assert.rejects(svc.claimFree(BUYER, privateTemplate.id), isCode("FORBIDDEN"));
  });
});
