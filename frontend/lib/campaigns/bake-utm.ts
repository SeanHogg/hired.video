/**
 * bake-utm.ts — the frontend's entry to campaign UTMs. The URL logic itself
 * (`appendCampaignUtm`, the Timeline / hot-zone bakers, the project
 * campaign picker) lives in `@shared/campaign-utm` so the API's public
 * player payload applies the exact same rules (#1138). Consumed by:
 *   • CampaignSection in ProjectDetailsSheet → "Copy share URL with UTM"
 *   • the export render (`renderCanvasToBlob`, lib/studio/publish-render)
 */
import type { VideoCampaign } from "@/lib/services/studio-service";
import { appendCampaignUtm } from "@shared/campaign-utm";
import { publicVideoPath } from "@shared/public-paths";

export {
  appendCampaignUtm,
  bakeCampaignUtmIntoTimeline,
  pickProjectCampaign,
  type CampaignUtm,
} from "@shared/campaign-utm";

/** Build the public share URL for a studio project with the campaign's
 *  UTMs baked in. ONE call site (CampaignSection's "Copy share URL with
 *  UTM" button today) so the share-URL shape lives next to the UTM
 *  baker. The base URL pattern matches what `<StudioPlayer/>` renders
 *  links to (canonical `/m/:id`; `/v/:id` is a legacy alias). */
export function campaignShareUrlFor(
  projectId: string,
  campaign: Pick<
    VideoCampaign,
    "utmSource" | "utmMedium" | "utmCampaign"
  > | null | undefined,
  options: { origin?: string } = {},
): string {
  const origin =
    options.origin ??
    (typeof window !== "undefined" ? window.location.origin : "");
  const base = `${origin}${publicVideoPath(projectId)}`;
  return appendCampaignUtm(base, campaign);
}
