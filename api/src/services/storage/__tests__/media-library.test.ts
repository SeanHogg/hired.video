/**
 * #950 — the media library page over uploaded_assets: keyset cursor,
 * clamped page size, kind selection and the one-time pre-0512 backfill.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clampAssetLimit, kindsForQuery, loadAssetPage, type MediaLibraryDeps } from "../media-library.js";
import {
  IMAGE_ASSET_KINDS,
  decodeAssetCursor,
  encodeAssetCursor,
  type UploadedAssetKind,
} from "../../../../../shared/uploaded-assets.js";
import type { UploadedAssetRow } from "../../../db/schema/uploadedAssets.js";
import type { AssetPageQuery } from "../../../repositories/uploadedAssetsRepository.js";
import type { AssetRecord } from "../asset-record.js";
import { USER_ID } from "./fixtures.js";

/** Rows shaped like production: newest first, ms timestamps, real uuids. */
function rows(n: number, startMs = Date.UTC(2026, 9, 10, 12, 0, 0)): UploadedAssetRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(1000 - i).padStart(12, "0")}`,
    userId: USER_ID,
    r2Key: `uploads/${USER_ID}/images/${i}.png`,
    kind: i % 3 === 0 ? "ai_image" : "image",
    contentType: "image/png",
    sizeBytes: 250_000 + i,
    width: 1024,
    height: 768,
    sourceProjectId: null,
    createdAt: new Date(startMs - i * 60_000),
  }));
}

function fakeRepo(data: UploadedAssetRow[]) {
  const queries: AssetPageQuery[] = [];
  const inserted: Array<AssetRecord & { createdAt?: Date }> = [];
  const repo: MediaLibraryDeps["repo"] = {
    async listPage(q) {
      queries.push(q);
      const after = q.after;
      const filtered = data.filter(
        (r) =>
          q.kinds.includes(r.kind as UploadedAssetKind) &&
          (!after || r.createdAt < after.createdAt || (+r.createdAt === +after.createdAt && r.id < after.id)),
      );
      return filtered.slice(0, q.limit + 1);
    },
    async recordManyIfAbsent(assets) {
      inserted.push(...assets);
      for (const a of assets) {
        data.push({
          id: `00000000-0000-4000-8000-${String(data.length).padStart(12, "0")}`,
          userId: a.userId,
          r2Key: a.r2Key,
          kind: a.kind,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
          width: a.width,
          height: a.height,
          sourceProjectId: a.sourceProjectId,
          createdAt: a.createdAt ?? new Date(),
        });
      }
    },
  };
  return { repo, queries, inserted };
}

describe("loadAssetPage", () => {
  it("returns a page plus a cursor that continues exactly after its last item", async () => {
    const data = rows(5);
    const { repo, queries } = fakeRepo(data);

    const first = await loadAssetPage({ repo }, { userId: USER_ID, kinds: IMAGE_ASSET_KINDS, limit: 2 });
    assert.deepEqual(first.items.map((i) => i.key), [data[0]!.r2Key, data[1]!.r2Key]);
    assert.ok(first.nextCursor);
    assert.deepEqual(decodeAssetCursor(first.nextCursor), { createdAt: data[1]!.createdAt, id: data[1]!.id });

    const second = await loadAssetPage(
      { repo },
      { userId: USER_ID, kinds: IMAGE_ASSET_KINDS, limit: 2, cursor: first.nextCursor },
    );
    assert.deepEqual(second.items.map((i) => i.key), [data[2]!.r2Key, data[3]!.r2Key]);
    assert.equal(queries[1]!.after?.id, data[1]!.id);

    const last = await loadAssetPage(
      { repo },
      { userId: USER_ID, kinds: IMAGE_ASSET_KINDS, limit: 2, cursor: second.nextCursor },
    );
    assert.deepEqual(last.items.map((i) => i.key), [data[4]!.r2Key]);
    assert.equal(last.nextCursor, null);
  });

  it("boundary: a page exactly the size of the remainder has no next cursor", async () => {
    const { repo } = fakeRepo(rows(2));
    const page = await loadAssetPage({ repo }, { userId: USER_ID, kinds: IMAGE_ASSET_KINDS, limit: 2 });
    assert.equal(page.items.length, 2);
    assert.equal(page.nextCursor, null);
  });

  it("maps rows to library items with a CDN url and ISO date", async () => {
    const { repo } = fakeRepo(rows(1));
    const { items } = await loadAssetPage({ repo }, { userId: USER_ID, kinds: IMAGE_ASSET_KINDS, limit: 10 });
    assert.equal(items[0]!.kind, "ai_image");
    assert.equal(items[0]!.width, 1024);
    assert.equal(items[0]!.uploadedAt, "2026-10-10T12:00:00.000Z");
    assert.ok(items[0]!.url.endsWith(`uploads/${USER_ID}/images/0.png`), items[0]!.url);
  });

  it("treats a tampered cursor as the first page", async () => {
    const { repo, queries } = fakeRepo(rows(3));
    await loadAssetPage(
      { repo },
      { userId: USER_ID, kinds: IMAGE_ASSET_KINDS, limit: 2, cursor: "bm90LWEtY3Vyc29y" },
    );
    assert.equal(queries[0]!.after, null);
  });

  it("backfills pre-0512 R2 images once when the first page is empty", async () => {
    const { repo, inserted } = fakeRepo([]);
    let listed = 0;
    const listLegacy: MediaLibraryDeps["listLegacy"] = async (userId) => {
      listed += 1;
      return [
        {
          userId,
          r2Key: `uploads/${userId}/images/legacy.png`,
          kind: "image",
          contentType: "image/png",
          sizeBytes: 4096,
          width: null,
          height: null,
          sourceProjectId: null,
          createdAt: new Date(Date.UTC(2026, 4, 16)),
        },
      ];
    };
    const page = await loadAssetPage({ repo, listLegacy }, { userId: USER_ID, kinds: IMAGE_ASSET_KINDS, limit: 10 });
    assert.equal(listed, 1);
    assert.equal(inserted.length, 1);
    assert.deepEqual(page.items.map((i) => i.key), [`uploads/${USER_ID}/images/legacy.png`]);

    // Rows exist now, so the R2 list never runs again.
    await loadAssetPage({ repo, listLegacy }, { userId: USER_ID, kinds: IMAGE_ASSET_KINDS, limit: 10 });
    assert.equal(listed, 1);
  });

  it("does not backfill on a later page", async () => {
    const { repo } = fakeRepo([]);
    let listed = 0;
    const cursor = encodeAssetCursor(new Date(Date.UTC(2026, 9, 1)), "00000000-0000-4000-8000-000000000001");
    await loadAssetPage(
      {
        repo,
        listLegacy: async () => {
          listed += 1;
          return [];
        },
      },
      { userId: USER_ID, kinds: IMAGE_ASSET_KINDS, limit: 10, cursor },
    );
    assert.equal(listed, 0);
  });
});

describe("query parsing", () => {
  it("clamps the page size", () => {
    assert.equal(clampAssetLimit(undefined), 40);
    assert.equal(clampAssetLimit("0"), 40);
    assert.equal(clampAssetLimit("-5"), 40);
    assert.equal(clampAssetLimit("25"), 25);
    assert.equal(clampAssetLimit("100"), 100);
    assert.equal(clampAssetLimit("5000"), 100);
  });

  it("selects kinds: images by default, one valid kind, else images", () => {
    assert.deepEqual(kindsForQuery(undefined), IMAGE_ASSET_KINDS);
    assert.deepEqual(kindsForQuery("images"), IMAGE_ASSET_KINDS);
    assert.deepEqual(kindsForQuery("audio"), ["audio"]);
    assert.deepEqual(kindsForQuery("drop table uploaded_assets"), IMAGE_ASSET_KINDS);
  });
});
