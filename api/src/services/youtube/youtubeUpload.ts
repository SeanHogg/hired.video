/**
 * YouTube Data API v3 multipart upload.
 *
 * Pure HTTP. Caller supplies the access token + the binary; this module
 * builds the `multipart/related` body and POSTs to the upload endpoint.
 * Splitting upload from auth lets us test the body construction without
 * standing up an OAuth fixture, and lets us swap to resumable uploads
 * later by adding a new exported function rather than editing this one.
 */

const UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status";

export interface YouTubeUploadMetadata {
  title: string;
  description: string;
  privacy: "public" | "private" | "unlisted";
  tags?: string[];
}

export interface YouTubeUploadResult {
  youtubeVideoId: string;
  youtubeUrl: string;
}

export class YouTubeUploadError extends Error {
  constructor(public readonly providerStatus: number, public readonly providerBody: string) {
    super(`YouTube upload failed: ${providerStatus} ${providerBody.slice(0, 500)}`);
    this.name = "YouTubeUploadError";
  }
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

/**
 * Upload a compiled MP4 to YouTube. Throws `YouTubeUploadError` on a
 * non-2xx response so the route handler can surface the provider message
 * without mistaking it for an internal error.
 */
export async function uploadVideo(
  accessToken: string,
  meta: YouTubeUploadMetadata,
  mediaBytes: Uint8Array,
): Promise<YouTubeUploadResult> {
  const { body, contentType } = buildMultipartBody(meta, mediaBytes);

  const res = await fetch(UPLOAD_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      "Content-Type": contentType,
    },
    body,
  });

  if (!res.ok) {
    throw new YouTubeUploadError(res.status, await res.text());
  }

  const uploaded = await res.json() as { id: string };
  return {
    youtubeVideoId: uploaded.id,
    youtubeUrl:     `https://www.youtube.com/watch?v=${uploaded.id}`,
  };
}
