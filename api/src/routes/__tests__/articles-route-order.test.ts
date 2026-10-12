/**
 * routes/articles.ts is a barrel over routes/articles/* (#2312 split). It
 * must keep the original registration order: `/public/id/:id` answers
 * before `/public/:userId/:slug` would treat "id" as an author ref.
 *
 * Run: node --import tsx --test src/routes/__tests__/articles-route-order.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { articleRoutes } from "../articles.js";

describe("article route order", () => {
  it("/public/id/:id is handled by the by-id route (rejects a non-UUID before any DB read)", async () => {
    const res = await articleRoutes.request("/public/id/not-a-uuid");
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error?: { code?: string } };
    assert.equal(body.error?.code, "NOT_FOUND");
  });
});
