/**
 * Read-then-bump counters collapsed to ONE statement each:
 *
 *   • ads.impressions        — serveAdImpression: UPDATE … WHERE id IN
 *                              (SELECT servable LIMIT 1) RETURNING creative
 *   • studio_ats_packages    — UPDATE … WHERE slug AND is_active RETURNING *
 *   • articles.view_count    — UPDATE … WHERE id AND status='published'
 *
 * The SQL is pinned via drizzle.mock (no Postgres); the use cases are driven
 * with fakes to prove there is no separate read and that "not found" still
 * maps to the same outcome.
 *
 * Run: node --import tsx --test src/repositories/__tests__/counter-bumps.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/neon-http";

import { schema, type Db } from "../../db/index.js";
import { buildServeAdImpression, type ServableAd } from "../adPromotionRepository.js";
import { buildActiveAtsPackageViewBump, type AtsPackageRow } from "../studioAtsPackagesRepository.js";
import { buildPublishedViewBump } from "../articleEngagementRepository.js";
import { serveAdForSlot } from "../../services/advertising/promotion.js";
import { viewAtsPackage } from "../../services/studio/ats-packages.js";
import { recordArticleView } from "../../services/articles/engagement.js";
import { DomainError } from "../../domains/errors.js";

const db = drizzle.mock({ schema }) as unknown as Db;
const ARTICLE = "11111111-1111-4111-8111-111111111111";

describe("ads.impressions — pick + count in one statement", () => {
  const { sql, params } = buildServeAdImpression(db, ["feed", "sidebar"]).toSQL();

  it("is a single UPDATE that bumps impressions and RETURNs the creative", () => {
    assert.match(sql, /^update "ads" set /);
    assert.match(sql, /"impressions" = "ads"\."impressions" \+ 1/);
    assert.match(sql, /"updated_at" = \$\d+/);
    assert.match(sql, /returning .*"headline".*"destination_url"/);
    assert.equal((sql.match(/update/g) ?? []).length, 1, "one statement, no separate read");
  });

  it("keeps the servable conditions (active ad, active ad set, placement) inside a LIMIT 1 subquery", () => {
    assert.match(sql, /where "ads"\."id" in \(select .*"id" from "ads" inner join "ad_sets"/);
    assert.match(sql, /"ads"\."status" = \$\d+/);
    assert.match(sql, /"ad_sets"\."status" = \$\d+/);
    assert.match(sql, /"ad_sets"\."placement_type" in \(\$\d+, \$\d+\)/);
    assert.match(sql, /limit [^)]+\)/);
    assert.ok(params.includes("active"));
    assert.ok(params.includes("feed") && params.includes("sidebar"));
  });

  it("serveAdForSlot makes exactly one repository call and passes the result through", async () => {
    const ad: ServableAd = {
      id: "ad-1",
      headline: "Hire faster",
      description: null,
      imageUrl: null,
      ctaText: "Try it",
      ctaUrl: null,
      destinationUrl: "https://hired.video",
    } as ServableAd;
    const calls: string[][] = [];
    const repo = {
      async serveAdImpression(placements: string[]) {
        calls.push(placements);
        return ad;
      },
    };
    assert.equal(await serveAdForSlot("feed", repo), ad);
    assert.equal(calls.length, 1);
    const none = { serveAdImpression: async () => null };
    assert.equal(await serveAdForSlot("feed", none), null);
  });
});

describe("studio_ats_packages.view_count — one UPDATE … RETURNING", () => {
  const { sql, params } = buildActiveAtsPackageViewBump(db, "ada-lovelace").toSQL();

  it("bumps only the ACTIVE package behind the slug and returns the row", () => {
    assert.match(sql, /^update "studio_ats_packages" set "view_count" = "studio_ats_packages"\."view_count" \+ 1/);
    assert.match(sql, /where \("studio_ats_packages"\."slug" = \$\d+ and "studio_ats_packages"\."is_active" = \$\d+\)/);
    assert.match(sql, /returning /);
    assert.ok(params.includes("ada-lovelace"));
    assert.ok(params.includes(true));
  });

  it("viewAtsPackage returns the bumped row (viewCount already includes the view)", async () => {
    const row = { id: "p1", slug: "ada", viewCount: 5 } as AtsPackageRow;
    const seen: string[] = [];
    const out = await viewAtsPackage("ada", async (slug) => {
      seen.push(slug);
      return row;
    });
    assert.equal(out.viewCount, 5);
    assert.deepEqual(seen, ["ada"]);
  });

  it("viewAtsPackage → 404 NOT_FOUND when no active package matched", async () => {
    await assert.rejects(viewAtsPackage("gone", async () => null), (e: unknown) => {
      return e instanceof DomainError && e.status === 404 && e.code === "NOT_FOUND";
    });
  });
});

describe("articles.view_count — published check inside the WHERE", () => {
  const { sql, params } = buildPublishedViewBump(db, ARTICLE).toSQL();

  it("is one UPDATE gated on id AND status = 'published'", () => {
    assert.match(sql, /^update "articles" set "view_count" = "articles"\."view_count" \+ 1/);
    assert.match(sql, /where \("articles"\."id" = \$\d+ and "articles"\."status" = \$\d+\)/);
    assert.match(sql, /returning .*"id"/);
    assert.ok(params.includes(ARTICLE));
    assert.ok(params.includes("published"));
  });

  it("recordArticleView makes one call; 404 when nothing was bumped", async () => {
    let calls = 0;
    await recordArticleView(ARTICLE, {
      async incrementPublishedViewCount() {
        calls++;
        return true;
      },
    });
    assert.equal(calls, 1);
    await assert.rejects(
      recordArticleView(ARTICLE, { incrementPublishedViewCount: async () => false }),
      (e: unknown) => e instanceof DomainError && e.status === 404,
    );
  });
});
