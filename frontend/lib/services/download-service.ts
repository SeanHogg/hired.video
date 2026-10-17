/**
 * Authenticated file downloads from the API.
 *
 * `apiClient` validates the JSON `{ success, data }` envelope, so endpoints
 * that stream a raw file (CSV / JSON exports) come through here instead. URL
 * and auth headers resolve through the same SSoT primitives as apiClient
 * (`buildApiUrl` + `standardAuthHeaders`: Bearer + X-Emulation-Token), so a
 * download can never drift onto the static frontend origin or lose the token.
 */

import { buildApiUrl } from "../api/base-url";
import { standardAuthHeaders } from "../api/auth-token";
import { triggerDownload } from "../resume-exporters";

/** Fetch `endpoint` (e.g. `/api/learning/xapi/portability/export/manifest`) as a Blob. */
export async function fetchApiBlob(endpoint: string): Promise<Blob> {
  const url = buildApiUrl(endpoint);
  const res = await fetch(url, { headers: standardAuthHeaders(url), credentials: "include" });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.blob();
}

/** Fetch `endpoint` and hand it to the browser's download prompt as `filename`. */
export async function downloadApiFile(endpoint: string, filename: string): Promise<void> {
  triggerDownload(await fetchApiBlob(endpoint), filename);
}
