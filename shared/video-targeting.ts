/**
 * Who a video is made for (Angle board): four dimensions that combine. The
 * in-flow Design row sets the audience; the goal and start date add the
 * badge ("CONTRACT · FOR THE HIRING MANAGER") and the What's next line.
 * Stored on the video plan (`plan.targeting`, shared/video-plan.ts).
 */
import { z } from "zod";

export const VIDEO_AUDIENCES = ["hiringManager", "recruiter", "committee", "founders", "network"] as const;
export type VideoAudience = (typeof VIDEO_AUDIENCES)[number];

export const VIDEO_GOALS = ["fullTime", "contract", "fractional", "next"] as const;
export type VideoGoal = (typeof VIDEO_GOALS)[number];

export const VIDEO_STARTS = ["immediately", "twoWeeks", "date", "hidden"] as const;
export type VideoStart = (typeof VIDEO_STARTS)[number];

export const VideoTargetingSchema = z
  .object({
    audience: z.enum(VIDEO_AUDIENCES).optional(),
    goal: z.enum(VIDEO_GOALS).optional(),
    start: z.enum(VIDEO_STARTS).optional(),
    /** ISO date, when start = "date". */
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();
export type VideoTargeting = z.infer<typeof VideoTargetingSchema>;

/** The shapes a video can be cut to (each channel wants its own). */
export const VIDEO_ASPECTS = ["16:9", "9:16", "1:1"] as const;
export type VideoAspect = (typeof VIDEO_ASPECTS)[number];
