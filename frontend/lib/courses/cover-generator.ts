/**
 * Course-cover upload helper (#1400).
 *
 * The deterministic SVG itself now lives in [@shared/course-cover] so the
 * worker-side `GET /api/og/courses` endpoint renders byte-identical covers
 * (migration 0190 backfills the seed library's `cover_image_url` to that
 * endpoint). This module keeps the browser-only concern: render the shared
 * SVG into a Blob and push it through the existing single-file upload route
 * so a creator's "Auto-generate cover" CTA produces a hosted R2 asset.
 *
 * Why SVG and not canvas/raster: text stays crisp at every breakpoint the
 * course card uses, the rendered file is ~2KB (cheap CDN-cache hit), and SVG
 * is the universal social-card format LinkedIn / Slack / X unfurl bots
 * already understand.
 */

import { apiClient } from "@/lib/api-client";
import { renderCourseCoverSvg, type CourseCoverInput } from "@shared/course-cover";

/** Render the shared 1200×630 cover SVG into a Blob suitable for the
 *  existing single-upload route. */
export function renderCoverSvg(input: CourseCoverInput): Blob {
  return new Blob([renderCourseCoverSvg(input)], { type: "image/svg+xml" });
}

/** Build the cover and upload it to R2 via the existing single-file
 *  route. Returns the public URL ready to drop into
 *  `courses.cover_image_url`. */
export async function generateAndUploadCover(input: {
  courseId: string;
  title: string;
  category?: string | null;
  difficulty?: string | null;
}): Promise<string> {
  const blob = renderCoverSvg(input);
  const file = new File([blob], `course-${input.courseId}-cover.svg`, { type: "image/svg+xml" });
  const form = new FormData();
  form.append("file", file);
  form.append("kind", "course_cover");
  const res = await apiClient.post<{ url: string; key: string }>(
    "/api/upload/single",
    form,
  );
  return res.data.url;
}
