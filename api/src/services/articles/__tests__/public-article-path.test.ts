/**
 * Public article path by id (#2312): what a studio linked-content card's
 * link resolves to. Published + verified + visible → `/articles/<author
 * ref>/<slug>` (vanity slug first, else the user id); anything else → null.
 *
 * Run: node --import tsx --test src/services/articles/__tests__/public-article-path.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Db } from "../../../db/index.js";
import { publicArticlePathById } from "../public-article-path.js";

const AUTHOR_ID = "6f1c2a9e-3b4d-4e8f-9a0b-1c2d3e4f5a6b";

/** A Drizzle-shaped select chain that resolves to `rows`. */
function fakeDb(rows: Array<{ slug: string | null; authorId: string; customUrlSlug: string | null }>): Db {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    limit: async () => rows,
  };
  return { select: () => chain } as unknown as Db;
}

const visible = async () => true;

describe("publicArticlePathById", () => {
  it("uses the author's vanity slug when set", async () => {
    const db = fakeDb([{ slug: "how-i-landed-a-staff-role", authorId: AUTHOR_ID, customUrlSlug: "maria-alvarez" }]);
    assert.equal(await publicArticlePathById(db, randomUUID(), visible), "/articles/maria-alvarez/how-i-landed-a-staff-role");
  });

  it("falls back to the author's user id", async () => {
    const db = fakeDb([{ slug: "portfolio-review-checklist", authorId: AUTHOR_ID, customUrlSlug: null }]);
    assert.equal(await publicArticlePathById(db, randomUUID(), visible), `/articles/${AUTHOR_ID}/portfolio-review-checklist`);
  });

  it("is null for an unpublished / missing article or a hidden creator", async () => {
    assert.equal(await publicArticlePathById(fakeDb([]), randomUUID(), visible), null);
    const db = fakeDb([{ slug: "draft-notes", authorId: AUTHOR_ID, customUrlSlug: null }]);
    assert.equal(await publicArticlePathById(db, randomUUID(), async () => false), null);
  });
});
