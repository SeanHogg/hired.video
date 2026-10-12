/**
 * Typed client for the API's image proxy (GET /api/media/image): a remote
 * image re-served from the API origin, read as a Blob, so a canvas can draw
 * it without tainting (document downloads). Signed-in only.
 */
import { apiClient } from "@/lib/api-client";

export const mediaProxyService = {
  async imageBlob(url: string): Promise<Blob> {
    const res = await apiClient.openStream(`/api/media/image?url=${encodeURIComponent(url)}`, {
      method: "GET",
      suppressErrorEvent: true,
    });
    return res.blob();
  },
};
