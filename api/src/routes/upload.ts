import { Hono } from "hono";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { cdnUrl } from "../utils/cdn.js";
import { deleteUserObjects } from "../services/storage/delete-user-objects.js";
import { assertImageUploadAllowed } from "../services/moderation/explicit/uploadGate.js";
import { getVideoBucket, putObject } from "../services/storage/object-store.js";
import { clampAssetLimit, getAssetPage, kindsForQuery } from "../services/storage/media-library.js";
import { resolveUploadSourceProjectId } from "../services/studio/recordingProjectAccess.js";
import { parseUpload, isUploadRejected } from "../utils/multipart.js";

// 32MB matches the frontend `MAX_IMAGE_SIZE` cap raised per #949 —
// flattened 4K PNGs from DrawingStage routinely exceed 16MB and the
// old 10MB ceiling silently rejected them.
const MAX_FILE_SIZE_BYTES = 32 * 1024 * 1024;

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


export const uploadRoutes = new Hono<AppEnv>();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

function fail(code: string, message: string, details?: unknown) {
  return { success: false as const, error: { code, message, ...(details !== undefined ? { details } : {}) }, timestamp: new Date().toISOString() };
}

/**
 * Optional `projectId` form field: the studio project an upload belongs to.
 * Kept only when the uploader may write to that project (#2377) — otherwise
 * the hint is dropped and the upload still succeeds.
 */
function projectIdField(userId: string, form: FormData | null): Promise<string | null> {
  return resolveUploadSourceProjectId(userId, form?.get("projectId"));
}

/** Undo a stored upload (e.g. the explicit-content gate blocked it). */
async function discardUpload(userId: string, key: string): Promise<void> {
  await deleteUserObjects(userId, [key]);
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

  if (!(await putObject(key, body, contentType))) {
    return c.json(fail("INTERNAL_SERVER_ERROR", "Storage not configured"), 500);
  }

  // Explicit-content gate: a blocked image is deleted again (throws 422).
  if (contentType.startsWith("image/")) {
    await assertImageUploadAllowed(
      { bytes: body, mime: contentType, url: cdnUrl(key), ownerUserId: user.sub, discard: () => discardUpload(user.sub, key) },
      c.env,
    );
  }

  return c.json(
    ok({ key, url: cdnUrl(key), contentType, size: body.byteLength }),
    201,
  );
});

/**
 * GET /api/upload/images — one page of the signed-in user's media library
 * (#933 / #950), newest first.
 *
 * Reads `uploaded_assets` (#733, migration 0512), which every R2 write
 * records through `putObject`, so each item carries its kind, size,
 * dimensions and the studio project it came from. Keyset-paginated and
 * cached (services/storage/media-library.ts).
 *
 * Query: `cursor` (opaque, from the previous page's `nextCursor`), `limit`
 * (1–100, default 40), `kind` (`images` = uploads + AI images, the default;
 * or one asset kind such as `video` / `audio`).
 * Returns `{ items, nextCursor, truncated }` — `truncated` is kept for older
 * clients and equals `nextCursor !== null`.
 */
uploadRoutes.get("/images", async (c) => {
  const user = c.var.user;
  const page = await getAssetPage({
    userId: user.sub,
    kinds: kindsForQuery(c.req.query("kind")),
    limit: clampAssetLimit(c.req.query("limit")),
    cursor: c.req.query("cursor") ?? null,
  });
  return c.json(ok({ ...page, truncated: page.nextCursor !== null }));
});

/** POST /api/upload/image — multipart image upload used by company/profile UIs */
uploadRoutes.post("/image", async (c) => {
  const user = c.var.user;
  const up = await parseUpload(c, {
    fields: ["file", "avatar"],
    mimes: (mime) => mime.startsWith("image/"),
    messages: { missing: "Missing uploaded image file", type: "Only image uploads are allowed on this endpoint" },
  });
  // 400 missing / 415 wrong type — both keep this endpoint's VALIDATION_ERROR code.
  if (isUploadRejected(up)) return c.json(fail("VALIDATION_ERROR", up.message), up.status);
  const { form, file: part, bytes, contentType } = up;
  const ext = fileExt(part.name || "image");
  const key = `uploads/${user.sub}/images/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;

  if (!(await putObject(key, bytes, contentType, undefined, { sourceProjectId: await projectIdField(user.sub, form) }))) {
    return c.json(fail("INTERNAL_SERVER_ERROR", "Storage not configured"), 500);
  }

  // Explicit-content gate: a blocked image is deleted again (throws 422).
  // Large / unsupported images are downscaled server-side (Cloudflare Images).
  await assertImageUploadAllowed(
    { bytes, mime: contentType, url: cdnUrl(key), ownerUserId: user.sub, discard: () => discardUpload(user.sub, key) },
    c.env,
  );

  return c.json(ok({ url: cdnUrl(key) }), 201);
});

/** POST /api/upload/single — generic multipart file upload */
uploadRoutes.post("/single", async (c) => {
  const user = c.var.user;
  const up = await parseUpload(c, { messages: { missing: "Missing uploaded file" } });
  if (isUploadRejected(up)) return c.json(fail("VALIDATION_ERROR", up.message), 400);
  const { form, file: part, bytes } = up;
  const ext = fileExt(part.name || "file");
  const key = `uploads/${user.sub}/files/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;

  const stored = await putObject(key, bytes, part.type || "application/octet-stream", undefined, {
    sourceProjectId: await projectIdField(user.sub, form),
  });
  if (!stored) return c.json(fail("INTERNAL_SERVER_ERROR", "Storage not configured"), 500);

  return c.json(ok({ url: cdnUrl(key) }), 201);
});

