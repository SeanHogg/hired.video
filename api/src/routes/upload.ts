import { Hono } from "hono";
import { z } from "zod";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import type { Variables } from "../types/index.js";

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

function getS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION ?? "auto",
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY ?? "",
      secretAccessKey: process.env.STORAGE_SECRET_KEY ?? "",
    },
    forcePathStyle: true,
  });
}

function getBucket(): string {
  return process.env.STORAGE_BUCKET ?? "myvideoresume";
}

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

function cdnUrl(key: string): string {
  return `https://cdn.myvideoresu.me/${key}`;
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

  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: Buffer.from(body),
      ContentType: contentType,
      Metadata: { userId: user.sub, originalFilename: filename },
    }),
  );

  return c.json(
    ok({ key, url: cdnUrl(key), contentType, size: body.byteLength }),
    201,
  );
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

  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: Buffer.from(bytes),
      ContentType: contentType,
      Metadata: { userId: user.sub, originalFilename: part.name || "image" },
    }),
  );

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

  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: Buffer.from(bytes),
      ContentType: part.type || "application/octet-stream",
      Metadata: { userId: user.sub, originalFilename: part.name || "file" },
    }),
  );

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

  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: Buffer.from(bytes),
      ContentType: contentType,
      Metadata: { userId: user.sub, originalFilename: part.name || "video" },
    }),
  );

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

  const s3 = getS3Client();
  const bucket = getBucket();

  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    return c.json(fail("NOT_FOUND", "File not found"), 404);
  }

  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

  return c.json(ok(null));
});
