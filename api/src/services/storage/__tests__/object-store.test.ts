/**
 * #733 — `putObject` is the one R2 write path and records an
 * `uploaded_assets` row for every user-owned object it stores.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createObjectStore } from "../object-store.js";
import type { AssetRecord } from "../asset-record.js";
import { PROJECT_ID, USER_ID, pngHeader } from "./fixtures.js";

interface PutCall {
  key: string;
  contentType: string | undefined;
}

function fakeBucket(sizeOverride?: number) {
  const puts: PutCall[] = [];
  const bucket = {
    async put(
      key: string,
      body: ArrayBuffer | ArrayBufferView | string | ReadableStream,
      opts?: { httpMetadata?: { contentType?: string } },
    ) {
      puts.push({ key, contentType: opts?.httpMetadata?.contentType });
      const size =
        sizeOverride ??
        (typeof body === "string" ? body.length : body instanceof ReadableStream ? 0 : body.byteLength);
      return { key, size } as unknown as R2Object;
    },
  } as unknown as R2Bucket;
  return { bucket, puts };
}

function store(bucket: R2Bucket | undefined, recordAsset: (a: AssetRecord) => Promise<void>) {
  return createObjectStore({ getBucket: () => bucket, recordAsset });
}

describe("putObject records uploaded_assets (#733)", () => {
  it("stores an image upload and records owner, kind, bytes, dimensions and project", async () => {
    const { bucket, puts } = fakeBucket();
    const recorded: AssetRecord[] = [];
    const key = `uploads/${USER_ID}/images/0f1e2d3c.png`;
    const bytes = pngHeader(1920, 1080);

    const ok = await store(bucket, async (a) => void recorded.push(a)).putObject(
      key,
      bytes,
      "image/png",
      undefined,
      { sourceProjectId: PROJECT_ID },
    );

    assert.equal(ok, true);
    assert.deepEqual(puts, [{ key, contentType: "image/png" }]);
    assert.deepEqual(recorded, [
      {
        userId: USER_ID,
        r2Key: key,
        kind: "image",
        contentType: "image/png",
        sizeBytes: bytes.byteLength,
        width: 1920,
        height: 1080,
        sourceProjectId: PROJECT_ID,
      },
    ]);
  });

  it("uses the size R2 reports (streamed recording body)", async () => {
    const { bucket } = fakeBucket(7_340_032);
    const recorded: AssetRecord[] = [];
    const key = `studio/recordings/${USER_ID}/1760000000000-recording.webm`;
    const stream = new ReadableStream({ start: (c) => c.close() });

    await store(bucket, async (a) => void recorded.push(a)).putObject(key, stream, "video/webm");

    assert.equal(recorded.length, 1);
    assert.equal(recorded[0]!.kind, "recording");
    assert.equal(recorded[0]!.sizeBytes, 7_340_032);
    assert.equal(recorded[0]!.width, null);
  });

  it("stores but records nothing for a key with no user owner", async () => {
    const { bucket, puts } = fakeBucket();
    let calls = 0;
    const ok = await store(bucket, async () => {
      calls += 1;
    }).putObject("workforce/docs/company-1/doc-1/offer.pdf", new Uint8Array(512), "application/pdf");
    assert.equal(ok, true);
    assert.equal(puts.length, 1);
    assert.equal(calls, 0);
  });

  it("keeps the upload when the DB record fails", async () => {
    const { bucket, puts } = fakeBucket();
    const ok = await store(bucket, async () => {
      throw new Error('relation "uploaded_assets" does not exist');
    }).putObject(`uploads/${USER_ID}/files/song.wav`, new Uint8Array(1024), "audio/wav");
    assert.equal(ok, true);
    assert.equal(puts.length, 1);
  });

  it("returns false and records nothing without an R2 binding", async () => {
    let calls = 0;
    const ok = await store(undefined, async () => {
      calls += 1;
    }).putObject(`uploads/${USER_ID}/images/a.png`, pngHeader(10, 10), "image/png");
    assert.equal(ok, false);
    assert.equal(calls, 0);
  });
});