/**
 * POST /api/upload/scorm-file — multipart upload that preserves the
 * caller-supplied path inside the package (#1431).
 *
 * Form fields:
 *   - file: the asset blob
 *   - pkgId: opaque package id chosen by the client (a uuid v4) so every
 *     file in the same SCORM package lands under one prefix
 *   - path: the in-zip relative path of this asset (e.g.
 *     "scormcontent/index.html"). Path traversal segments ("..", absolute
 *     paths) are rejected to keep every write strictly inside the package
 *     prefix.
 *
 * R2 key layout:
 *   `uploads/<userId>/scorm/<pkgId>/<path>`
 *
 * Why this exists instead of /single: SCORM packages reference sibling
 * assets via relative paths in the entry HTML (`<script src="loader.js">`
 * resolves against the page's URL). /single's flat `uploads/<userId>/
 * files/<uuid>.<ext>` layout breaks every reference because each file
 * ends up at a different uuid. Preserving the in-zip layout under a
 * shared pkgId prefix means relative refs Just Work — the entry HTML at
 * `<prefix>/index.html` resolves `loader.js` to `<prefix>/loader.js`,
 * which exists. Pairs with [scorm-upload.ts](frontend/lib/courses/scorm-upload.ts).
 */
uploadRoutes.post("/scorm-file", async (c) => {
  const user = c.var.user;
  const up = await parseUpload(c, { messages: { missing: "Missing uploaded file" } });
  if (isUploadRejected(up)) return c.json(fail("VALIDATION_ERROR", up.message), 400);
  const { form, file: part, bytes } = up;
  const pkgId = (form.get("pkgId") as string | null)?.trim() ?? "";
  const path = (form.get("path") as string | null)?.trim() ?? "";

  // pkgId must be a uuid v4 — anything else risks collision with another
  // user's package and lets a caller scribble into arbitrary R2 prefixes
  // by passing "../somebody-elses-package".
  if (!/^[0-9a-f-]{36}$/i.test(pkgId)) {
    return c.json(fail("VALIDATION_ERROR", "pkgId must be a uuid v4"), 400);
  }
  // path validation — reject empty, absolute, dotdot, backslash, and
  // anything that decodes to a different shape after stripping. The
  // surviving path is a slash-separated relative file path safe to
  // concatenate with the user-scoped prefix.
  if (!path
      || path.startsWith("/")
      || path.includes("\\")
      || path.split("/").some((seg) => seg === "" || seg === ".." || seg === ".")) {
    return c.json(fail("VALIDATION_ERROR", "path must be a non-empty, relative, traversal-free POSIX path"), 400);
  }

  const key = `uploads/${user.sub}/scorm/${pkgId}/${path}`;

  if (!(await putObject(key, bytes, part.type || "application/octet-stream"))) {
    return c.json(fail("INTERNAL_SERVER_ERROR", "Storage not configured"), 500);
  }

  // #1460 — SCORM iframe needs same-origin URLs so the SCO can call
  // `window.parent.API`. Return the proxy URL that streams from R2 via
  // the app origin, NOT cdnUrl() (which points at a separate hostname).
  // The R2 key is preserved on the response for any future
  // admin / cleanup tooling.
  const url = `/api/courses/scorm-asset/${user.sub}/${pkgId}/${path}`;
  return c.json(ok({ url, key }), 201);
});

/** POST /api/upload/video — multipart video upload used by resume/video flows */
uploadRoutes.post("/video", async (c) => {
  const user = c.var.user;
  const up = await parseUpload(c, {
    mimes: (mime) => mime.startsWith("video/"),
    messages: { missing: "Missing uploaded video file", type: "Only video uploads are allowed on this endpoint" },
  });
  // 400 missing / 415 wrong type — both keep this endpoint's VALIDATION_ERROR code.
  if (isUploadRejected(up)) return c.json(fail("VALIDATION_ERROR", up.message), up.status);
  const { form, file: part, bytes, contentType } = up;
  const ext = fileExt(part.name || "video");
  const key = `uploads/${user.sub}/videos/${crypto.randomUUID()}${ext ? `.${ext}` : ".webm"}`;

  if (!(await putObject(key, bytes, contentType, undefined, { sourceProjectId: await projectIdField(user.sub, form) }))) {
    return c.json(fail("INTERNAL_SERVER_ERROR", "Storage not configured"), 500);
  }

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

  const bucket: R2Bucket | undefined = getVideoBucket();
  if (!bucket) return c.json(fail("INTERNAL_SERVER_ERROR", "Storage not configured"), 500);

  const existing = await bucket.head(key);
  if (!existing) return c.json(fail("NOT_FOUND", "File not found"), 404);

  await deleteUserObjects(user.sub, [key]);

  return c.json(ok(null));
});
