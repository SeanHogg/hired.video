import { Hono } from "hono";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { cdnUrl } from "../utils/cdn.js";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

const UploadSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
});


export const uploadRoutes = new Hono<{ Variables: Variables }>();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

function fail(code: string, message: string, details?: unknown) {
  return { success: false as const, error: { code, message, ...(details !== undefined ? { details } : {}) }, timestamp: new Date().toISOString() };
}

function fileExt(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}


/** POST /api/upload — upload a file to S3-compatible storage (avatars, documents, etc.) */
uploadRoutes.post("/", async (c) => {
  const user = c.var.user;

  const rawContentType = c.req.header("Content-Type") ?? "";
  const contentType = rawContentType.split(";")[0]?.trim() ?? "";
  const filename = c.req.header("X-Filename") ?? `upload-${Date.now()}`;

  const parsed = UploadSchema.safeParse({ filename, contentType });
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Missing required headers: X-Filename, Content-Type"), 400);
  }

  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return c.json(
      fail("VALIDATION_ERROR", `Content type '${contentType}' is not allowed`, { allowed: [...ALLOWED_CONTENT_TYPES] }),
      415,
    );
  }

  const body = await c.req.arrayBuffer();

  if (body.byteLength > MAX_FILE_SIZE_BYTES) {
    return c.json(
      fail("PAYLOAD_TOO_LARGE", `File size exceeds the ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB limit`),
      413,
    );
  }

  const extension = filename.includes(".") ? filename.split(".").pop() : "";
  const key = `uploads/${user.sub}/${crypto.randomUUID()}${extension ? `.${extension}` : ""}`;

  const bucket: R2Bucket | undefined = (globalThis as any).__ENV?.VIDEO_BUCKET;
  if (!bucket) return c.json(fail("INTERNAL_SERVER_ERROR", "Storage not configured"), 500);

  await bucket.put(key, body, { httpMetadata: { contentType } });

  return c.json(
    ok({ key, url: cdnUrl(key), contentType, size: body.byteLength }),
    201,
  );
});

/**
 * GET /api/upload/images — list the authenticated user's prior image
 * uploads (closed-loop interop, Consolidated Gap Register #933).
 *
 * Powers the MediaPicker "Library" tab + any consumer that wants to
 * surface a creator's prior assets without forcing a re-upload. Reads
 * directly from R2 under the user's `uploads/<userId>/images/` prefix
 * so every image landed via `POST /api/upload/image` (or via the
 * DrawingStage "Save to library" action) shows up here automatically
 * — no parallel `creator_assets` table needed for Phase 1.
 *
 * Per the DRY rule (`feedback_extract_on_duplication`): one prefix
 * convention, one list endpoint, every uploader writes to the prefix
 * and every consumer reads from this endpoint.
 *
 * Returns up to 100 most recent uploads, newest first (R2 stores
 * `uploaded` timestamps on every object).
 */
uploadRoutes.get("/images", async (c) => {
  const user = c.var.user;
  const bucket: R2Bucket | undefined = (globalThis as any).__ENV?.VIDEO_BUCKET;
  if (!bucket) return c.json(fail("INTERNAL_SERVER_ERROR", "Storage not configured"), 500);

  const listed = await bucket.list({
    prefix: `uploads/${user.sub}/images/`,
    limit: 100,
  });

  const items = listed.objects
    .slice()
    .sort((a, b) => +new Date(b.uploaded) - +new Date(a.uploaded))
    .map((obj) => ({
      key: obj.key,
      url: cdnUrl(obj.key),
      sizeBytes: obj.size,
      uploadedAt: new Date(obj.uploaded).toISOString(),
      contentType: obj.httpMetadata?.contentType ?? "image/png",
    }));

  return c.json(ok({ items, truncated: listed.truncated }));
});

