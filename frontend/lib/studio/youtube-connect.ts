/**
 * Start linking a YouTube channel: the ONE implementation behind every
 * "Connect YouTube" (the Post dock, the kit's Promote panel). The tab opens
 * inside the click so popup blockers allow it, then goes to Google's consent
 * screen; when no auth URL comes back the tab closes.
 */
import { youtubeService } from "@/lib/services/youtube-service";
import { beginIntegrationOAuth } from "@/lib/studio/integration-oauth";

export async function startYouTubeConnect(): Promise<void> {
  const tab = window.open("", "_blank");
  try {
    const res = await youtubeService.getAuthUrl();
    const authUrl = res.data?.authUrl;
    const url = authUrl && beginIntegrationOAuth("youtube", authUrl);
    if (url && tab) tab.location.href = url;
    else if (url) window.location.href = url;
    else tab?.close();
  } catch (err) {
    tab?.close();
    throw err;
  }
}
