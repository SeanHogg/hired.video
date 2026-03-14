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

/** POST /api/upload — upload a file to S3-compatible storage (avatars, documents, etc.) */
uploadRoutes.post("/", async (c) => {
  const user = c.var.user;

  const rawContentType = c.req.header("Content-Type") ?? "";
  const contentType = rawContentType.split(";")[0]?.trim() ?? "";
  const filename = c.req.header("X-Filename") ?? `upload-${Date.now()}`;

  const parsed = UploadSchema.safeParse({ filename, contentType });
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Missing required headers: X-Filename, Content-Type" } }, 400);
  }

  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: `Content type '${contentType}' is not allowed`, details: { allowed: [...ALLOWED_CONTENT_TYPES] } } },
      415,
    );
  }

  const body = await c.req.arrayBuffer();

  if (body.byteLength > MAX_FILE_SIZE_BYTES) {
    return c.json(
      { error: { code: "PAYLOAD_TOO_LARGE", message: `File size exceeds the ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB limit` } },
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
    {
      data: {
        key,
        url: `https://cdn.myvideoresu.me/${key}`,
        contentType,
        size: body.byteLength,
      },
    },
    201,
  );
});

/** DELETE /api/upload/:key — delete a previously uploaded file */
uploadRoutes.delete("/:key{.+}", async (c) => {
  const user = c.var.user;
  const key = c.req.param("key");

  if (!key.startsWith(`uploads/${user.sub}/`)) {
    return c.json({ error: { code: "FORBIDDEN", message: "You do not have permission to delete this file" } }, 403);
  }

  const s3 = getS3Client();
  const bucket = getBucket();

  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    return c.json({ error: { code: "NOT_FOUND", message: "File not found" } }, 404);
  }

  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

  return c.json({ data: null });
});
