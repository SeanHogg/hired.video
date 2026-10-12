/**
 * Tests for the Zod schemas in `articles.ts` — schema-test backfill for the
 * PRIORITY slice of gap #1528.
 *
 * The schemas are imported from the article sub-routers (routes/articles/*,
 * split out of articles.ts in #2312), so these tests run against the real
 * validators. `ARTICLE_KINDS` and `UuidLikeSchema` come from their sources.
 *
 * `OptInSchema` carries `UuidLikeSchema` id fields (legalDocsAccepted /
 * proSubscriptionId reference DB rows), so the #1522 seed-derived-UUID
 * regression is exercised there.
 *
 * Run: node --import tsx --test src/routes/__tests__/articles-schemas.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ARTICLE_KINDS } from "../../db/schema/articles.js";
import {
  SEED_DERIVED_UUID,
  V4_UUID,
} from "../../../../shared/__tests__/uuid-fixtures.js";

// The real schemas, exported by the article sub-routers (routes/articles/,
// split in #2312) — no more verbatim mirrors to keep in sync.
import { KindSchema, CreateArticleSchema, UpdateArticleSchema } from "../articles/shared.js";
import { CreateArticleVersionSchema } from "../articles/versions.js";
import { ReadProgressSchema, ClapSchema, ShareSchema } from "../articles/engagement.js";
import { OptInSchema } from "../articles/partner-program.js";

describe("KindSchema", () => {
  it("accepts each ARTICLE_KINDS value", () => {
    for (const kind of ARTICLE_KINDS) {
      assert.equal(KindSchema.safeParse(kind).success, true, `kind '${kind}'`);
    }
  });
  it("rejects an unknown kind (enum edge)", () => {
    assert.equal(KindSchema.safeParse("blog").success, false);
  });
});

describe("CreateArticleSchema", () => {
  // Happy path
  it("accepts a title-only payload and defaults bodyMd to ''", () => {
    const r = CreateArticleSchema.safeParse({ title: "Hello" });
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data.bodyMd, "");
  });
  it("accepts a fully-populated payload", () => {
    const r = CreateArticleSchema.safeParse({
      title: "Full",
      bodyMd: "# heading",
      bodyJson: { type: "doc" },
      summary: "a summary",
      coverImageUrl: "https://example.com/x.png",
      category: "career",
      tags: ["a", "b"],
      kind: "guide",
      sector: "tech",
      audience: "students",
    });
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data.kind, "guide");
  });

  // Boundary — title length
  it("accepts a 1-char title (min boundary)", () => {
    assert.equal(CreateArticleSchema.safeParse({ title: "x" }).success, true);
  });
  it("rejects an empty title (below min)", () => {
    assert.equal(CreateArticleSchema.safeParse({ title: "" }).success, false);
  });
  it("accepts a 255-char title (max boundary)", () => {
    assert.equal(
      CreateArticleSchema.safeParse({ title: "t".repeat(255) }).success,
      true,
    );
  });
  it("rejects a 256-char title (above max)", () => {
    assert.equal(
      CreateArticleSchema.safeParse({ title: "t".repeat(256) }).success,
      false,
    );
  });

  // Boundary — summary / tags
  it("accepts a 1000-char summary (max boundary)", () => {
    assert.equal(
      CreateArticleSchema.safeParse({ title: "x", summary: "s".repeat(1000) }).success,
      true,
    );
  });
  it("rejects a 1001-char summary (above max)", () => {
    assert.equal(
      CreateArticleSchema.safeParse({ title: "x", summary: "s".repeat(1001) }).success,
      false,
    );
  });
  it("accepts up to 20 tags (max boundary)", () => {
    assert.equal(
      CreateArticleSchema.safeParse({ title: "x", tags: Array(20).fill("t") }).success,
      true,
    );
  });
  it("rejects 21 tags (above max)", () => {
    assert.equal(
      CreateArticleSchema.safeParse({ title: "x", tags: Array(21).fill("t") }).success,
      false,
    );
  });
  it("rejects a tag over 60 chars (per-item max)", () => {
    assert.equal(
      CreateArticleSchema.safeParse({ title: "x", tags: ["t".repeat(61)] }).success,
      false,
    );
  });

  // Exception
  it("rejects a missing title (required field)", () => {
    assert.equal(CreateArticleSchema.safeParse({}).success, false);
  });
  it("rejects a non-string title (wrong type)", () => {
    assert.equal(CreateArticleSchema.safeParse({ title: 42 }).success, false);
  });
  it("rejects a non-URL coverImageUrl", () => {
    assert.equal(
      CreateArticleSchema.safeParse({ title: "x", coverImageUrl: "not-a-url" }).success,
      false,
    );
  });
  it("rejects an unknown kind (enum edge)", () => {
    assert.equal(
      CreateArticleSchema.safeParse({ title: "x", kind: "blog" }).success,
      false,
    );
  });
});

describe("UpdateArticleSchema", () => {
  // Happy path — partial, so empty is valid.
  it("accepts an empty payload (all fields optional)", () => {
    assert.equal(UpdateArticleSchema.safeParse({}).success, true);
  });
  it("accepts a title-only edit", () => {
    assert.equal(UpdateArticleSchema.safeParse({ title: "New" }).success, true);
  });
  it("accepts a valid slug", () => {
    assert.equal(
      UpdateArticleSchema.safeParse({ slug: "my-article-1" }).success,
      true,
    );
  });

  // Boundary — slug
  it("accepts an 80-char slug (max boundary)", () => {
    assert.equal(
      UpdateArticleSchema.safeParse({ slug: "a".repeat(80) }).success,
      true,
    );
  });
  it("rejects an 81-char slug (above max)", () => {
    assert.equal(
      UpdateArticleSchema.safeParse({ slug: "a".repeat(81) }).success,
      false,
    );
  });

  // Exception
  it("rejects a slug with uppercase / spaces (regex)", () => {
    assert.equal(UpdateArticleSchema.safeParse({ slug: "My Slug" }).success, false);
  });
  it("rejects an empty title when present (inherits min(1))", () => {
    assert.equal(UpdateArticleSchema.safeParse({ title: "" }).success, false);
  });
});

describe("CreateArticleVersionSchema", () => {
  it("accepts an empty payload (all fields optional)", () => {
    assert.equal(CreateArticleVersionSchema.safeParse({}).success, true);
  });
  it("accepts label + isAutosave", () => {
    assert.equal(
      CreateArticleVersionSchema.safeParse({ label: "v1", isAutosave: true }).success,
      true,
    );
  });
  it("accepts a 120-char label (max boundary)", () => {
    assert.equal(
      CreateArticleVersionSchema.safeParse({ label: "l".repeat(120) }).success,
      true,
    );
  });
  it("rejects a 121-char label (above max)", () => {
    assert.equal(
      CreateArticleVersionSchema.safeParse({ label: "l".repeat(121) }).success,
      false,
    );
  });
  it("rejects a non-boolean isAutosave (wrong type)", () => {
    assert.equal(
      CreateArticleVersionSchema.safeParse({ isAutosave: "yes" }).success,
      false,
    );
  });
});

describe("ReadProgressSchema", () => {
  it("accepts seconds only and defaults source to 'scroll'", () => {
    const r = ReadProgressSchema.safeParse({ seconds: 30 });
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data.source, "scroll");
  });
  it("accepts an explicit narrator source", () => {
    assert.equal(
      ReadProgressSchema.safeParse({ seconds: 30, source: "narrator" }).success,
      true,
    );
  });
  it("accepts seconds=1 (min boundary)", () => {
    assert.equal(ReadProgressSchema.safeParse({ seconds: 1 }).success, true);
  });
  it("accepts seconds=600 (max boundary)", () => {
    assert.equal(ReadProgressSchema.safeParse({ seconds: 600 }).success, true);
  });
  it("rejects seconds=0 (below min)", () => {
    assert.equal(ReadProgressSchema.safeParse({ seconds: 0 }).success, false);
  });
  it("rejects seconds=601 (above max)", () => {
    assert.equal(ReadProgressSchema.safeParse({ seconds: 601 }).success, false);
  });
  it("rejects a missing seconds (required field)", () => {
    assert.equal(ReadProgressSchema.safeParse({}).success, false);
  });
  it("rejects an unknown source (enum edge)", () => {
    assert.equal(
      ReadProgressSchema.safeParse({ seconds: 30, source: "audio" }).success,
      false,
    );
  });
});

describe("ClapSchema", () => {
  it("accepts delta=1 (min boundary)", () => {
    assert.equal(ClapSchema.safeParse({ delta: 1 }).success, true);
  });
  it("accepts delta=50 (max boundary)", () => {
    assert.equal(ClapSchema.safeParse({ delta: 50 }).success, true);
  });
  it("rejects delta=0 (below min)", () => {
    assert.equal(ClapSchema.safeParse({ delta: 0 }).success, false);
  });
  it("rejects delta=51 (above max)", () => {
    assert.equal(ClapSchema.safeParse({ delta: 51 }).success, false);
  });
  it("rejects a non-integer delta", () => {
    assert.equal(ClapSchema.safeParse({ delta: 2.5 }).success, false);
  });
  it("rejects a missing delta (required field)", () => {
    assert.equal(ClapSchema.safeParse({}).success, false);
  });
});

describe("ShareSchema", () => {
  it("accepts each valid channel", () => {
    for (const channel of ["twitter", "linkedin", "email", "copy_link", "rss"]) {
      assert.equal(ShareSchema.safeParse({ channel }).success, true, channel);
    }
  });
  it("rejects an unknown channel (enum edge)", () => {
    assert.equal(ShareSchema.safeParse({ channel: "facebook" }).success, false);
  });
  it("rejects a missing channel (required field)", () => {
    assert.equal(ShareSchema.safeParse({}).success, false);
  });
});

describe("OptInSchema", () => {
  it("accepts an empty payload and defaults legalDocsAccepted to []", () => {
    const r = OptInSchema.safeParse({});
    assert.equal(r.success, true);
    if (r.success) assert.deepEqual(r.data.legalDocsAccepted, []);
  });
  it("accepts v4 UUIDs in legalDocsAccepted + proSubscriptionId", () => {
    assert.equal(
      OptInSchema.safeParse({
        legalDocsAccepted: [V4_UUID],
        proSubscriptionId: V4_UUID,
      }).success,
      true,
    );
  });
  it("accepts seed-derived UUIDs (gap #1522 regression)", () => {
    assert.equal(
      OptInSchema.safeParse({
        legalDocsAccepted: [SEED_DERIVED_UUID],
        proSubscriptionId: SEED_DERIVED_UUID,
      }).success,
      true,
    );
  });
  it("rejects a malformed UUID in legalDocsAccepted", () => {
    assert.equal(
      OptInSchema.safeParse({ legalDocsAccepted: ["not-a-uuid"] }).success,
      false,
    );
  });
  it("rejects a malformed proSubscriptionId", () => {
    assert.equal(
      OptInSchema.safeParse({ proSubscriptionId: "bad" }).success,
      false,
    );
  });
});
