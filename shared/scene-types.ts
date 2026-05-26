/**
 * Studio scene types — single source of truth for the storyboard / video
 * script scene `type` discriminator (#1430).
 *
 * Consumed by:
 *   • api  — `routes/studio.ts` builds Zod schemas off `SCENE_TYPES`
 *            (StoryboardSceneSchema + VideoScriptSchema scene shape).
 *   • frontend — `lib/services/studio-service.ts` mirrors the same enum on
 *            `SceneScriptSchema` + `StoryboardSceneSchema` so server
 *            responses round-trip through client validation cleanly.
 *
 * Adding a new scene type is ONE edit here; both schemas pick it up
 * automatically through the `z.enum([...SCENE_TYPES])` widening.
 *
 * Grouped by intent so a reader skimming this file knows which branch
 * of the storyboard generator emits each shape:
 *   - Resume / job-seeker default                → intro, achievement, skills, closing
 *   - Job ad / company / recruiter / product     → job-details, company-culture, cta,
 *                                                  testimonial, product-feature,
 *                                                  brand-story, requirements, benefits
 *   - Course-lesson (#160 / #1412)               → concept, worked-example,
 *                                                  knowledge-check, summary
 */

export const SCENE_TYPES = [
  // Resume / job-seeker storyboard
  "intro",
  "achievement",
  "skills",
  "closing",
  // Advertising / promotional storyboards (job_ad, company_promo,
  // recruiter_brand, product_launch, personal_brand)
  "job-details",
  "company-culture",
  "cta",
  "testimonial",
  "product-feature",
  "brand-story",
  "requirements",
  "benefits",
  // Course-lesson pedagogy (#160 / #1412) — intro is reused from the
  // shared shapes above; these four are course-lesson-only.
  "concept",
  "worked-example",
  "knowledge-check",
  "summary",
] as const;

export type SceneType = (typeof SCENE_TYPES)[number];
