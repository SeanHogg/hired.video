/**
 * Authenticated file downloads from the API.
 *
 * `apiClient.request` validates the JSON `{ success, data }` envelope, so
 * endpoints that stream a raw file (CSV / JSON exports) open the response
 * through `apiClient.openStream` instead — same URL resolution, auth headers
 * (Bearer + X-Emulation-Token), request log and typed error mapping as every
 * other API call; the body is read here as a Blob.
 */

import { apiClient } from "../api-client";
import { triggerDownload } from "../resume-exporters";

/** Fetch `endpoint` (e.g. `/api/learning/xapi/portability/export/manifest`) as a Blob. */
export async function fetchApiBlob(endpoint: string): Promise<Blob> {
  const res = await apiClient.openStream(endpoint);
  return res.blob();
}

/** Fetch `endpoint` and hand it to the browser's download prompt as `filename`. */
export async function downloadApiFile(endpoint: string, filename: string): Promise<void> {
  triggerDownload(await fetchApiBlob(endpoint), filename);
}
