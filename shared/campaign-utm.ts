/**
 * Campaign UTMs on CTA URLs (#1138) — the ONE implementation of "append a
 * video campaign's UTM params onto a URL", shared by the frontend (Copy
 * share URL, export render) and the API (the public player's CTA
 * hot-zones). Pure: no I/O, no framework types.
 *
 * Where a CTA URL actually leaves the platform: on the public player, the
 * clickable hot-zone it lays over the video; in an exported MP4 (no
 * overlay), the CTA card's painted fallback — the readable link plus a QR
 * code of the full URL (frontend `withExportTarget`, #2312).
 * `bakeCampaignUtmIntoTimeline` rewrites every CTA URL a render reads;
 * `bakeCampaignUtmIntoHotzones` rewrites the zones the player serves.
 */
import { CTA_LINK_EFFECT_KINDS, type CtaHotzone } from "./cta-hotzones.js";
import type { Timeline } from "./timeline.js";

/** The UTM fields of a video campaign (`video_campaigns` row / DTO). */
export interface CampaignUtm {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}

/** A campaign as the picker sees it: the DTO fields that decide which
 *  campaign a project's CTAs carry. */
export interface ProjectCampaignCandidate extends CampaignUtm {
  id: string;
  status: string;
  projectIds: readonly string[];
  updatedAt: string;
}

/** Campaign field → UTM parameter name. One table, so adding utm_term /
 *  utm_content later is one edit. */
const UTM_FIELD_MAP: ReadonlyArray<{ field: keyof CampaignUtm; param: string }> = [
  { field: "utmSource", param: "utm_source" },
  { field: "utmMedium", param: "utm_medium" },
  { field: "utmCampaign", param: "utm_campaign" },
];

/** Effect kinds whose `ctaUrl` param is a viewer-facing link. */
const CTA_URL_EFFECTS = CTA_LINK_EFFECT_KINDS;

export function hasCampaignUtm(campaign: CampaignUtm | null | undefined): campaign is CampaignUtm {
  return !!campaign && UTM_FIELD_MAP.some(({ field }) => !!campaign[field]?.trim());
}

/**
 * Append the campaign's UTM params onto a URL. Returns the URL unchanged
 * when it is empty, isn't absolute (no protocol — `mailto:` and `tel:`
 * parse but are left alone), or the campaign has no UTM fields.
 *
 * Params already on the URL win, so a hand-set `utm_campaign` is never
 * overwritten and re-running is idempotent.
 */
export function appendCampaignUtm(rawUrl: string | null | undefined, campaign: CampaignUtm | null | undefined): string {
  if (!rawUrl) return "";
  if (!hasCampaignUtm(campaign)) return rawUrl;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return rawUrl;
  let changed = false;
  for (const { field, param } of UTM_FIELD_MAP) {
    const value = campaign[field]?.trim();
    if (!value || url.searchParams.has(param)) continue;
    url.searchParams.set(param, value);
    changed = true;
  }
  return changed ? url.toString() : rawUrl;
}

/** A copy of `timeline` whose CTA URLs carry the campaign's UTMs. The
 *  input is never mutated (it is the project's saved edit source); with no
 *  UTMs the same object comes back. */
export function bakeCampaignUtmIntoTimeline(timeline: Timeline, campaign: CampaignUtm | null | undefined): Timeline {
  if (!hasCampaignUtm(campaign)) return timeline;
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        const effects = clip.effects;
        if (!effects?.some((e) => CTA_URL_EFFECTS.has(e.kind))) return clip;
        return {
          ...clip,
          effects: effects.map((effect) => {
            const url = effect.params?.ctaUrl;
            if (!CTA_URL_EFFECTS.has(effect.kind) || typeof url !== "string") return effect;
            return { ...effect, params: { ...effect.params, ctaUrl: appendCampaignUtm(url, campaign) } };
          }),
        };
      }),
    })),
  };
}

/** The player's CTA hot-zones with the campaign's UTMs on each URL. */
export function bakeCampaignUtmIntoHotzones(zones: CtaHotzone[], campaign: CampaignUtm | null | undefined): CtaHotzone[] {
  if (!hasCampaignUtm(campaign)) return zones;
  return zones.map((zone) => ({ ...zone, url: appendCampaignUtm(zone.url, campaign) }));
}

/**
 * The campaign whose UTMs a project's CTAs carry: among the ACTIVE
 * (not paused, not archived) campaigns that include the project and set at least one UTM field, the
 * most recently updated one (a deterministic answer for a public player
 * that can't ask). Null when none qualifies.
 */
export function pickProjectCampaign<C extends ProjectCampaignCandidate>(
  projectId: string,
  campaigns: readonly C[],
): C | null {
  let best: C | null = null;
  for (const campaign of campaigns) {
    if (campaign.status !== "active" || !campaign.projectIds.includes(projectId) || !hasCampaignUtm(campaign)) continue;
    if (!best || Date.parse(campaign.updatedAt) > Date.parse(best.updatedAt)) best = campaign;
  }
  return best;
}
