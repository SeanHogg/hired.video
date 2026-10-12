// asset-record.ts — which `uploaded_assets` row an R2 write produces (#733).
//
// Pure: given the key `putObject` is writing and its content type, decide the
// owning user and the asset kind from the key conventions in r2-keys.ts. A
// key with no user owner (stock media, workforce documents, NLE proxies —
// derived renders, not uploads) produces no row.

import type { UploadedAssetKind } from "../../../../shared/uploaded-assets.js";

export interface AssetRecordHint {
  /** Overrides the derived kind (e.g. an AI image written under images/). */
  kind?: UploadedAssetKind;
  width?: number | null;
  height?: number | null;
  /** Studio project the asset was made in. */
  sourceProjectId?: string | null;
}

export interface AssetRecord {
  userId: string;
  r2Key: string;
  kind: UploadedAssetKind;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  sourceProjectId: string | null;
}

const UUID = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";

/** Kind by MIME family, for keys whose folder doesn't say (generic uploads). */
function kindFromContentType(contentType: string): UploadedAssetKind {
  const type = contentType.toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "file";
}

type KeyRule = { match: RegExp; kind: UploadedAssetKind | null };

/** Ordered most-specific first. `null` kind = derive from the content type.
 *  Built on first use, not at module load (Workers startup budget). */
const buildKeyRules = (): KeyRule[] => [
  { match: new RegExp(`^uploads/${UUID}/ai-images/`, "i"), kind: "ai_image" },
  { match: new RegExp(`^uploads/${UUID}/avatars/`, "i"), kind: "avatar" },
  { match: new RegExp(`^uploads/${UUID}/images/`, "i"), kind: "image" },
  { match: new RegExp(`^uploads/${UUID}/videos/`, "i"), kind: "video" },
  { match: new RegExp(`^uploads/${UUID}/scorm/`, "i"), kind: "scorm" },
  // /single (audio, music, documents) and the bare POST / upload.
  { match: new RegExp(`^uploads/${UUID}/`, "i"), kind: null },
  { match: new RegExp(`^studio/recordings/${UUID}/`, "i"), kind: "recording" },
  { match: new RegExp(`^studio/voice-clones/${UUID}/`, "i"), kind: "voice" },
  { match: new RegExp(`^interview/${UUID}/`, "i"), kind: "recording" },
  // Project video uploads: studio/{uid}/{projectId}/...
  { match: new RegExp(`^studio/${UUID}/`, "i"), kind: "video" },
  { match: new RegExp(`^nle-sources/${UUID}/`, "i"), kind: null },
];

let keyRules: { rules: KeyRule[]; projectKey: RegExp } | null = null;
function rules() {
  keyRules ??= { rules: buildKeyRules(), projectKey: new RegExp(`^studio/${UUID}/${UUID}/`, "i") };
  return keyRules;
}

function nonNegativeInt(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * The row to record for this write, or null when the key has no user owner.
 */
export function deriveAssetRecord(
  key: string,
  contentType: string,
  sizeBytes: number,
  hint: AssetRecordHint = {},
): AssetRecord | null {
  const { rules: keyRuleList, projectKey } = rules();
  for (const rule of keyRuleList) {
    const m = rule.match.exec(key);
    if (!m) continue;
    const userId = m[1]!.toLowerCase();
    const projectFromKey = projectKey.exec(key)?.[2]?.toLowerCase() ?? null;
    return {
      userId,
      r2Key: key,
      kind: hint.kind ?? rule.kind ?? kindFromContentType(contentType),
      contentType: (contentType || "application/octet-stream").slice(0, 127),
      sizeBytes: Math.max(0, Math.round(sizeBytes)),
      width: nonNegativeInt(hint.width),
      height: nonNegativeInt(hint.height),
      sourceProjectId: hint.sourceProjectId ?? projectFromKey,
    };
  }
  return null;
}
