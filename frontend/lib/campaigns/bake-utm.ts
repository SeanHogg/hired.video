/**
 * bake-utm.ts — single source of truth for "append a campaign's UTM
 * params onto a URL". Consumed by:
 *   • CampaignSection in ProjectDetailsSheet → "Copy share URL with UTM"
 *   • Future export-pipeline hooks (image / video / animation) that bake
 *     the campaign's UTMs into CTA widget URLs at render time (#1138)
 *   • Outreach CampaignsTab when generating an asset's outbound link
 *
 * Per the standing DRY rule: ONE helper, every consumer reads from it.
 * No `if (campaign.utmSource)` branching at call sites — this module
 * owns the precedence + dedup + URL-shape edge cases.
 */

import type { VideoCampaign } from "@/lib/services/studio-service";

/** Map a campaign's UTM fields onto the UTM parameter names the analytics
 *  industry agrees on. Centralised so a future "add utm_term / utm_content"
 *  expansion is one edit. */
const UTM_FIELD_MAP: Array<{
  field: keyof Pick<VideoCampaign, "utmSource" | "utmMedium" | "utmCampaign">;
  param: string;
}> = [
  { field: "utmSource",   param: "utm_source"   },
  { field: "utmMedium",   param: "utm_medium"   },
  { field: "utmCampaign", param: "utm_campaign" },
];

/**
 * Append the campaign's UTM params onto a URL. Returns the original URL
 * unchanged when:
 *   - the URL is empty / null / undefined
 *   - the URL doesn't parse as an absolute URL (no protocol)
 *   - the campaign has no UTM fields populated
 *
 * Existing params on the URL win — re-running this helper is idempotent
 * because we use `URLSearchParams.set()` semantics only for absent keys.
 * That way a user who hand-edited their CTA URL with a specific
 * `utm_campaign` doesn't get it silently overwritten by the campaign's
 * default.
 */
export function appendCampaignUtm(
  rawUrl: string | null | undefined,
  campaign: Pick<
    VideoCampaign,
    "utmSource" | "utmMedium" | "utmCampaign"
  > | null | undefined,
): string {
  if (!rawUrl) return "";
  if (!campaign) return rawUrl;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  for (const { field, param } of UTM_FIELD_MAP) {
    const value = campaign[field];
    if (!value) continue;
    // Respect already-set UTM params on the URL — see fn doc.
    if (url.searchParams.has(param)) continue;
    url.searchParams.set(param, value);
  }

  return url.toString();
}

/** Build the public share URL for a studio project with the campaign's
 *  UTMs baked in. ONE call site (CampaignSection's "Copy share URL with
 *  UTM" button today) so the share-URL shape lives next to the UTM
 *  baker. The base URL pattern matches what `<StudioPlayer/>` renders
 *  links to (the unified `/v/:id` route established in #665). */
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
  const base = `${origin}/v/${encodeURIComponent(projectId)}`;
  return appendCampaignUtm(base, campaign);
}
