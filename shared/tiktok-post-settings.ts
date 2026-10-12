/**
 * TikTok post settings — what the creator picks before a Direct Post, per
 * TikTok's Content Sharing Guidelines (required for the app audit):
 *
 *   • privacy is chosen from the creator's own `privacy_level_options` with NO
 *     default value;
 *   • comment / duet / stitch start OFF and are turned on by the creator
 *     (greyed out when the creator's account disables them);
 *   • commercial-content disclosure starts OFF; once on, the creator must say
 *     whether it promotes their own brand, someone else's (branded content),
 *     or both — and branded content can't be posted privately.
 *
 * Shared so the Post dock's form and the API validate with the SAME rules.
 */

/** The creator's account state from /v2/post/publish/creator_info/query/. */
export interface TikTokCreatorInfo {
  nickname: string;
  username: string | null;
  avatarUrl: string | null;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number | null;
}

export interface TikTokPostSettings {
  /** One of the creator's `privacyLevelOptions`. Empty until the creator picks. */
  privacyLevel: string;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  /** The disclosure switch itself (the two choices only count while it's on). */
  discloseContent: boolean;
  /** "Your brand" — promotes the creator's own business. */
  yourBrand: boolean;
  /** "Branded content" — paid partnership promoting someone else. */
  brandedContent: boolean;
}

/** Nothing picked — TikTok forbids pre-selecting any of these. */
export const EMPTY_TIKTOK_POST_SETTINGS: TikTokPostSettings = {
  privacyLevel: "",
  allowComment: false,
  allowDuet: false,
  allowStitch: false,
  discloseContent: false,
  yourBrand: false,
  brandedContent: false,
};

/** TikTok's privacy level for "Only me". */
export const TIKTOK_PRIVATE_LEVEL = "SELF_ONLY";

export type TikTokSettingsProblem = "privacy" | "disclosure" | "brandedPrivate";

/** Why these settings can't be posted yet, or null when they can. */
export function tiktokSettingsProblem(
  settings: TikTokPostSettings,
  privacyLevelOptions: readonly string[],
): TikTokSettingsProblem | null {
  if (!settings.privacyLevel || !privacyLevelOptions.includes(settings.privacyLevel)) return "privacy";
  if (settings.discloseContent && !settings.yourBrand && !settings.brandedContent) return "disclosure";
  if (settings.discloseContent && settings.brandedContent && settings.privacyLevel === TIKTOK_PRIVATE_LEVEL) {
    return "brandedPrivate";
  }
  return null;
}
