import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { success, error } from "../types";

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

// ============================================================================
// SCHEMAS
// ============================================================================

const UploadSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
});

// ============================================================================
// ROUTES
// ============================================================================

export const uploadRoutes = new Hono<AppEnv>();

/** POST /api/upload — upload a file to R2 (avatars, documents, etc.) */
uploadRoutes.post("/", async (c) => {
  const user = c.var.user;

  const rawContentType = c.req.header("Content-Type") ?? "";
  const contentType = rawContentType.split(";")[0]?.trim() ?? "";
  const filename = c.req.header("X-Filename") ?? `upload-${Date.now()}`;

  const parsed = UploadSchema.safeParse({ filename, contentType });
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Missing required headers: X-Filename, Content-Type"), 400);
  }

  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return c.json(
      error("VALIDATION_ERROR", `Content type '${contentType}' is not allowed`, {
        allowed: [...ALLOWED_CONTENT_TYPES],
      }),
      415,
    );
  }

  const body = await c.req.arrayBuffer();

  if (body.byteLength > MAX_FILE_SIZE_BYTES) {
    return c.json(
      error("PAYLOAD_TOO_LARGE", `File size exceeds the ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB limit`),
      413,
    );
  }

  const extension = filename.includes(".") ? filename.split(".").pop() : "";
  const r2Key = `uploads/${user.sub}/${crypto.randomUUID()}${extension ? `.${extension}` : ""}`;

  await c.env.VIDEO_BUCKET.put(r2Key, body, {
    httpMetadata: { contentType },
    customMetadata: { userId: user.sub, originalFilename: filename },
  });

  return c.json(
    success({
      key: r2Key,
      url: `https://cdn.myvideoresu.me/${r2Key}`,
      contentType,
      size: body.byteLength,
    }),
    201,
  );
});

/** DELETE /api/upload/:key — delete a previously uploaded file */
uploadRoutes.delete("/:key{.+}", async (c) => {
  const user = c.var.user;
  const key = c.req.param("key");

  // Ensure the user owns this file
  if (!key.startsWith(`uploads/${user.sub}/`)) {
    return c.json(error("FORBIDDEN", "You do not have permission to delete this file"), 403);
  }

  const existing = await c.env.VIDEO_BUCKET.head(key);
  if (!existing) {
    return c.json(error("NOT_FOUND", "File not found"), 404);
  }

  await c.env.VIDEO_BUCKET.delete(key);

  return c.json(success(null, "File deleted"));
});
