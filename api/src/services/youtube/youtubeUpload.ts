/**
 * YouTube Data API v3 multipart body construction.
 *
 * Pure: builds the `multipart/related` body the upload endpoint expects.
 * The upload itself is the YouTube publisher adapter
 * (services/social/publishers/youtube.ts), behind the same port as every
 * other network; this module only frames the bytes so the body shape is
 * testable without a fetch.
 */

export interface YouTubeUploadMetadata {
  title: string;
  description: string;
  privacy: "public" | "private" | "unlisted";
  tags?: string[];
}

/**
 * Build the JSON snippet that YouTube expects in the metadata part of
 * the multipart upload. Exported so tests can assert truncation +
 * default-category behaviour without making a network call.
 */
export function buildSnippet(meta: YouTubeUploadMetadata): {
  snippet: { title: string; description: string; tags?: string[]; categoryId: string };
  status: { privacyStatus: "public" | "private" | "unlisted"; selfDeclaredMadeForKids: false };
} {
  return {
    snippet: {
      title:       meta.title.slice(0, 100),
      description: meta.description.slice(0, 5000),
      tags:        meta.tags?.slice(0, 15),
      categoryId:  "22", // "People & Blogs" — sane default for resume content
    },
    status: { privacyStatus: meta.privacy, selfDeclaredMadeForKids: false },
  };
}

/**
 * Construct the `multipart/related` body. Returns the body bytes and the
 * boundary string so the caller can set the matching Content-Type header.
 * Pure function — no fetch, no globals.
 */
export function buildMultipartBody(
  meta: YouTubeUploadMetadata,
  mediaBytes: Uint8Array,
  boundary: string = `--hv-yt-${crypto.randomUUID()}--`,
): { body: Uint8Array; boundary: string; contentType: string } {
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(buildSnippet(meta))}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: video/mp4\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);

  const body = new Uint8Array(head.length + mediaBytes.length + tail.length);
  body.set(head, 0);
  body.set(mediaBytes, head.length);
  body.set(tail, head.length + mediaBytes.length);

  return { body, boundary, contentType: `multipart/related; boundary=${boundary}` };
}
