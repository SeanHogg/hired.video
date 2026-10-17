/**
 * parseUpload — the one reader for a single-file multipart upload.
 *
 * Reads the form, picks the first present field from `fields`, enforces
 * the endpoint's MIME allow-list and byte cap, and returns either the file
 * (+ bytes, the parsed form for extra fields) or a typed rejection the
 * route maps onto its own envelope:
 *
 *   const up = await parseUpload(c, { fields: ["avatar", "file"], maxBytes: 5 * MB, mimes: AVATAR_TYPES });
 *   if (isUploadRejected(up)) return c.json(fail(up.code, up.message), up.status);
 *   const { file, bytes, contentType, form } = up;
 *
 * Limits stay per endpoint — pass the values the route already enforced.
 */

import type { ContentfulStatusCode } from "hono/utils/http-status";

export const MB = 1024 * 1024;

interface FormReader {
  req: { formData: () => Promise<FormData> };
}

export type MimeRule = ReadonlySet<string> | readonly string[] | ((mime: string) => boolean);

export interface UploadOptions {
  /** Form field names to try, in order (default `["file"]`). */
  fields?: readonly string[];
  /** Reject files larger than this many bytes. */
  maxBytes?: number;
  /** Allowed content types (set/array of exact types, or a predicate). */
  mimes?: MimeRule;
  /**
   * Override the default rejection messages. `type` may be built from the
   * rejected content type and `size` from the rejected file's byte count.
   */
  messages?: {
    missing?: string;
    type?: string | ((contentType: string) => string);
    size?: string | ((fileBytes: number) => string);
  };
  /** Read the bytes eagerly (default true). Set false for streaming to R2. */
  readBytes?: boolean;
}

export interface UploadAccepted {
  ok: true;
  form: FormData;
  file: File;
  /** Present unless `readBytes: false`. */
  bytes: ArrayBuffer;
  /** `file.type` or `application/octet-stream`. */
  contentType: string;
  filename: string;
}

export interface UploadRejected {
  ok: false;
  status: ContentfulStatusCode;
  code: "VALIDATION_ERROR" | "UNSUPPORTED_MEDIA_TYPE" | "PAYLOAD_TOO_LARGE";
  message: string;
  /** The parsed form, when parsing itself succeeded. */
  form: FormData | null;
}

/** Type guard for the rejection branch. The API compiles with `strict: false`,
 *  where `if (!up.ok)` does not narrow the union — callers use this instead. */
export function isUploadRejected(up: UploadAccepted | UploadRejected): up is UploadRejected {
  return up.ok === false;
}

function mimeAllowed(rule: MimeRule, mime: string): boolean {
  if (typeof rule === "function") return rule(mime);
  if (Array.isArray(rule)) return rule.includes(mime);
  return (rule as ReadonlySet<string>).has(mime);
}

function isFile(v: unknown): v is File {
  return !!v && typeof v === "object" && typeof (v as File).arrayBuffer === "function";
}

/** Parse the request's multipart form (null on a malformed body). */
export async function readForm(c: FormReader): Promise<FormData | null> {
  return c.req.formData().catch(() => null);
}

/**
 * Multi-file upload: every file part under `name`, in upload order (e.g. the
 * rasterised pages of one scan). `files` is empty when the body is malformed
 * or carries no file under `name`; per-file limits stay with the caller.
 */
export async function readFormFiles(c: FormReader, name = "file"): Promise<{ form: FormData | null; files: File[] }> {
  const form = await readForm(c);
  const files = ((form?.getAll(name) ?? []) as unknown[]).filter(isFile);
  return { form, files };
}

function resolveMessage<T>(override: string | ((arg: T) => string) | undefined, arg: T, fallback: string): string {
  if (typeof override === "function") return override(arg);
  return override ?? fallback;
}

export async function parseUpload(c: FormReader, opts: UploadOptions = {}): Promise<UploadAccepted | UploadRejected> {
  const fields = opts.fields ?? ["file"];
  const form = await readForm(c);
  let file: File | null = null;
  for (const name of fields) {
    const v = form?.get(name);
    if (isFile(v)) {
      file = v;
      break;
    }
  }
  if (!file) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_ERROR",
      message: opts.messages?.missing ?? `Missing uploaded file in form field '${fields[0]}'`,
      form,
    };
  }
  const contentType = file.type || "application/octet-stream";
  if (opts.mimes && !mimeAllowed(opts.mimes, contentType)) {
    return {
      ok: false,
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: resolveMessage(opts.messages?.type, contentType, `Unsupported file type: ${contentType}`),
      form,
    };
  }
  if (opts.maxBytes != null && file.size > opts.maxBytes) {
    return {
      ok: false,
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
      message: resolveMessage(opts.messages?.size, file.size, `File must be under ${Math.round(opts.maxBytes / MB)} MB`),
      form,
    };
  }
  const bytes = opts.readBytes === false ? new ArrayBuffer(0) : await file.arrayBuffer();
  return { ok: true, form: form!, file, bytes, contentType, filename: file.name || "" };
}
