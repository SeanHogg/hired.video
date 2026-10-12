/**
 * Uploaded assets (#733 / #950) — one row per R2 object a user uploads or
 * the platform generates for them (`uploaded_assets`, migration 0512).
 *
 * Shared by the API (CHECK constraint, kind derivation, list endpoint) and
 * the frontend (MediaPicker library) so the kind vocabulary and the page
 * shape can't drift.
 */

/** Every kind of asset row. Mirrors the CHECK constraint in migration 0512. */
export const UPLOADED_ASSET_KINDS = [
  "image",
  "ai_image",
  "avatar",
  "video",
  "recording",
  "audio",
  "voice",
  "file",
  "scorm",
] as const;

export type UploadedAssetKind = (typeof UPLOADED_ASSET_KINDS)[number];

export function isUploadedAssetKind(value: unknown): value is UploadedAssetKind {
  return typeof value === "string" && (UPLOADED_ASSET_KINDS as readonly string[]).includes(value);
}

/** Kinds the media library's "Images" view lists. */
export const IMAGE_ASSET_KINDS: readonly UploadedAssetKind[] = ["image", "ai_image"];

/** Page size bounds for `GET /api/upload/images`. */
export const ASSET_PAGE_DEFAULT = 40;
export const ASSET_PAGE_MAX = 100;

/** One library item as the API returns it. */
export interface UploadedAssetItem {
  id: string;
  key: string;
  url: string;
  kind: UploadedAssetKind;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  /** Studio project the asset was made in, when known (links to /studio/:id). */
  sourceProjectId: string | null;
  uploadedAt: string;
}

export interface UploadedAssetPage {
  items: UploadedAssetItem[];
  /** Opaque cursor for the next page; null on the last page. */
  nextCursor: string | null;
}

/**
 * Keyset cursor over `(created_at DESC, id DESC)`. Encoded as base64url of
 * `<iso>|<uuid>` so it is opaque to clients but trivially decodable here.
 */
export function encodeAssetCursor(createdAt: Date | string, id: string): string {
  const iso = typeof createdAt === "string" ? createdAt : createdAt.toISOString();
  return toBase64Url(`${iso}|${id}`);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Null for anything that isn't a cursor this module produced. */
export function decodeAssetCursor(cursor: string | null | undefined): { createdAt: Date; id: string } | null {
  if (!cursor || cursor.length > 200) return null;
  let raw: string;
  try {
    raw = fromBase64Url(cursor);
  } catch {
    return null;
  }
  const sep = raw.indexOf("|");
  if (sep <= 0) return null;
  const createdAt = new Date(raw.slice(0, sep));
  const id = raw.slice(sep + 1);
  if (Number.isNaN(createdAt.getTime()) || !UUID_RE.test(id)) return null;
  return { createdAt, id };
}

function toBase64Url(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return atob(padded);
}
