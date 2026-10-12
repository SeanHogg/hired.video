/**
 * Review subjects for templates: `resume_template` and `video_template`
 * both name a studio template (mig 0520 moved résumé templates there, ids
 * preserved), so one lookup answers owner + buyer for both.
 *
 * Run: node --import tsx --test src/services/reviews/__tests__/template-review-subject.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveTemplateReviewSubject } from "../templateReviewSubject.js";
import type { StudioTemplateRow, TemplateLicenseRow } from "../../../repositories/index.js";

const TEMPLATE_ID = "6f1c2a9e-0b7d-4e7a-9a51-3c2d1e0f9a88";
const CREATOR = "3b9f0c1e-7d2a-4f5b-8e6c-1a2b3c4d5e6f";
const BUYER = "8c7b6a59-4e3d-4c2b-9a18-07f6e5d4c3b2";
const STRANGER = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

const repo = {
  async findById(id: string) {
    return id === TEMPLATE_ID ? ({ id, creatorId: CREATOR, documentKind: "resume" } as StudioTemplateRow) : null;
  },
  async findLicense(userId: string, kind: string, templateId: string) {
    return userId === BUYER && kind === "studio" && templateId === TEMPLATE_ID
      ? ({ userId, templateKind: kind, templateId, source: "purchase" } as TemplateLicenseRow)
      : null;
  },
};

describe("resolveTemplateReviewSubject", () => {
  it("owner = creator, buyer = a reviewer holding a 'studio' license", async () => {
    assert.deepEqual(await resolveTemplateReviewSubject(repo, TEMPLATE_ID, BUYER), {
      ownerId: CREATOR,
      buyerId: BUYER,
      verifyAgainst: {},
    });
  });

  it("leaves buyerId unset for a reviewer without a license", async () => {
    const subject = await resolveTemplateReviewSubject(repo, TEMPLATE_ID, STRANGER);
    assert.equal(subject?.ownerId, CREATOR);
    assert.equal(subject?.buyerId, undefined);
  });

  it("is null for a missing template or a built-in preset slug", async () => {
    assert.equal(await resolveTemplateReviewSubject(repo, "0d8e1c55-2f6a-4b1e-8c3d-6a7b9e0f1a2b", BUYER), null);
    assert.equal(await resolveTemplateReviewSubject(repo, "hired-default", BUYER), null);
  });
});