/** POST /api/upload/image — multipart image upload used by company/profile UIs */
uploadRoutes.post("/image", async (c) => {
  const user = c.var.user;
  const form = await c.req.formData().catch(() => null);
  const part = (form?.get("file") ?? form?.get("avatar")) as File | null;

  if (!part || typeof part.arrayBuffer !== "function") {
    return c.json(fail("VALIDATION_ERROR", "Missing uploaded image file"), 400);
  }

  const contentType = part.type || "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    return c.json(fail("VALIDATION_ERROR", "Only image uploads are allowed on this endpoint"), 415);
  }

  const bytes = await part.arrayBuffer();
  const ext = fileExt(part.name || "image");
  const key = `uploads/${user.sub}/images/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;

  const bucket: R2Bucket | undefined = (globalThis as any).__ENV?.VIDEO_BUCKET;
  if (!bucket) {
    return c.json(fail("INTERNAL_SERVER_ERROR", "Storage not configured"), 500);
  }

  await bucket.put(key, bytes, { httpMetadata: { contentType } });

  return c.json(ok({ url: cdnUrl(key) }), 201);
});

/** POST /api/upload/single — generic multipart file upload */
uploadRoutes.post("/single", async (c) => {
  const user = c.var.user;
  const form = await c.req.formData().catch(() => null);
  const part = form?.get("file") as File | null;

  if (!part || typeof part.arrayBuffer !== "function") {
    return c.json(fail("VALIDATION_ERROR", "Missing uploaded file"), 400);
  }

  const bytes = await part.arrayBuffer();
  const ext = fileExt(part.name || "file");
  const key = `uploads/${user.sub}/files/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;

  const bucket: R2Bucket | undefined = (globalThis as any).__ENV?.VIDEO_BUCKET;
  if (!bucket) return c.json(fail("INTERNAL_SERVER_ERROR", "Storage not configured"), 500);

  await bucket.put(key, bytes, { httpMetadata: { contentType: part.type || "application/octet-stream" } });

  return c.json(ok({ url: cdnUrl(key) }), 201);
});

/** POST /api/upload/video — multipart video upload used by resume/video flows */
uploadRoutes.post("/video", async (c) => {
  const user = c.var.user;
  const form = await c.req.formData().catch(() => null);
  const part = form?.get("file") as File | null;

  if (!part || typeof part.arrayBuffer !== "function") {
    return c.json(fail("VALIDATION_ERROR", "Missing uploaded video file"), 400);
  }

  const contentType = part.type || "application/octet-stream";
  if (!contentType.startsWith("video/")) {
    return c.json(fail("VALIDATION_ERROR", "Only video uploads are allowed on this endpoint"), 415);
  }

  const bytes = await part.arrayBuffer();
  const ext = fileExt(part.name || "video");
  const key = `uploads/${user.sub}/videos/${crypto.randomUUID()}${ext ? `.${ext}` : ".webm"}`;

  const bucket: R2Bucket | undefined = (globalThis as any).__ENV?.VIDEO_BUCKET;
  if (!bucket) return c.json(fail("INTERNAL_SERVER_ERROR", "Storage not configured"), 500);

  await bucket.put(key, bytes, { httpMetadata: { contentType } });

  return c.json(
    ok({
      url: cdnUrl(key),
      fileName: part.name || key.split("/").at(-1) || "video.webm",
      size: bytes.byteLength,
      metadata: {
        fileName: part.name || "video.webm",
        size: bytes.byteLength,
        contentType,
        uploadedAt: new Date().toISOString(),
      },
    }),
    201,
  );
});

/** DELETE /api/upload/:key — delete a previously uploaded file */
uploadRoutes.delete("/:key{.+}", async (c) => {
  const user = c.var.user;
  const key = c.req.param("key");

  if (!key.startsWith(`uploads/${user.sub}/`)) {
    return c.json(fail("FORBIDDEN", "You do not have permission to delete this file"), 403);
  }

  const bucket: R2Bucket | undefined = (globalThis as any).__ENV?.VIDEO_BUCKET;
  if (!bucket) return c.json(fail("INTERNAL_SERVER_ERROR", "Storage not configured"), 500);

  const existing = await bucket.head(key);
  if (!existing) return c.json(fail("NOT_FOUND", "File not found"), 404);

  await bucket.delete(key);

  return c.json(ok(null));
});
