/**
 * PageEmbedService tests (#1867 residual).
 *
 * The service takes its `db` by constructor injection, so we drive it
 * with a tiny chainable Drizzle stub: every query-builder method returns
 * the same thenable, and awaiting it resolves the next queued result row
 * set (in statement order). This pins the PROJECTION logic — r2Key →
 * cdnUrl, Date → ISO string, null-video fallback, owner fallback — which
 * is the part worth testing; the SQL itself is Drizzle's concern.
 *
 * Run: node --import tsx --test src/services/studio/__tests__/page-embed-service.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PageEmbedService } from "../page-embed-service.js";
import { cdnUrl } from "../../../utils/cdn.js";

type DbLike = ConstructorParameters<typeof PageEmbedService>[0];

/** A chainable Drizzle stub. `results` are returned, in order, one per
 *  awaited statement. Any builder method (`select`, `from`, `where`,
 *  `limit`, `insert`, `onConflictDoUpdate`, `returning`, …) returns the
 *  same thenable. */
function fakeDb(results: unknown[]): DbLike {
  let i = 0;
  const proxy: unknown = new Proxy(function () {} as object, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void) => resolve(results[i++]);
      }
      return () => proxy;
    },
    apply() {
      return proxy;
    },
  });
  return proxy as DbLike;
}

describe("PageEmbedService.resolveForPath()", () => {
  it("projects a joined row into the PublicVideo shape (cdnUrl + ISO date + owner)", async () => {
    const createdAt = new Date("2026-05-31T12:00:00.000Z");
    const svc = new PageEmbedService(
      fakeDb([
        [
          {
            placement: "hero",
            projectId: "proj-1",
            mediaKind: "video",
            projectCreatedAt: createdAt,
            ownerName: "Ada",
            videoTitle: "Pricing promo",
            r2Key: "studio/u/p/clip.mp4",
            thumbnailUrl: "https://cdn/thumb.png",
            youtubeVideoId: null,
          },
        ],
      ]),
    );
    const res = await svc.resolveForPath("/pricing");
    assert.ok(res);
    assert.equal(res!.placement, "hero");
    assert.equal(res!.video.id, "proj-1");
    assert.equal(res!.video.title, "Pricing promo");
    assert.equal(res!.video.ownerName, "Ada");
    assert.equal(res!.video.createdAt, createdAt.toISOString());
    // Real cdnUrl runs — assert it incorporates the key rather than the
    // exact domain (which is env-dependent).
    assert.equal(res!.video.videoUrl, cdnUrl("studio/u/p/clip.mp4"));
    assert.ok(res!.video.videoUrl?.includes("studio/u/p/clip.mp4"));
  });

  it("returns null when no active mapping exists for the path", async () => {
    const svc = new PageEmbedService(fakeDb([[]]));
    assert.equal(await svc.resolveForPath("/nope"), null);
  });

  it("leaves videoUrl null when the project isn't rendered, and falls back the owner name", async () => {
    const svc = new PageEmbedService(
      fakeDb([
        [
          {
            placement: "inline",
            projectId: "proj-2",
            mediaKind: "video",
            projectCreatedAt: "2026-05-31T00:00:00.000Z",
            ownerName: null,
            videoTitle: null,
            r2Key: null,
            thumbnailUrl: null,
            youtubeVideoId: null,
          },
        ],
      ]),
    );
    const res = await svc.resolveForPath("/x");
    assert.ok(res);
    assert.equal(res!.video.videoUrl, null);
    assert.equal(res!.video.title, "Video"); // fallback
    assert.equal(res!.video.ownerName, "hired.video"); // fallback
  });
});

describe("PageEmbedService.listActivePaths()", () => {
  it("returns just the active pathnames", async () => {
    const svc = new PageEmbedService(fakeDb([[{ pathname: "/pricing" }, { pathname: "/" }]]));
    assert.deepEqual(await svc.listActivePaths(), ["/pricing", "/"]);
  });
});

describe("PageEmbedService.unpublish()", () => {
  it("returns true when a row was flipped inactive, false when none matched", async () => {
    const ok = new PageEmbedService(fakeDb([[{ pathname: "/pricing" }]]));
    assert.equal(await ok.unpublish("/pricing"), true);
    const none = new PageEmbedService(fakeDb([[]]));
    assert.equal(await none.unpublish("/missing"), false);
  });
});
