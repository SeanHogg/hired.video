/**
 * SCORM 1.2 / 2004 zip upload — client-side extract + per-file R2 push.
 *
 * Rationale (#1410): the Cloudflare Worker API has no zip-extraction
 * dep (no `jszip` / `fast-xml-parser`), so doing this server-side
 * would add two npm deps + a multipart-handling route. Browser already
 * has jszip (lazy-imported) + DOMParser, so do the whole pipeline
 * client-side and reuse a per-file POST to `/api/upload/scorm-file`:
 *
 *   1. Mint a `pkgId` (uuid v4) so every file in this package lands
 *      under one R2 prefix.
 *   2. Load the .zip into JSZip in the browser.
 *   3. Find `imsmanifest.xml` (case-insensitive; SCORM packages
 *      sometimes ship it as `imsManifest.xml`).
 *   4. Parse manifest with `DOMParser` to read SCORM version + entry
 *      resource href.
 *   5. POST every non-empty file to `/api/upload/scorm-file` with
 *      `pkgId` + `path` so the server writes to
 *      `uploads/<userId>/scorm/<pkgId>/<path>` — preserving the
 *      in-zip layout so the entry HTML's relative refs to sibling
 *      assets (`<script src="loader.js">`, CSS @import, etc.) resolve
 *      correctly. This was the #1431 problem with the previous
 *      `/api/upload/single` flat-namespace approach.
 *
 * Returns `{ manifestUrl, entryUrl, version, pkgId }` ready to drop
 * into the lesson `addLesson({ sourceType: "scorm_package", ... })`
 * payload. `pkgId` is exposed so callers that record cleanup metadata
 * can later list/delete every key under the prefix.
 *
 * Cost: O(N) HTTP round-trips for an N-file package. Typical SCORM 1.2
 * packages are 5–50 files; uploads run sequentially to keep the
 * progress callback monotonic and the API rate-limiter happy. Switch
 * to a Promise.all batch if a package balloons past ~100 files.
 *
 * NOT a true SCORM 2004 imsmanifest validator — we extract `schemaversion`
 * + the first `<resource href=...>` and trust the rest. ADL's official
 * test suite (SCORM-2004-4th-Edition-Test-Suite) remains the right
 * conformance gate; tracked under #161.
 */

import { apiClient } from "@/lib/api-client";
import type { ScormVersion } from "@/lib/services/course-service";

export interface ScormUploadResult {
  manifestUrl: string;
  entryUrl: string;
  version: ScormVersion;
  fileCount: number;
  /** Opaque package id (uuid v4). Every file in this package lives under
   *  `uploads/<userId>/scorm/<pkgId>/…` — recorded so a later cleanup
   *  pass can prefix-delete the whole package. */
  pkgId: string;
}

export interface ScormUploadProgress {
  /** Files uploaded so far (1-indexed once the first finishes). */
  done: number;
  /** Total files in the package. */
  total: number;
  /** Path of the file just uploaded. */
  lastPath: string;
}

/** Map SCORM-manifest version strings to our enum. SCORM 1.2 manifests
 *  declare `<schemaversion>1.2</schemaversion>`. SCORM 2004 use
 *  `<schemaversion>CAM 1.3</schemaversion>` (≈ 2004 1st), 2nd / 3rd / 4th
 *  editions stamp `2004 1st/2nd/3rd/4th Edition` etc. The mapping is
 *  best-effort — when no clear version match is found we default to 1.2,
 *  which scorm-again handles widely. */
function classifyVersion(raw: string): ScormVersion {
  const v = raw.toLowerCase();
  if (v.includes("1.2") || v.includes("cam 1.2")) return "1.2";
  if (v.includes("4th")) return "2004_4";
  if (v.includes("3rd")) return "2004_3";
  if (v.includes("2nd")) return "2004_2";
  if (v.includes("1st") || v.includes("cam 1.3")) return "2004_1";
  return "1.2";
}

async function uploadOne(pkgId: string, path: string, blob: Blob, contentType: string): Promise<string> {
  // Wrap the Blob in a File so the upload route's `form.get("file")` →
  // File branch trips correctly. Preserve the original filename so the
  // returned R2 key keeps the extension (which determines content type
  // on subsequent serves).
  const file = new File([blob], path.split("/").pop() || "file", { type: contentType });
  const form = new FormData();
  form.append("file", file);
  form.append("pkgId", pkgId);
  form.append("path", path);
  // apiClient.post() detects FormData bodies and lets the browser set the
  // multipart boundary (api-client.ts:429). No special method needed.
  const res = await apiClient.post<{ url: string; key: string }>("/api/upload/scorm-file", form);
  return res.data.url;
}

/** Guess a content type from filename extension. The SCORM player needs
 *  HTML / JS / CSS / image MIME-types correct or the iframe fails to
 *  execute embedded scripts. */
function contentTypeFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "html":
    case "htm":      return "text/html";
    case "js":       return "application/javascript";
    case "css":      return "text/css";
    case "xml":      return "application/xml";
    case "json":     return "application/json";
    case "png":      return "image/png";
    case "jpg":
    case "jpeg":     return "image/jpeg";
    case "gif":      return "image/gif";
    case "svg":      return "image/svg+xml";
    case "webp":     return "image/webp";
    case "mp4":      return "video/mp4";
    case "webm":     return "video/webm";
    case "mp3":      return "audio/mpeg";
    case "ogg":      return "audio/ogg";
    case "wav":      return "audio/wav";
    case "woff":     return "font/woff";
    case "woff2":    return "font/woff2";
    case "ttf":      return "font/ttf";
    case "swf":      return "application/x-shockwave-flash";
    default:         return "application/octet-stream";
  }
}

/** Extract SCORM version + entry resource href from imsmanifest.xml. */
function parseManifest(xml: string): { version: ScormVersion; entryHref: string | null } {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const parseError = doc.getElementsByTagName("parsererror")[0];
  if (parseError) throw new Error("imsmanifest.xml is not valid XML.");

  // Find the schemaversion. SCORM 1.2 / 2004 both nest it inside
  // metadata/schema OR metadata/lom/metadata/schema; do a permissive
  // search across all <schemaversion> elements.
  const versionEl = doc.getElementsByTagName("schemaversion")[0];
  const version = classifyVersion(versionEl?.textContent?.trim() ?? "");

  // Entry resource: the manifest declares one or more <resource> elements.
  // The default-organization's first launchable item references a resource
  // by identifierref; the resource element carries `href` for the launch
  // page. Implementing the full SCORM organization graph is overkill;
  // grab the first `<resource>` with an `href`, which is the convention
  // most authoring tools (Articulate, iSpring, Adobe Captivate) follow.
  const resources = Array.from(doc.getElementsByTagName("resource"));
  const firstWithHref = resources.find((r) => r.getAttribute("href"));
  const entryHref = firstWithHref?.getAttribute("href") ?? null;

  return { version, entryHref };
}

/**
 * Extract + upload a SCORM zip. Returns the URLs you can drop directly
 * into a course-lesson row with `sourceType: "scorm_package"`.
 *
 * @throws if no `imsmanifest.xml` is found in the zip
 * @throws if the manifest doesn't parse as XML
 * @throws if no `<resource href=...>` is found in the manifest
 */
export async function extractAndUploadScormZip(
  zipFile: File,
  onProgress?: (p: ScormUploadProgress) => void,
): Promise<ScormUploadResult> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());

  // SCORM packages sometimes nest everything under a single top-level
  // folder. Normalise by walking every entry; we re-emit relative paths
  // verbatim so the manifest's `<resource href>` (which is relative to
  // the manifest's location) keeps resolving.
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  if (entries.length === 0) throw new Error("Zip is empty.");

  // Find the manifest. SCORM allows the manifest at the root OR inside
  // a top-level folder (e.g. when the author exported "Package.zip /
  // Package / imsmanifest.xml"). Match case-insensitively + tolerate
  // both layouts.
  const manifestEntry = entries.find((f) => /(^|\/)imsmanifest\.xml$/i.test(f.name));
  if (!manifestEntry) {
    throw new Error("No imsmanifest.xml found in the zip — is this a SCORM package?");
  }
  const manifestXml = await manifestEntry.async("string");
  const { version, entryHref } = parseManifest(manifestXml);
  if (!entryHref) {
    throw new Error("imsmanifest.xml has no <resource href=...> — can't determine launch page.");
  }

  // Manifest's directory prefix (e.g. "Package/" when the zip wraps
  // everything in one folder). Used to resolve the entry href relative
  // to the manifest location AND to strip the prefix when computing
  // upload paths (so each file's "logical" SCORM path is recorded
  // without the folder noise).
  const lastSlash = manifestEntry.name.lastIndexOf("/");
  const manifestPrefix = lastSlash >= 0 ? manifestEntry.name.slice(0, lastSlash + 1) : "";

  let done = 0;
  const total = entries.length;
  const urlByPath = new Map<string, string>();

  for (const entry of entries) {
    const blob = await entry.async("blob");
    const contentType = contentTypeFor(entry.name);
    const url = await uploadOne(entry.name, blob, contentType);
    urlByPath.set(entry.name, url);
    done += 1;
    onProgress?.({ done, total, lastPath: entry.name });
  }

  const manifestUrl = urlByPath.get(manifestEntry.name)!;
  const entryAbsolutePath = manifestPrefix + entryHref;
  const entryUrl = urlByPath.get(entryAbsolutePath) ?? urlByPath.get(entryHref);
  if (!entryUrl) {
    throw new Error(`Entry resource "${entryHref}" was declared in the manifest but not found in the zip.`);
  }

  return { manifestUrl, entryUrl, version, fileCount: total };
}
