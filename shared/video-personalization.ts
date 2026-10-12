/**
 * Video personalization (Settings › Video personalization, Moments board):
 * what a person sets once so every video they make uses it — their own
 * words, up to three interests, personal moments, and how the theme is
 * chosen. Stored in `user_video_personalization` (migration 0503).
 *
 * The rule: we only use what the person gives us. Nothing here is ever
 * invented, and private dates (birthday, in memory) change the theme only —
 * they are never shown.
 */
import { z } from "zod";
import { VIDEO_THEME_IDS, type VideoThemeId } from "./video-themes.js";

export const OWN_WORDS_MAX = 200;
export const INTERESTS_MAX = 3;
export const INTEREST_MAX_LENGTH = 40;

/** Suggested interests (ids; labels are i18n `personalization.interest.<id>`).
 *  A person can also add their own words. */
export const INTEREST_IDS = ["coach", "runner", "coffee", "dogs", "gardening", "music", "volunteering", "cooking", "gaming", "sportsFan"] as const;

export const MonthDaySchema = z
  .object({ month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) })
  .strict()
  .refine((d) => d.day <= new Date(Date.UTC(2024, d.month, 0)).getUTCDate(), { message: "Not a real date" });
export type MonthDay = z.infer<typeof MonthDaySchema>;

export const ThemeChoiceSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("byDate") }).strict(),
  z.object({ mode: z.literal("fixed"), themeId: z.enum(VIDEO_THEME_IDS as [VideoThemeId, ...VideoThemeId[]]) }).strict(),
]);
export type ThemeChoice = z.infer<typeof ThemeChoiceSchema>;

export const VideoPersonalizationSchema = z
  .object({
    /** One sentence only they would say — read in the Who I am scene. */
    ownWords: z.string().trim().max(OWN_WORDS_MAX),
    /** Up to three, each a suggested id or their own words. */
    interests: z.array(z.string().trim().min(1).max(INTEREST_MAX_LENGTH)).max(INTERESTS_MAX),
    birthday: MonthDaySchema.nullable(),
    wedding: MonthDaySchema.nullable(),
    inMemory: MonthDaySchema.nullable(),
    /** Mother's Day, Father's Day and Back to school fit them. */
    isParent: z.boolean(),
    /** Use the current job's start date from the résumé. */
    useWorkAnniversary: z.boolean(),
    /** Use a recent graduation from the résumé. */
    useGraduation: z.boolean(),
    theme: ThemeChoiceSchema,
  })
  .strict();
export type VideoPersonalization = z.infer<typeof VideoPersonalizationSchema>;

export const DEFAULT_VIDEO_PERSONALIZATION: VideoPersonalization = {
  ownWords: "",
  interests: [],
  birthday: null,
  wedding: null,
  inMemory: null,
  isParent: false,
  useWorkAnniversary: true,
  useGraduation: true,
  theme: { mode: "byDate" },
};

/** True when the person has given us anything beyond the defaults. */
export function hasPersonalization(p: VideoPersonalization): boolean {
  return Boolean(p.ownWords || p.interests.length || p.birthday || p.wedding || p.inMemory || p.isParent);
}
