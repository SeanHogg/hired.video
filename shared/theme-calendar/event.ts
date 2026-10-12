/**
 * A theme-calendar event — the shape SuperAdmins edit (Studio › Calendar &
 * themes) and the picker reads. One row per event in `theme_calendar_events`;
 * yearly-table dates live in `theme_calendar_dates`.
 */
import { z } from "zod";
import { ASTRONOMICAL_POINTS } from "./dates.js";
import { THEME_TONES, VIDEO_THEME_IDS, type VideoThemeId } from "../video-themes.js";

/** Kinds, in the order they win ties. "offered" = observances, heritage
 *  months, religious and cultural days: shown as a choice, never picked
 *  unless the event fits the person. */
export const THEME_EVENT_KINDS = ["personal", "career", "holiday", "sports", "season", "offered", "custom"] as const;
export type ThemeEventKind = (typeof THEME_EVENT_KINDS)[number];

/** Default priority of each kind (custom events choose one of these). */
export const KIND_PRIORITY: Record<ThemeEventKind, number> = {
  personal: 500,
  career: 400,
  holiday: 300,
  sports: 200,
  season: 100,
  offered: 0,
  custom: 300,
};
export const PRIORITY_CHOICES = [400, 300, 200, 100] as const;

/** What about the person makes an event fit (and so auto-pickable). */
export const THEME_FITS = ["hiringManager", "veteran", "student", "teacher", "parent", "person"] as const;
export type ThemeFit = (typeof THEME_FITS)[number];

/** Who an event picks automatically. */
export const AUTO_PICKS = ["everyone", "whenFits", "never"] as const;
export type AutoPick = (typeof AUTO_PICKS)[number];

/** Moments that come from the person's own info (Settings › Video
 *  personalization, or the résumé). */
export const PERSON_MOMENTS = ["birthday", "workAnniversary", "graduation", "wedding", "inMemory"] as const;
export type PersonMoment = (typeof PERSON_MOMENTS)[number];

/** How the main day is found each year. */
export const DateRuleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("fixed"), month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) }).strict(),
  z
    .object({
      type: z.literal("nthWeekday"),
      month: z.number().int().min(1).max(12),
      /** 0 = Sunday … 6 = Saturday. */
      weekday: z.number().int().min(0).max(6),
      /** 1–5, or -1 for the last one. */
      nth: z.union([z.number().int().min(1).max(5), z.literal(-1)]),
      /** Shift (days) from that weekday, e.g. "the Saturday after". */
      offset: z.number().int().min(-14).max(14).optional(),
    })
    .strict(),
  z.object({ type: z.literal("computed"), point: z.enum(["easter", ...ASTRONOMICAL_POINTS]) }).strict(),
  /** Lunar, religious and sports dates: an admin enters each year's date. */
  z.object({ type: z.literal("table") }).strict(),
  z.object({ type: z.literal("person"), moment: z.enum(PERSON_MOMENTS) }).strict(),
]);
export type DateRule = z.infer<typeof DateRuleSchema>;
export const DATE_RULE_TYPES = ["fixed", "nthWeekday", "computed", "table", "person"] as const satisfies readonly DateRule["type"][];

/** Region codes: a country ("US", "CA") or a country region ("US-MW").
 *  An empty list = everywhere. */
export const THEME_REGIONS = ["US", "US-MW", "CA"] as const;
export const RegionCodeSchema = z.string().regex(/^[A-Z]{2}(-[A-Z0-9]{1,8})?$/);

/** SuperAdmin-authored copy, per locale ("en" required). */
export const LocalizedTextSchema = z
  .object({ en: z.string().max(160), es: z.string().max(160).optional(), "fr-CA": z.string().max(160).optional() })
  .strict();
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

export const THEME_EVENT_SLUG = /^[a-z0-9][a-z0-9-]{1,47}$/;

/** The editable fields of an event (create / update body). */
export const ThemeEventInputSchema = z
  .object({
    slug: z.string().regex(THEME_EVENT_SLUG),
    kind: z.enum(THEME_EVENT_KINDS),
    rule: DateRuleSchema,
    /** Days before the main day the theme starts showing. */
    runupDays: z.number().int().min(0).max(120),
    /** Days after the main day it keeps showing. */
    afterDays: z.number().int().min(0).max(180),
    autoPick: z.enum(AUTO_PICKS),
    fits: z.array(z.enum(THEME_FITS)).max(THEME_FITS.length),
    regions: z.array(RegionCodeSchema).max(20),
    priority: z.number().int().min(0).max(500),
    themeId: z.enum(VIDEO_THEME_IDS as [VideoThemeId, ...VideoThemeId[]]),
    tone: z.enum(THEME_TONES),
    name: LocalizedTextSchema,
    /** The opening line on the video; none for a respectful tone. */
    line: LocalizedTextSchema.nullable(),
    isActive: z.boolean(),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.tone === "respectful" && e.line) {
      ctx.addIssue({ code: "custom", path: ["line"], message: "A respectful theme has no opening line." });
    }
    if (e.autoPick === "whenFits" && e.fits.length === 0) {
      ctx.addIssue({ code: "custom", path: ["fits"], message: "Pick who it fits." });
    }
    if ((e.rule.type === "person") !== (e.kind === "personal")) {
      ctx.addIssue({ code: "custom", path: ["rule"], message: "Personal moments use the person's own dates." });
    }
  });
export type ThemeEventInput = z.infer<typeof ThemeEventInputSchema>;

/** One yearly-table date ("2027-02-06"). */
export const ThemeEventDateSchema = z.object({ year: z.number().int().min(2000).max(2100), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict();
export type ThemeEventDate = z.infer<typeof ThemeEventDateSchema>;

/** An event as the API returns it. */
export interface ThemeEvent extends ThemeEventInput {
  id: string;
  isBuiltin: boolean;
  /** Yearly-table dates (rule.type === "table"). */
  dates: ThemeEventDate[];
  updatedAt: string;
}
