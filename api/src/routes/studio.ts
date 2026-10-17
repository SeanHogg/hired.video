import { STUDIO_PROJECT_LIST_FIELDS, parseFields, projectRows } from "../../../shared/projection.js";
import { Hono, type Context } from "hono";
import { and, asc, count, desc, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env, Variables, AppEnv } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { bumpSearchVersion } from "../utils/search-cache.js";
import { MediaRepository } from "../repositories/mediaRepository.js";
import { publicStudioProjectWhere } from "../repositories/studioPublicEngagementRepository.js";
import { tokenLedger } from "../domains/billing/token-ledger.js";
import { servicesProcessor } from "../domains/services-processing/index.js";
import { createLLMClient } from "../services/adapters/llm-client.js";
import { aiFailure, buildAIErrorEnvelope } from "../services/adapters/llm-error.js";
import { isSuperAdmin } from "../middleware/superAdmin.js";
import { PageEmbedService, bumpPageEmbedsVersion } from "../services/studio/page-embed-service.js";
import {
  PRO_MONTHLY_PRICE,
  PRO_YEARLY_PRICE,
  PRO_AI_MONTHLY_TOKENS,
  FREE_AI_MONTHLY_TOKENS,
  FREE_PUBLISHED_VIDEOS_LIMIT,
  FREE_INTERVIEW_SESSIONS_PER_MONTH,
  TOKEN_PACKS,
} from "../../../shared/pricing.js";
import { getSubscription } from "../services/billing/BillingService.js";
import { requirePro, requireVideoAnalytics } from "../middleware/tierEnforcement.js";
import { cdnUrl } from "../utils/cdn.js";
import { screenPrompt, userBlockMessage } from "../services/moderation/promptGuard.js";
import { TIER_COPY, TIER_ID, type AdTemplateTier } from "../../../shared/tier-copy.js";
import { USER_ROLES } from "../../../shared/user-roles.js";
import { STALE_REVISION_CODE } from "../../../shared/autosave.js";
import { STUDIO_SUBJECT_KINDS } from "../../../shared/studio-subject.js";
import {
  getPublicProjectsCached,
  invalidatePublicProjectsForSubjects,
} from "../services/studio/public-projects-cache.js";
import {
  bumpPublicWatchCache,
  getPublicWatchCached,
} from "../services/studio/public-watch-cache.js";
import { carryBakedStamp } from "../services/studio/baked-stamp.js";
import { STUDIO_PURPOSES } from "../../../shared/studio-purposes.js";
import { publicVideoPath } from "../../../shared/public-paths.js";
import { SCENE_TYPES, type SceneType } from "../../../shared/scene-types.js";
import { MEDIA_KINDS } from "../../../shared/media-kinds.js";
import { isUuid } from "../../../shared/value-types.js";
import {
  assertCanWrite,
  buildOwnershipFilter,
  canActFor,
  listAccessibleWorkspaces,
  resolveWorkspaceForWrite,
  WorkspaceForbiddenError,
  type WorkspaceSelection,
} from "../services/studio/workspace.js";
import { slugify, SLUG_PATTERN, isValidSlug } from "../../../shared/slugify.js";
import { extractCtaHotzones } from "../../../shared/cta-hotzones.js";
import { bakeCampaignUtmIntoHotzones } from "../../../shared/campaign-utm.js";
import { findProjectCampaignUtm } from "../services/studio/project-campaign-utm.js";
import type { Timeline } from "../../../shared/timeline.js";
import { deleteR2Keys } from "../services/storage/r2-delete.js";
import { reclaimVideoR2 } from "../services/storage/reclaim-video-r2.js";
import { OptionalUrlSchema, UuidLikeSchema } from "../../../shared/validation.js";
import {
  countPublishedChannelsByProject,
  listPublications,
  recordPublication,
  removePublication,
} from "../services/studio/publication-service.js";
import { postChannelGate } from "../services/studio/post-channel-gate.js";
import { candidateConsentGate } from "./candidate-consent-gate.js";
import { enforceCandidateVideoConsent } from "../services/candidate-consent/candidate-consent-deps.js";
import { applyProjectVisibility, forceProjectUnlisted, loadProjectSubjects } from "../services/studio/project-visibility.js";
import { getPublicVideoFeed, invalidatePublicVideoFeed } from "../services/studio/public-video-feed.js";
import { legacyScriptForPublic } from "../services/studio/public-video-state.js";
import { storyboardScriptKeys } from "../services/studio/storyboard-meta.js";
import { scheduleVideoScan } from "../services/moderation/explicit/schedule.js";
import { getVideoBucket, putObject } from "../services/storage/object-store.js";
import { deleteProjectWithMedia } from "../services/studio/delete-project-media.js";

const { studioProjects, studioProjectSubjects, videos, users, userProfiles, studioBrandKits, videoAnalytics, videoCampaigns, videoCampaignProjects, resumeInformation } = schema;

// Studio purpose enum lives in shared/studio-purposes.ts so the
// frontend response validators can't drift away from the server's
// accepted set (this drift produced gap #491). The `basic` purpose
// covers the generic single-scene "Basic" content template.
const studioPurposeSchema = z.enum(STUDIO_PURPOSES);

/** Body field shape every Studio mutation now accepts. Personal flows
 *  omit the field and continue to behave exactly as before. */
const WorkspaceFieldSchema = z
  .union([
    z.object({ kind: z.literal("personal") }),
    z.object({ kind: z.literal("company"), companyId: UuidLikeSchema }),
    z.object({ kind: z.literal("delegated"), subjectUserId: UuidLikeSchema }),
  ])
  .optional()
  .nullable();

/** Pull the workspace selection from a request body, then verify it. */
async function resolveWorkspaceFromBody(
  actorUserId: string,
  body: any,
): Promise<{ ownerUserId: string; ownerCompanyId: string | null }> {
  const selection: WorkspaceSelection = body?.workspace ?? null;
  const ctx = await resolveWorkspaceForWrite(actorUserId, selection);
  return { ownerUserId: ctx.ownerUserId, ownerCompanyId: ctx.ownerCompanyId };
}

/** Parse `?workspace=` query strings into the read-side restriction shape.
 *  Accepts: "personal", "company:<uuid>", "delegated:<uuid>". Anything
 *  else (or absent) returns undefined → "no restriction, return all
 *  workspaces I can see". Auth is re-checked in the read by the
 *  buildOwnershipFilter caller. */
function parseWorkspaceQueryParam(
  raw: string | undefined,
):
  | { kind: "personal" }
  | { kind: "company"; companyId: string }
  | { kind: "delegated"; subjectUserId: string }
  | undefined {
  if (!raw) return undefined;
  if (raw === "personal") return { kind: "personal" };
  const [k, v] = raw.split(":");
  if (k === "company" && v) return { kind: "company", companyId: v };
  if (k === "delegated" && v) return { kind: "delegated", subjectUserId: v };
  return undefined;
}

/** Convert a project name into a public-URL-safe slug. The shared
 *  `slugify` keeps the pipeline (NFKD → strip → trim → 80 chars) in
 *  lock-step with every other slug in the codebase; the fallback here
 *  gives a brand-new project a stable id-derived stem so the slug
 *  column is never blank. Global uniqueness is enforced by
 *  `ensureUniqueProjectSlug` below — the saved value gets a `-N`
 *  suffix when a collision is detected so the public `/v/:slug`
 *  route resolves unambiguously. */
function makeProjectSlug(name: string, projectId: string | undefined): string {
  return slugify(name, {
    fallback: projectId ? `video-${projectId.slice(0, 8)}` : "video",
  });
}

/** Ensure the given base slug is unique across `studio_projects` by
 *  appending `-2`, `-3`, … on collision. Reads the dedicated
 *  `studio_projects.slug` column (migration 0141) which carries a
 *  partial unique index, so each candidate check is an O(log n) point
 *  lookup instead of the sequential JSONB scan this used to be (gap
 *  #661 — that scan blew the Cloudflare Worker CPU budget on every
 *  save-draft once the table grew). `selfProjectId` excludes the
 *  project being saved so its own current slug doesn't count as a
 *  collision (e.g. re-saving without changing the name).
 *
 *  Race-condition note: the DB unique index is now authoritative —
 *  if two simultaneous saves race past this check with the same
 *  base, the INSERT/UPDATE on the second one fails on the unique
 *  constraint. Callers handle that by retrying with a fresh suffix;
 *  here we just do the prospective check. */
async function ensureUniqueProjectSlug(
  db: ReturnType<typeof getDb>,
  baseSlug: string,
  selfProjectId: string | undefined,
): Promise<string> {
  // One aggregate row (bare-slug taken? + highest `-N` suffix) against the
  // indexed `slug` column — never streams every prefix-matching slug.
  const { baseTaken, maxSuffix } = await new MediaRepository(db).findProjectSlugCollision(baseSlug, selfProjectId);
  if (!baseTaken) return baseSlug;
  const next = Math.max(2, (maxSuffix ?? 1) + 1);
  // Pathological fallback — random suffix so the save still lands rather
  // than overflowing the 9-digit suffix window.
  if (next >= 1_000_000_000) return `${baseSlug}-${Date.now().toString(36).slice(-6)}`;
  return `${baseSlug}-${next}`;
}

export const studioRoutes = new Hono<AppEnv>();

// SCENE_TYPES + SceneType now live in shared/scene-types.ts (#1430) so the
// frontend Zod schemas in studio-service.ts stay in lock-step with the api
// union. Imported above.

const StoryboardSceneSchema = z.object({
  duration: z.number(),
  type: z.enum(SCENE_TYPES),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  text: z.string().optional(),
  skills: z.array(z.string()).optional(),
  visual: z.string(),
  camera: z.string(),
  // Advertising extras
  ctaUrl: z.string().optional(),
  ctaText: z.string().optional(),
  logoUrl: z.string().optional(),
});

const StoryboardSchema = z.object({
  style: z.object({
    theme: z.string(),
    color_palette: z.array(z.string()),
    font_style: z.string(),
  }),
  scenes: z.array(StoryboardSceneSchema),
});

const GenerateStoryboardSchema = z.object({
  resumeText: z.string().min(10),
  targetDuration: z.number().min(10).max(120).default(28),
  resumeId: UuidLikeSchema.optional(),
  prompt: z.string().max(500).optional(),
  jobDescription: z.string().max(4000).optional(),
  // No `model` or `temperature` fields on purpose — both are server-owned
  // (sourced from USE_CASE_PROFILES). End users never configure either;
  // SA-only overrides happen via the SuperAdmin admin tooling, not the
  // request body.
  resolution: z.enum(["720p", "1080p"]).optional(),
  motion: z.enum(["minimal", "moderate", "cinematic"]).optional(),
  // Advertising: set purpose to unlock ad-specific scene types + prompts
  purpose: studioPurposeSchema.default("resume"),
  // Brand kit to inject into generated script
  brandKitId: UuidLikeSchema.optional(),
  // CTA for ad use cases
  ctaUrl: z.string().url().optional(),
  ctaText: z.string().max(100).optional(),
});

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

function fail(code: string, message: string, details?: unknown) {
  return {
    success: false as const,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Prompt-safety gate for the AI generation routes (image / inpaint /
 * outpaint / comic / storyboard). Screens the user's free-form prompt
 * fields BEFORE any model fires — fast-fail, no token spend — and is the
 * authoritative block for the Workers-AI image path (which never touches
 * LLMClient) and for routes that catch LLM errors and fall back to a mock.
 * Returns a ready-to-return 422 response on a hit, or null when clean.
 * Single helper so all five routes share one rule set and one envelope.
 */
function guardGenerationPrompt(
  c: Context<AppEnv>,
  ...prompts: Array<string | null | undefined>
): Response | null {
  for (const p of prompts) {
    const screen = screenPrompt(p);
    if (!screen.safe) {
      return c.json(
        fail("CONTENT_BLOCKED", userBlockMessage(screen.category!), {
          category: screen.category,
        }),
        422,
      );
    }
  }
  return null;
}

function asIso(value: Date | string | null | undefined): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function mapStudioStatus(raw: string): "Draft" | "Processing" | "Exported" | "Publishing" | "Completed" | "Published" | "Failed" {
  const v = raw.toLowerCase();
  if (v === "draft" || v === "pending") return "Draft";
  if (v === "exported") return "Exported";
  if (v === "publishing") return "Publishing";
  if (v === "published") return "Published";
  if (v === "completed") return "Completed";
  if (v === "publish_failed" || v === "failed") return "Failed";
  return "Processing";
}

function normalizeStoryboard(input: unknown): z.infer<typeof StoryboardSchema> | null {
  const parsed = StoryboardSchema.safeParse(input);
  if (parsed.success) return parsed.data;

  const old = input as { scenes?: Array<{ title?: string; narration?: string; visuals?: string; duration?: number }> } | null;
  if (!old?.scenes?.length) return null;

  const converted = {
    style: {
      theme: "professional",
      color_palette: ["#0f172a", "#2563eb", "#14b8a6"],
      font_style: "Inter",
    },
    scenes: old.scenes.slice(0, 4).map((s, idx) => ({
      duration: s.duration ?? 8,
      type: (idx === 0 ? "intro" : idx === old.scenes!.length - 1 ? "closing" : idx % 2 === 0 ? "skills" : "achievement") as SceneType,
      title: s.title,
      text: s.narration,
      visual: s.visuals ?? "Professional office background",
      camera: "medium",
    })),
  };

  return StoryboardSchema.parse(converted);
}

// ─── VideoScript schema (mirrors frontend/types/video-script.ts) ─────────────

const VideoScriptSchema = z.object({
  video: z.object({
    duration: z.number(),
    fps: z.number().default(30),
    resolution: z.enum(["720p", "1080p"]).default("720p"),
    aspect: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
    theme: z.object({
      colorPalette: z.array(z.string()),
      fontFamily: z.string(),
      motion: z.enum(["minimal", "moderate", "cinematic"]).default("moderate"),
      transition: z.enum(["cut", "fade", "slide", "cinematic-fade"]).default("fade"),
      background: z.enum(["gradient", "dark-tech-grid", "particles", "solid"]).default("gradient"),
    }).passthrough(),
    // Preserve music selection and any other video-level fields
    audio: z.object({ track: z.string(), label: z.string(), volume: z.number() }).optional(),
    // Brand kit / advertising overlays
    logoUrl: z.string().optional(),
    logoPosition: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]).optional(),
    // Purpose label stored in the script so renderers can optimise for ad vs. resume
    purpose: studioPurposeSchema.optional(),
  }).passthrough(),
  scenes: z.array(z.object({
    id: z.string(),
    start: z.number(),
    duration: z.number(),
    type: z.enum(SCENE_TYPES),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    text: z.union([z.string(), z.array(z.string())]).optional(),
    items: z.array(z.string()).optional(),
    skills: z.array(z.string()).optional(),
    highlight: z.boolean().optional(),
    // Advertising fields
    ctaUrl: z.string().optional(),
    ctaText: z.string().optional(),
    ctaQrCode: z.boolean().optional(),   // generate QR from ctaUrl
    logoUrl: z.string().optional(),
    // Preserve all user-set per-scene customisations
    accentColor: z.string().optional(),
    backgroundImage: z.string().optional(),
    backgroundImagePosition: z.string().optional(),
    imageAnimation: z.string().optional(),
    sceneAudio: z.string().optional(),
    sceneAudioLabel: z.string().optional(),
    textAlign: z.string().optional(),
    contentPosition: z.string().optional(),
  }).passthrough()),
}).passthrough();

type VideoScript = z.infer<typeof VideoScriptSchema>;

/**
 * Convert a legacy Storyboard (old DB rows) into a VideoScript so both formats
 * go through the same compiler pipeline.
 */
function storyboardToVideoScript(sb: z.infer<typeof StoryboardSchema>, targetDuration: number): VideoScript {
  const perScene = Math.max(5, Math.round(targetDuration / sb.scenes.length));
  let cursor = 0;
  const scenes = sb.scenes.map((s, i) => {
    const start = cursor;
    cursor += perScene;
    return {
      id: `scene-${i}`,
      start,
      duration: perScene,
      type: s.type,
      title: s.title,
      subtitle: s.subtitle,
      text: s.text,
      skills: s.skills,
    };
  });
  return {
    video: {
      duration: cursor,
      fps: 30,
      resolution: "720p",
      aspect: "16:9",
      theme: {
        colorPalette: sb.style.color_palette,
        fontFamily: sb.style.font_style,
        motion: "moderate",
        transition: "fade",
        background: "gradient",
      },
    },
    scenes,
  };
}

function buildMockAdVideoScript(
  text: string,
  targetDuration: number,
  motion: "minimal" | "moderate" | "cinematic",
  purpose: StudioPurpose,
  ctaUrl?: string,
  ctaText?: string,
): VideoScript {
  const name = text.replace(/\s+/g, " ").trim().slice(0, 60) || "Company";
  const cta = ctaText ?? "Learn More";
  const ctaSubtitle = ctaUrl ?? "Visit our website";

  // Each template defines its own scene structure — scene count varies
  const scenesByPurpose: Record<StudioPurpose, Array<{ type: string; title: string; subtitle?: string; text?: string; items?: string[]; skills?: string[]; ctaUrl?: string; ctaText?: string }>> = {
    // "basic" template — user's `text` is the full brief; produce a
    // single intro scene from it so the editor lands on a usable
    // storyboard the user can immediately refine. No brand framing.
    basic: [
      { type: "intro", title: name, text: text.trim() },
    ],
    resume: [], // handled by the existing resume path
    job_ad: [
      { type: "intro",        title: name, subtitle: "We're Hiring", text: "Join a team that is changing the industry." },
      { type: "job-details",  title: "About the Role", items: ["Own end-to-end delivery of key features", "Collaborate with cross-functional teams", "Drive measurable business outcomes"] },
      { type: "requirements", title: "What We're Looking For", items: ["3+ years of relevant experience", "Strong communication & problem-solving skills", "Passion for innovation and growth"] },
      { type: "benefits",     title: "Why You'll Love It", items: ["Competitive salary & equity", "Remote-first flexibility", "Career growth & mentorship"] },
      { type: "cta",          title: "Ready to Apply?", text: "Take the next step in your career journey.", subtitle: ctaSubtitle, ctaUrl, ctaText: cta },
    ],
    company_promo: [
      { type: "intro",            title: name, subtitle: "Who We Are", text: "Building products that matter." },
      { type: "brand-story",      title: "Our Story", items: ["Founded with a mission to make a difference", "Grown to a team of passionate professionals", "Recognised for innovation and culture"] },
      { type: "company-culture",  title: "Our Culture", items: ["Collaborative and inclusive environment", "Innovation-driven mindset", "People-first leadership"] },
      { type: "testimonial",      title: "What People Say", items: ["'Best team I've ever worked with'", "'Truly flexible and empowering'", "'Real impact, real growth'"] },
      { type: "cta",              title: "Partner With Us", text: "Let's build the future together.", subtitle: ctaSubtitle, ctaUrl, ctaText: cta },
    ],
    recruiter_brand: [
      { type: "intro",       title: name, subtitle: "Talent Partner", text: "Connecting exceptional talent with great companies." },
      { type: "brand-story", title: "My Approach", items: ["Consultative, candidate-first methodology", "Deep expertise in niche markets", "Long-term partnership over transactional placements"] },
      { type: "testimonial", title: "Client Results", items: ["200+ successful placements", "Average 18-day time-to-fill", "94% 1-year retention rate"] },
      { type: "achievement", title: "Track Record", items: ["Partnered with 50+ companies across sectors", "Specialised in senior & executive search", "Trusted advisor for scaling engineering teams"] },
      { type: "cta",         title: "Let's Work Together", text: "Whether you're hiring or seeking your next role — reach out.", subtitle: ctaSubtitle, ctaUrl, ctaText: cta },
    ],
    product_launch: [
      { type: "intro",           title: name, subtitle: "Introducing Something New", text: "The solution your team has been waiting for." },
      { type: "product-feature", title: "Key Features", items: ["Blazing-fast performance from day one", "Seamless integrations with your existing stack", "AI-powered insights that save hours per week"] },
      { type: "benefits",        title: "Why It Matters", items: ["Reduce operational overhead by 40%", "Ship faster with fewer errors", "Delight your customers every time"] },
      { type: "testimonial",     title: "Early Results", items: ["'Cut our deploy time in half'", "'The ROI was immediate'", "'Our team adopted it in a day'"] },
      { type: "cta",             title: "Get Started Today", text: "Join thousands of teams already winning.", subtitle: ctaSubtitle, ctaUrl, ctaText: cta },
    ],
    personal_brand: [
      { type: "intro",       title: name, subtitle: "My Story", text: "Building a career that makes an impact." },
      { type: "brand-story", title: "What I Do", items: ["Helping businesses solve complex challenges", "Sharing expertise through content and speaking", "Mentoring the next generation of professionals"] },
      { type: "achievement", title: "Key Highlights", items: ["10+ years of industry experience", "Speaker at major conferences", "Published thought leader in the space"] },
      { type: "skills",      title: "Core Expertise", skills: ["Leadership", "Strategy", "Innovation", "AI & Technology", "Team Building"] },
      { type: "cta",         title: "Let's Connect", text: "Follow my journey and join the conversation.", subtitle: ctaSubtitle, ctaUrl, ctaText: cta },
    ],
    // SCORM-shaped lesson storyboard — learning-objective + concept +
    // worked-example + knowledge-check + summary. The real LLM path
    // generates a richer storyboard; this template seeds the editor with
    // a usable scaffold when the route short-circuits without an LLM.
    course_lesson: [
      { type: "intro",          title: name, subtitle: "Learning Objectives", text: text.trim() || "By the end of this lesson, you'll be able to apply the concept covered." },
      { type: "concept",        title: "Core Concept", items: ["Define the key term", "Explain when it applies", "Identify the failure modes"] },
      { type: "worked-example", title: "Worked Example", text: "Walk through a concrete scenario step-by-step so the abstract idea sticks." },
      { type: "knowledge-check",title: "Knowledge Check", items: ["Pause and answer in your own words", "Compare against the model answer", "Note what you'd refine"] },
      { type: "summary",        title: "Summary", text: "Recap the objective, the example, and the next lesson in the path." },
    ],
    // Video pitch (#1237) — a talking-head take recorded in Video Pitch
    // Lab; the scaffold only frames it (who I am → why me → let's talk).
    pitch: [
      { type: "intro", title: name, subtitle: "My Pitch", text: text.trim() || "Here's who I am and what I bring." },
      { type: "cta",   title: "Let's Talk", text: "I'd love to tell you more.", subtitle: ctaSubtitle, ctaUrl, ctaText: cta },
    ],
  };

  const rawScenes = scenesByPurpose[purpose] ?? scenesByPurpose.job_ad;
  const count = rawScenes.length;
  const perScene = Math.max(4, Math.round(targetDuration / count));

  // Assign id, start, duration to each scene
  const scenes = rawScenes.map((s, i) => ({
    id: `scene-${i}`,
    start: perScene * i,
    duration: perScene,
    ...s,
  })) as VideoScript["scenes"];

  return {
    video: {
      duration: perScene * count,
      fps: 30,
      resolution: "720p",
      aspect: "16:9",
      purpose,
      theme: {
        colorPalette: ["#1e3a5f", "#e8f4fd", "#f59e0b", "#ffffff"],
        fontFamily: "Inter",
        motion,
        transition: "fade",
        background: "gradient",
      },
    },
    scenes,
  };
}

function buildMockVideoScript(resumeText: string, targetDuration: number, motion: "minimal" | "moderate" | "cinematic" = "moderate"): VideoScript {
  let name = "";
  let label = "";
  let summary = "";
  let achievements: string[] = [];
  let skills: string[] = [];
  let contact = "";
  try {
    const parsed = JSON.parse(resumeText);
    const basics = parsed?.Basics ?? parsed?.basics ?? {};
    name    = basics.Name    ?? basics.name    ?? "";
    label   = basics.Label   ?? basics.label   ?? "";
    summary = basics.Summary ?? basics.summary ?? "";
    contact = basics.Email   ?? basics.email   ?? basics.LinkedIn ?? basics.linkedin ?? "";
    // Extract achievements from work highlights
    const work: Array<{ Highlights?: string[]; highlights?: string[] }> = parsed?.Work ?? parsed?.work ?? [];
    for (const w of work.slice(0, 3)) {
      const hl = w.Highlights ?? w.highlights ?? [];
      achievements.push(...hl.slice(0, 2));
    }
    // Extract skills
    const skillsData: Array<{ Name?: string; name?: string }> = parsed?.Skills ?? parsed?.skills ?? [];
    skills = skillsData.map((s) => s.Name ?? s.name ?? "").filter(Boolean);
  } catch {
    name = resumeText.replace(/\s+/g, " ").trim().slice(0, 80);
  }
  const introSubtitle = label || "Experienced Professional";
  const introText     = summary.slice(0, 200) || "Passionate professional ready to make an impact.";
  const resolvedItems = achievements.length >= 3 ? achievements.slice(0, 4) : ["Delivered measurable results with quantifiable impact", "Led initiatives that drove team efficiency and growth", "Consistently exceeded expectations across key projects"];
  const resolvedSkills = skills.length >= 3 ? skills.slice(0, 8) : ["Communication", "Problem Solving", "Leadership", "Execution", "Strategy"];
  const closingContact = contact || "Connect on LinkedIn";
  const perScene = Math.max(5, Math.round(targetDuration / 4));
  return {
    video: {
      duration: perScene * 4,
      fps: 30,
      resolution: "720p",
      aspect: "16:9",
      theme: {
        colorPalette: ["#0f172a", "#2563eb", "#14b8a6", "#f8fafc"],
        fontFamily: "Inter",
        motion,
        transition: "fade",
        background: "gradient",
      },
    },
    scenes: [
      { id: "scene-0", start: 0,            duration: perScene, type: "intro",       title: name || "Professional Introduction", subtitle: introSubtitle, text: introText },
      { id: "scene-1", start: perScene,     duration: perScene, type: "achievement", title: "Key Achievements", items: resolvedItems },
      { id: "scene-2", start: perScene * 2, duration: perScene, type: "skills",      title: "Core Skills",     skills: resolvedSkills },
      { id: "scene-3", start: perScene * 3, duration: perScene, type: "closing",     title: "Let's Connect",   text: "Open to exciting new opportunities — let's talk.", subtitle: closingContact },
    ],
  };
}

// StudioPurpose is re-exported below from shared/studio-purposes.ts.
type StudioPurpose = (typeof STUDIO_PURPOSES)[number];

/** Detect an explicit scene-count constraint inside the user's free-form
 *  prompt. Without this, the per-purpose system-prompt RULES baseline
 *  (e.g. "5 scenes: intro → benefits → cta") silently overrides phrases
 *  like "one scene only" / "single scene" the user actually wrote (gap
 *  #483). Returns the constrained count or `null` if the prompt doesn't
 *  pin one. A `targetDuration` ≤ 8s also forces 1 scene — a sub-10s
 *  multi-scene video is jarringly short per scene. */
const WORD_TO_COUNT: Record<string, number> = {
  one: 1, single: 1, two: 2, three: 3, four: 4, five: 5,
};
export function detectExplicitSceneCount(
  prompt: string | undefined,
  targetDuration: number,
): number | null {
  if (targetDuration <= 8) return 1;
  if (!prompt) return null;
  const lower = prompt.toLowerCase();
  // Explicit "single scene" / "one scene only" / "one-scene" phrasings.
  const wordMatch = lower.match(/\b(one|single|two|three|four|five)[- ]scenes?\b/);
  if (wordMatch && wordMatch[1] in WORD_TO_COUNT) {
    return WORD_TO_COUNT[wordMatch[1]];
  }
  // Numeric "1 scene" / "2 scenes" etc.
  const numericMatch = lower.match(/\b(\d{1,2})\s+scenes?\b/);
  if (numericMatch) {
    const n = parseInt(numericMatch[1], 10);
    if (n >= 1 && n <= 20) return n;
  }
  // "No chapters" / "no transitions" — a soft signal the user wants
  // one continuous shot. Treat as 1 only when paired with sub-15s
  // total duration so we don't over-collapse longer videos.
  if (/\bno (?:chapters?|transitions?|scenes?)\b/.test(lower) && targetDuration <= 15) {
    return 1;
  }
  return null;
}

function buildStudioSystemPrompt(
  targetDuration: number,
  motion: string,
  jobDescription?: string,
  purpose: StudioPurpose = "resume",
  ctaUrl?: string,
  ctaText?: string,
  explicitSceneCount?: number | null,
): string {
  const ctaBlock = ctaUrl ? `\n- For the "cta" scene: ctaUrl: "${ctaUrl}", ctaText: "${ctaText ?? "Learn More"}"` : "";
  const typeInterface = `"intro"|"achievement"|"skills"|"closing"|"job-details"|"company-culture"|"cta"|"testimonial"|"product-feature"|"brand-story"|"requirements"|"benefits"`;

  // Course-lesson scene shapes (#160 / #1412) — pedagogy-specific scene
  // types layered on top of the existing union. The mock storyboard
  // already uses these literal strings so keeping them in the type union
  // means the LLM output passes Zod validation against VideoScriptSchema.
  const lessonTypeInterface = `"intro"|"concept"|"worked-example"|"knowledge-check"|"summary"|"cta"`;

  const baseInterface = `TypeScript interface:
interface VideoScript {
  video: { duration: number; fps: 30; resolution: "720p"; aspect: "16:9"; purpose: string; theme: { colorPalette: string[]; fontFamily: string; motion: string; transition: string; background: string } }
  scenes: Array<{ id: string; start: number; duration: number; type: ${typeInterface}; title?: string; subtitle?: string; text?: string; items?: string[]; skills?: string[]; ctaUrl?: string; ctaText?: string }>
}`;

  const lessonInterface = `TypeScript interface:
interface VideoScript {
  video: { duration: number; fps: 30; resolution: "720p"; aspect: "16:9"; purpose: "course_lesson"; theme: { colorPalette: string[]; fontFamily: string; motion: string; transition: string; background: string } }
  scenes: Array<{ id: string; start: number; duration: number; type: ${lessonTypeInterface}; title?: string; subtitle?: string; text?: string; items?: string[]; ctaUrl?: string; ctaText?: string }>
}`;

  if (purpose === "basic") {
    return `You are a video script writer. Produce a JSON VideoScript for a ${targetDuration}-second single-scene video.

RULES:
- Exactly 1 scene of type "intro"
- Scene duration must equal ${targetDuration}s
- motion style: ${motion}
- Return ONLY valid JSON. No markdown fences, no explanation.

SCENE CONTENT — produced from the brief the user wrote (provided below). The brief IS the script. Do NOT invent brand framing, mission statements, or hype unless the brief explicitly asks for them. Do NOT add extra scenes (no chapters, no CTA scene, no transitions). One scene only.

1. "intro" scene: title = a short headline derived from the brief (max 8 words); subtitle = a one-line tagline if the brief implies one, otherwise omit; text = the core message the brief is asking for, rewritten for the camera in 1–3 sentences. Add items/skills only if the brief actually lists them.${ctaBlock}

${baseInterface}

Brief:
`;
  }

  if (purpose === "job_ad") {
    const jd = (jobDescription ?? "").slice(0, 3000);
    return `You are a recruitment advertising director. Produce a JSON VideoScript for a ${targetDuration}-second job advertisement.

RULES:
- 5 scenes: intro → job-details → requirements → benefits → cta
- Scene durations must sum to exactly ${targetDuration}s
- motion style: ${motion}
- Return ONLY valid JSON. No markdown fences.

SCENE CONTENT (derived from the job description provided):
1. "intro" scene: title = company name, subtitle = job title, text = one compelling hook sentence about the opportunity
2. "job-details" scene: title = "About the Role", items = 3–4 key responsibilities as concise bullet points
3. "requirements" scene: title = "What We're Looking For", items = 3–4 must-have qualifications/skills
4. "benefits" scene: title = "Why You'll Love It", items = 3–4 perks, benefits, or reasons to join
5. "cta" scene: title = "Ready to Apply?", text = brief encouraging CTA copy, subtitle = "Apply Now"${ctaBlock}

${baseInterface}

Job Description:
${jd}`;
  }

  if (purpose === "company_promo") {
    return `You are a corporate video director. Produce a JSON VideoScript for a ${targetDuration}-second company promotional video.

RULES:
- 5 scenes: intro → brand-story → company-culture → testimonial → cta
- Scene durations must sum to exactly ${targetDuration}s
- motion style: ${motion}
- Return ONLY valid JSON. No markdown fences.

SCENE CONTENT (derived from the company brief provided):
1. "intro" scene: title = company name, subtitle = tagline or sector, text = 1–2 sentence mission statement
2. "brand-story" scene: title = "Our Story", items = 3–4 key milestones or differentiators
3. "company-culture" scene: title = "Our Culture", items = 3–4 culture/team highlights
4. "testimonial" scene: title = "What People Say", items = 3–4 employee or partner quotes
5. "cta" scene: title = "Partner With Us" (or "Hire With Us"), text = brief engaging close, subtitle = website or contact${ctaBlock}

${baseInterface}

Company Brief:
`;
  }

  if (purpose === "recruiter_brand") {
    return `You are a personal-brand video director. Produce a JSON VideoScript for a ${targetDuration}-second recruiter brand video.

RULES:
- 5 scenes: intro → brand-story → testimonial → achievement → cta
- Scene durations must sum to exactly ${targetDuration}s
- motion style: ${motion}
- Return ONLY valid JSON. No markdown fences.

SCENE CONTENT (derived from the bio/profile provided):
1. "intro" scene: title = recruiter name, subtitle = specialisation (e.g. "Tech Recruiter · 10+ Years"), text = 1-sentence personal brand statement
2. "brand-story" scene: title = "My Approach", items = 3–4 values or differentiators that define this recruiter
3. "testimonial" scene: title = "Client Results", items = 3–4 quantified outcomes (placements made, time-to-fill improvements, retention rates)
4. "achievement" scene: title = "Track Record", items = 3–4 career highlights or partnership milestones
5. "cta" scene: title = "Let's Work Together", text = one warm closing line, subtitle = LinkedIn or email${ctaBlock}

${baseInterface}

Bio/Profile:
`;
  }

  if (purpose === "product_launch") {
    return `You are a product marketing director. Produce a JSON VideoScript for a ${targetDuration}-second product launch video.

RULES:
- 5 scenes: intro → product-feature → benefits → testimonial → cta
- Scene durations must sum to exactly ${targetDuration}s
- motion style: ${motion}
- Return ONLY valid JSON. No markdown fences.

SCENE CONTENT (derived from the product brief provided):
1. "intro" scene: title = product name, subtitle = one-liner value proposition, text = the core problem this product solves
2. "product-feature" scene: title = "Key Features", items = 3–4 standout features with concrete outcomes
3. "benefits" scene: title = "Why It Matters", items = 3–4 tangible benefits for the target user
4. "testimonial" scene: title = "Early Results", items = 3–4 user quotes or measurable early outcomes
5. "cta" scene: title = "Get Started Today", text = urgency-driven closing line, subtitle = "Try for free" or pricing anchor${ctaBlock}

${baseInterface}

Product Brief:
`;
  }

  if (purpose === "personal_brand") {
    const jobBlock = jobDescription
      ? `\n\nPersonalise for this role. Filter content to only what's relevant.\nJob Description:\n${jobDescription.slice(0, 3000)}`
      : "";
    return `You are a personal-brand video director. Produce a JSON VideoScript for a ${targetDuration}-second personal brand video.

RULES:
- 5 scenes: intro → brand-story → achievement → skills → cta
- Scene durations must sum to exactly ${targetDuration}s
- motion style: ${motion}
- Return ONLY valid JSON. No markdown fences, no explanation.

SCENE CONTENT — extract from the bio/resume provided:
1. "intro" scene: title = person's name, subtitle = their role or tagline, text = 1–2 sentence personal mission statement
2. "brand-story" scene: title = "What I Do", items = 3–4 areas of focus, expertise, or impact
3. "achievement" scene: title = "Key Highlights", items = 3–4 real career milestones with specific numbers or outcomes
4. "skills" scene: title = "Core Expertise", skills = 5–8 specific skills, domains, or technologies
5. "cta" scene: title = "Let's Connect", text = a warm invitation to follow or reach out, subtitle = LinkedIn/email or "Connect on LinkedIn"

${baseInterface}${jobBlock}`;
  }

  if (purpose === "course_lesson") {
    // #1412 — pedagogy-specific scene shapes: learning-objective intro →
    // concept → worked-example → knowledge-check → summary. Matches the
    // mock storyboard scaffold in `course_lesson` of `scenesByPurpose`
    // above, so the editor renders the LLM output identically whether
    // we short-circuited or called the model.
    return `You are an instructional designer producing micro-learning lessons. Produce a JSON VideoScript for a ${targetDuration}-second course lesson video.

RULES:
- Exactly 5 scenes in order: intro → concept → worked-example → knowledge-check → summary
- Scene durations must sum to exactly ${targetDuration}s. Divide sensibly (e.g. for 180s: 25/40/55/30/30)
- motion style: ${motion}
- Tone: instructive, concrete, scoped to ONE objective. No marketing hype, no CTAs (this is training, not promo).
- Return ONLY valid JSON. No markdown fences, no explanation.

SCENE CONTENT — distilled from the lesson brief the user wrote below:
1. "intro" scene:
   - title: a short lesson title (max 8 words)
   - subtitle: "Learning Objectives"
   - text: 1–2 sentences in "By the end of this lesson, you will be able to…" form. State exactly ONE primary objective.
2. "concept" scene:
   - title: "Core Concept" (or the concept's name)
   - items: 3–4 bullets defining the concept (definition · when it applies · failure mode · contrast with a related concept)
3. "worked-example" scene:
   - title: "Worked Example"
   - text: a concrete scenario in 2–4 sentences narrated as a step-by-step solution path. Show the work; do NOT just state the answer.
4. "knowledge-check" scene:
   - title: "Knowledge Check"
   - items: 3 short check-yourself prompts the learner can answer in their head (one recall, one application, one transfer)
5. "summary" scene:
   - title: "Summary"
   - text: 1–2 sentence recap restating the objective, what they should now be able to do, and one suggested next step.

${lessonInterface}

Lesson Brief:
`;
  }

  // Default: resume
  const jobBlock = jobDescription
    ? `\n\nPersonalise the intro scene for this role. Filter achievements and skills to only those relevant.\nJob Description:\n${jobDescription.slice(0, 3000)}`
    : "";
  // When the caller pinned an explicit scene count (e.g. user wrote
  // "one scene only") prepend a strict override block that beats the
  // per-purpose RULES default further down. Without this, "5 scenes"
  // baselines silently override user intent (gap #483).
  const overrideBlock = explicitSceneCount != null
    ? `STRICT USER OVERRIDE: The user pinned scene count = ${explicitSceneCount}. Produce exactly ${explicitSceneCount} scene${explicitSceneCount === 1 ? "" : "s"} regardless of the default scene plan below. Scene durations still must sum to ${targetDuration}s.\n\n`
    : "";
  return `${overrideBlock}You are a professional video director and career storyteller. Produce a JSON VideoScript for a ${targetDuration}-second video resume that powerfully showcases this specific candidate.

RULES:
- Exactly 4 scenes in order: intro → achievement → skills → closing
- Scene durations must sum to exactly ${targetDuration}s. Divide sensibly (e.g. 7/7/7/7 for 28s)
- motion style: ${motion}
- Return ONLY valid JSON. No markdown fences, no explanation.

SCENE CONTENT — extract everything from the resume provided:
1. "intro" scene:
   - title: candidate's exact full name
   - subtitle: most recent job title and company (format "Role · Company")
   - text: a compelling 1–2 sentence elevator pitch derived from their summary and career arc. Make it specific to this person — never use generic phrases.

2. "achievement" scene:
   - title: "Key Achievements"
   - items: 3–4 real, measurable bullet points from their work history with specific numbers, outcomes, or business impact where available. NEVER use placeholder text like "Delivered impactful results".

3. "skills" scene:
   - title: "Core Skills"
   - skills: 5–8 specific skills taken directly from the resume (technologies, tools, domains). Use the exact names as listed.

4. "closing" scene:
   - title: a warm CTA reflecting the candidate's personality inferred from the resume (e.g. a maker → "Let's Build Something Great", a leader → "Ready to Drive Your Next Chapter")
   - text: a memorable 1-sentence personal brand statement capturing what makes this candidate unique
   - subtitle: their LinkedIn URL or email from the resume, or "Connect on LinkedIn" if not found

${baseInterface}${jobBlock}`;
}

// ---------------------------------------------------------------------------
// GET /api/studio/templates — video template library (basic free, advanced Pro)
// ---------------------------------------------------------------------------

const BASIC_TEMPLATES = [
  {
    id: "professional-clean",
    name: "Professional Clean",
    description: "Minimalist corporate style with clean typography",
    tier: "free",
    style: { theme: "professional", color_palette: ["#0f172a", "#2563eb", "#f8fafc"], font_style: "Inter" },
    motion: "minimal",
    resolution: "720p",
    previewUrl: null,
  },
  {
    id: "modern-bold",
    name: "Modern Bold",
    description: "Bold headlines with strong contrast",
    tier: "free",
    style: { theme: "modern", color_palette: ["#111827", "#f59e0b", "#ffffff"], font_style: "Poppins" },
    motion: "minimal",
    resolution: "720p",
    previewUrl: null,
  },
  {
    id: "creative-gradient",
    name: "Creative Gradient",
    description: "Vibrant gradients for creative roles",
    tier: "free",
    style: { theme: "creative", color_palette: ["#6d28d9", "#ec4899", "#fef3c7"], font_style: "Nunito" },
    motion: "minimal",
    resolution: "720p",
    previewUrl: null,
  },
];

const PRO_TEMPLATES = [
  {
    id: "executive-platinum",
    name: "Executive Platinum",
    description: "Cinematic executive presence with 1080p output and animated transitions",
    tier: "pro",
    style: { theme: "executive", color_palette: ["#0c0a09", "#d4af37", "#fafafa"], font_style: "Playfair Display" },
    motion: "cinematic",
    resolution: "1080p",
    previewUrl: null,
  },
  {
    id: "tech-dark",
    name: "Tech Dark",
    description: "Dark mode with code-inspired motifs — ideal for engineering roles",
    tier: "pro",
    style: { theme: "tech", color_palette: ["#020617", "#22d3ee", "#a3e635"], font_style: "JetBrains Mono" },
    motion: "moderate",
    resolution: "1080p",
    previewUrl: null,
  },
  {
    id: "corporate-brand",
    name: "Corporate Brand",
    description: "Customisable brand colours and logo placement for employer videos",
    tier: "pro",
    style: { theme: "corporate", color_palette: ["#1e3a5f", "#e8f4fd", "#ffffff"], font_style: "Roboto" },
    motion: "moderate",
    resolution: "1080p",
    previewUrl: null,
  },
  {
    id: "cinematic-story",
    name: "Cinematic Story",
    description: "Narrative-driven format with full-motion transitions and scene depth",
    tier: "pro",
    style: { theme: "cinematic", color_palette: ["#1a1a2e", "#e94560", "#f5f5f5"], font_style: "Montserrat" },
    motion: "cinematic",
    resolution: "1080p",
    previewUrl: null,
  },
  {
    id: "startup-energy",
    name: "Startup Energy",
    description: "Fast-paced, high-energy format for startup and growth-stage roles",
    tier: "pro",
    style: { theme: "startup", color_palette: ["#0ea5e9", "#8b5cf6", "#f0fdf4"], font_style: "DM Sans" },
    motion: "cinematic",
    resolution: "1080p",
    previewUrl: null,
  },
];

studioRoutes.get("/templates", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);

  const sub = await getSubscription(userId);
  const templates = sub.isPro
    ? [...BASIC_TEMPLATES, ...PRO_TEMPLATES]
    : BASIC_TEMPLATES.map((t) => ({ ...t, lockedCount: PRO_TEMPLATES.length }));

  return c.json({ success: true, data: { templates, isPro: sub.isPro } }, 200);
});

studioRoutes.post("/storyboard", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = GenerateStoryboardSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }

  const {
    resumeText, prompt, jobDescription,
    targetDuration = 28, motion = "moderate",
    purpose = "resume", brandKitId, ctaUrl, ctaText,
  } = parsed.data;

  // Authoritative safety gate. The LLMClient net already screens this
  // input, but this route catches LLM errors and falls back to a mock
  // script — so a net-thrown block would be swallowed and still produce
  // output. Screen here (and for the "basic" mock branch, which never
  // calls the LLM at all) so a blocked prompt is refused outright.
  const blocked = guardGenerationPrompt(c, prompt, jobDescription, resumeText);
  if (blocked) return blocked;

  // Optionally load brand kit to inject colours into generated script
  let brandKit: typeof studioBrandKits.$inferSelect | null = null;
  if (brandKitId) {
    const db = getDb();
    const [kit] = await db
      .select()
      .from(studioBrandKits)
      .where(and(eq(studioBrandKits.id, brandKitId), eq(studioBrandKits.userId, user.sub)))
      .limit(1);
    brandKit = kit ?? null;
  }

  let script: VideoScript;

  // "Basic" is a blank-starter template — the user expects a single
  // empty intro scene to land in the editor, NOT a 30-second LLM
  // round-trip + token charge. The mock builder's `basic` branch
  // already produces exactly that (one intro scene seeded from the
  // user's brief). Skip the LLM entirely.
  if (purpose === "basic") {
    const brief = (prompt?.trim() || resumeText.trim()).slice(0, 6000);
    script = buildMockAdVideoScript(brief, targetDuration, motion, purpose, ctaUrl, ctaText);
  } else {
    const llm = createLLMClient(c.env, c.var.user);
    const explicitSceneCount = detectExplicitSceneCount(prompt, targetDuration);
    const systemPrompt = buildStudioSystemPrompt(
      targetDuration, motion, jobDescription, purpose, ctaUrl, ctaText, explicitSceneCount,
    );
    const defaultPrompt = purpose === "resume"
      ? "Create a professional video resume"
      : purpose === "job_ad" ? "Create a compelling job advertisement video"
      : purpose === "company_promo" ? "Create an engaging company promotional video"
      : purpose === "recruiter_brand" ? "Create a recruiter personal brand video"
      : purpose === "course_lesson" ? "Create a short course lesson teaching one concept end-to-end"
      : purpose === "pitch" ? "Create a short personal video pitch introducing me to recruiters"
      : "Create a product launch video";

    try {
      // 45s ceiling on the LLM round-trip (#481) — without this the
      // route blocks until the client's 360s NetworkError fires while
      // GenerationProgressDialog spins with no cancel affordance. A
      // timeout falls through to the same mock branch as a hard error.
      const STORYBOARD_LLM_TIMEOUT_MS = 45_000;
      const callPromise = llm.callJson("studio_storyboard", {
        useCase: "studio_script",
        systemPrompt,
        userMessage: `${prompt || defaultPrompt}\n\n${resumeText.slice(0, 6000)}`,
      }, VideoScriptSchema);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Storyboard LLM timeout after ${STORYBOARD_LLM_TIMEOUT_MS}ms`)),
          STORYBOARD_LLM_TIMEOUT_MS,
        );
      });
      const { data } = await Promise.race([callPromise, timeoutPromise]);
      script = data;
    } catch (err) {
      // Configured-but-threw (or timed out) — surface a typed AI_*
      // envelope instead of silently serving a mock storyboard as if the
      // AI generated it. The `basic` purpose above is a deliberate
      // blank-starter template, not an error fallback.
      return aiFailure(c, err, "[studio/storyboard] LLM call failed");
    }
  }

  // Inject brand kit colours/font if provided
  if (brandKit) {
    script = {
      ...script,
      video: {
        ...script.video,
        purpose,
        logoUrl: brandKit.logoUrl ?? script.video.logoUrl,
        theme: {
          ...script.video.theme,
          colorPalette: [brandKit.primaryColor, brandKit.secondaryColor, brandKit.accentColor, "#ffffff"],
          fontFamily: brandKit.fontFamily,
        },
      },
    };
  } else {
    script = { ...script, video: { ...script.video, purpose } };
  }

  // NOTE: Do NOT auto-save a project here. The script is returned to the
  // frontend and only persisted when the user explicitly clicks Save.

  return c.json(ok(script), 201);
});

// ─── POST /api/studio/generate-comic ─────────────────────────────────────────
// AI scaffolder for the Comic mediaKind. Reads the user's prompt +
// genre + source kind, resolves the source artefact (resume / profile /
// services), runs the LLM via `scaffoldComic()`, and returns a
// ComicSpec the frontend mounts as a CanvasState. The frontend
// (`useGenerateComic`) is the single consumer.
//
// Token metering: scaffoldComic runs through `LLMClient.callJson`,
// which charges the user's ledger on success. No extra per-route
// gating — `tokenLedger.ensureBudget` is called inside the client.
const GenerateComicSchema = z.object({
  prompt: z.string().max(2000).default(""),
  genreId: z.string().max(40).optional(),
  protagonistName: z.string().max(80).default(""),
  sourceKind: z.enum(["resume", "profile", "services", "auto"]).default("auto"),
  /** When the source is "auto" the route picks the richest artefact
   *  available (resume > profile + services > prompt alone). The
   *  client can pin a specific resume by id; otherwise the user's
   *  master resume is loaded. */
  resumeId: UuidLikeSchema.optional(),
  /** When true (#939 hybrid AI character portrait) the route also
   *  generates ONE genre-styled portrait of the protagonist via
   *  Workers AI SDXL-Lightning + threads the resulting CDN URL into
   *  every page's `characterUrl` slot. Off by default to keep the
   *  fast path cheap. */
  generateCharacterPortrait: z.boolean().default(false),
});

studioRoutes.post("/generate-comic", async (c) => {
  const user = c.var.user;
  if (!user?.sub) {
    return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = GenerateComicSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()),
      400,
    );
  }
  const input = parsed.data;

  const blocked = guardGenerationPrompt(c, input.prompt, input.protagonistName);
  if (blocked) return blocked;

  // ─── Resolve source artefact ─────────────────────────────────────
  // Single read path — the route looks up exactly the artefact the
  // user asked for. "auto" walks the priority chain (resume → profile
  // → services → empty); the scaffolder accepts an empty source and
  // falls back to the prompt-only path.
  const db = getDb();
  let sourceText = "";
  let resolvedSourceKind = input.sourceKind;

  const loadResume = async (): Promise<string> => {
    const where = input.resumeId
      ? and(eq(resumeInformation.id, input.resumeId), eq(resumeInformation.userId, user.sub))
      : eq(resumeInformation.userId, user.sub);
    const [row] = await db.select().from(resumeInformation).where(where).limit(1);
    if (!row?.content) return "";
    // Single source of truth for the JSONB → plaintext flattening
    // lives in `services/resume/parse.ts` (`resumeContentToText`). It
    // handles modern + legacy formats. We pass an 8000-char cap to
    // match the storyboard route's existing slicing (the scaffolder
    // additionally caps at 6000 before sending to the LLM).
    const { resumeContentToText } = await import("../services/resume/parse.js");
    return resumeContentToText(row.content, 8000);
  };

  const loadProfile = async (): Promise<string> => {
    const [row] = await db
      .select({
        name: users.name,
        headline: userProfiles.headline,
        summary: userProfiles.summary,
        location: userProfiles.location,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.id, user.sub))
      .limit(1);
    if (!row) return "";
    const lines: string[] = [];
    if (row.name)     lines.push(`Name: ${row.name}`);
    if (row.headline) lines.push(`Headline: ${row.headline}`);
    if (row.summary)  lines.push(`Summary: ${row.summary}`);
    if (row.location) lines.push(`Location: ${row.location}`);
    return lines.join("\n");
  };

  const loadServices = async (): Promise<string> => {
    const rows = await db
      .select({
        title: schema.serviceOfferings.title,
        description: schema.serviceOfferings.description,
        category: schema.serviceOfferings.category,
        priceCents: schema.serviceOfferings.priceCents,
      })
      .from(schema.serviceOfferings)
      .where(eq(schema.serviceOfferings.userId, user.sub))
      .limit(20);
    return rows
      .map(
        (s) =>
          `• ${s.title}${s.category ? ` (${s.category})` : ""}: ${s.description ?? ""}${s.priceCents ? ` — $${(s.priceCents / 100).toFixed(0)}` : ""}`,
      )
      .join("\n");
  };

  if (resolvedSourceKind === "resume") {
    sourceText = await loadResume();
  } else if (resolvedSourceKind === "profile") {
    sourceText = await loadProfile();
  } else if (resolvedSourceKind === "services") {
    sourceText = await loadServices();
  } else {
    // auto — try resume first, then profile + services
    sourceText = await loadResume();
    if (sourceText) {
      resolvedSourceKind = "resume";
    } else {
      const [profileText, servicesText] = await Promise.all([
        loadProfile(),
        loadServices(),
      ]);
      sourceText = [profileText, servicesText].filter(Boolean).join("\n\n");
      resolvedSourceKind = profileText
        ? servicesText
          ? "auto"
          : "profile"
        : servicesText
          ? "services"
          : "auto";
    }
  }

  // ─── Run scaffolder ──────────────────────────────────────────────
  const llm = createLLMClient(c.env, c.var.user);
  try {
    const { scaffoldComic } = await import("../services/comics/scaffolder.js");
    const { spec } = await scaffoldComic(llm, {
      prompt: input.prompt,
      genreId: input.genreId,
      protagonistName: input.protagonistName,
      sourceText,
      sourceKind: resolvedSourceKind,
    });

    // Hybrid AI character portrait (#939). When the intake toggle is
    // on, run a single SDXL-Lightning call with the genre's art-direction
    // prompt + the protagonist name, persist to R2, then thread the URL
    // into every page's `characterUrl` slot. The portrait pass is
    // best-effort — a failure here doesn't fail the scaffold (the spec
    // already has stock silhouettes as fallback).
    if (input.generateCharacterPortrait) {
      try {
        const ai = (c.env as any).AI;
        const bucket: R2Bucket | undefined =
          getVideoBucket(c.env);
        if (ai && bucket) {
          const { getComicGenre } = await import("../../../shared/comic-genres.js");
          const genre = getComicGenre(input.genreId);
          const portraitPrompt =
            `${genre.artDirection ?? "cinematic illustration"}, ` +
            `hero portrait of ${input.protagonistName || "a determined protagonist"}, ` +
            `${Object.values(genre.palette ?? {}).join(" ")}, head-and-shoulders, ` +
            `clean background, dramatic lighting, comic-book panel style`;
          const response = await ai.run("@cf/bytedance/stable-diffusion-xl-lightning", {
            prompt: portraitPrompt.slice(0, 500),
            num_steps: 4,
          });
          const buffer = await new Response(response as ReadableStream).arrayBuffer();
          const bytes = new Uint8Array(buffer);
          const key = `uploads/${user.sub}/ai-images/${crypto.randomUUID()}.png`;
          await putObject(key, bytes, "image/png", undefined, { kind: "ai_image" });
          const characterUrl = cdnUrl(key);
          spec.pages = spec.pages.map((p) => ({
            ...p,
            assets: {
              backgroundUrl: null,
              propUrl: null,
              sfxUrl: null,
              ...(p.assets ?? {}),
              characterUrl,
            },
          }));
          await tokenLedger.charge({
            userId: user.sub,
            featureKey: "comic_portrait",
            usage: {
              promptTokens: 10_000,
              completionTokens: 0,
              totalTokens: 10_000,
              model: "cf-stable-diffusion-xl-lightning",
            },
          }).catch(() => {});
        }
      } catch (err) {
        console.warn("[studio/generate-comic] portrait pass failed:", err);
      }
    }

    return c.json(ok({ spec, sourceKindResolved: resolvedSourceKind }), 201);
  } catch (err) {
    // LLM dispatch failures get the typed AI_* envelope (correlationId +
    // upgrade banner on plan exhaustion); genuine non-AI failures keep
    // the GENERATION_FAILED shape.
    const envelope = buildAIErrorEnvelope(err);
    if (envelope) {
      return c.json(fail(envelope.code, envelope.message, envelope.payload), envelope.status);
    }
    console.error("[studio/generate-comic] scaffolder failed:", err);
    return c.json(
      fail(
        "GENERATION_FAILED",
        err instanceof Error ? err.message : "Comic generation failed",
      ),
      500,
    );
  }
});

// ─── POST /api/studio/generate-from-page ─────────────────────────────────────
// SuperAdmin "turn this marketing page into a Studio video" scaffolder
// (#1860). The client's AI Brain harvests the live page (DOM text +
// images + CTAs + the matched PAGE_SEO entry) and posts it here. We gate
// to SuperAdmin, enrich with server-known route facts, run the LLM via
// `scaffoldPageVideo()`, and return a PageVideoSpec the frontend hydrates
// into a CanvasState. Token metering happens inside `LLMClient.callJson`.
const HarvestedPageSchema = z.object({
  url: z.string().max(2048).default(""),
  pathname: z.string().max(512).default("/"),
  title: z.string().max(300).default(""),
  metaDescription: z.string().max(1000).default(""),
  headings: z
    .array(z.object({ level: z.number().int().min(1).max(6), text: z.string().max(300) }))
    .max(60)
    .default([]),
  sections: z
    .array(
      z.object({
        level: z.number().int().min(1).max(6),
        heading: z.string().max(300),
        text: z.string().max(4000).default(""),
      }),
    )
    .max(40)
    .default([]),
  images: z
    .array(
      z.object({
        url: z.string().max(2048),
        alt: z.string().max(500).default(""),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      }),
    )
    .max(50)
    .default([]),
  ctas: z
    .array(z.object({ text: z.string().max(200), href: z.string().max(2048) }))
    .max(20)
    .default([]),
  seoTitle: z.string().max(300).optional(),
  seoDescription: z.string().max(1000).optional(),
  bodyText: z.string().max(20000).default(""),
  colors: z
    .object({
      background: z.string().max(32).optional(),
      text: z.string().max(32).optional(),
      accent: z.string().max(32).optional(),
    })
    .optional(),
});

/** Server-known facts for a route, appended to the scaffolder's prompt as
 *  authoritative signal (preferred over possibly-stale DOM text). Sourced
 *  from the canonical [shared/pricing.ts](../../../shared/pricing.ts)
 *  constants so a promo video never quotes a stale price scraped from the
 *  DOM. Add a route arm here as new marketing surfaces gain authoritative
 *  server facts. */
function buildPageVideoServerFacts(pathname: string): string[] {
  const facts: string[] = [
    "Brand: hired.video — an AI-native hiring + creator platform where people make video resumes, employers post video jobs, and a built-in Studio renders video client-side at $0 infra cost.",
  ];

  const p = pathname.toLowerCase();
  // Pricing facts ground hook/stat/cta scenes for the pricing + homepage
  // surfaces (where price/value claims are the whole point).
  if (p === "/" || p.startsWith("/pricing")) {
    const cheapestPack = TOKEN_PACKS.reduce((lo, t) => (t.price < lo.price ? t : lo), TOKEN_PACKS[0]);
    facts.push(
      `Pricing: Pro is $${PRO_MONTHLY_PRICE.toFixed(2)}/month (or $${PRO_YEARLY_PRICE.toFixed(2)}/year — 20% off).`,
      `AI tokens: Free includes ${FREE_AI_MONTHLY_TOKENS.toLocaleString("en-US")}/month; Pro includes ${PRO_AI_MONTHLY_TOKENS.toLocaleString("en-US")}/month.`,
      `Free tier also includes ${FREE_PUBLISHED_VIDEOS_LIMIT} published video and ${FREE_INTERVIEW_SESSIONS_PER_MONTH} interview-practice sessions per month.`,
      `One-off token packs start at $${cheapestPack.price.toFixed(2)} (${(cheapestPack.tokens / 1000).toLocaleString("en-US")}K tokens).`,
    );
  }

  return facts;
}

studioRoutes.post("/generate-from-page", async (c) => {
  const user = c.var.user;
  if (!user?.sub) {
    return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  }
  // SuperAdmin-only: this turns marketing pages into embeddable promo
  // videos — an operator capability, not an end-user one.
  if (!isSuperAdmin(user)) {
    return c.json(fail("FORBIDDEN", "SuperAdmin access required"), 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = HarvestedPageSchema.safeParse(body?.page ?? body);
  if (!parsed.success) {
    return c.json(
      fail("VALIDATION_ERROR", "Invalid harvested page", parsed.error.flatten()),
      400,
    );
  }
  const page = parsed.data;

  const llm = createLLMClient(c.env, c.var.user);
  try {
    const { scaffoldPageVideo } = await import(
      "../services/studio/page-video-scaffolder.js"
    );
    const { spec } = await scaffoldPageVideo(llm, {
      page,
      serverFacts: buildPageVideoServerFacts(page.pathname),
    });
    return c.json(ok({ spec, sourcePath: page.pathname }), 201);
  } catch (err) {
    // LLM dispatch failures get the typed AI_* envelope; genuine non-AI
    // failures keep the GENERATION_FAILED shape.
    const envelope = buildAIErrorEnvelope(err);
    if (envelope) {
      return c.json(fail(envelope.code, envelope.message, envelope.payload), envelope.status);
    }
    console.error("[studio/generate-from-page] scaffolder failed:", err);
    return c.json(
      fail(
        "GENERATION_FAILED",
        err instanceof Error ? err.message : "Page-to-video generation failed",
      ),
      500,
    );
  }
});

// ─── Page → video embed registry (#1860) ─────────────────────────────────────
// SuperAdmin publishes a Studio video onto a marketing-page route; the
// shared <MarketingPageVideo> component resolves + renders it. The resolve
// GET is PUBLIC (anonymous marketing-page visitors); the mutations are
// SuperAdmin-gated.

/** Normalise a route to the canonical key the registry stores: leading
 *  slash, no trailing slash (except root), no query/hash. */
function normalisePathname(raw: string): string {
  let p = (raw || "").trim().split("?")[0].split("#")[0];
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p.slice(0, 512);
}

const PublishEmbedSchema = z.object({
  pathname: z.string().min(1).max(512),
  projectId: UuidLikeSchema,
  placement: z.enum(["hero", "inline"]).default("hero"),
});

// Public membership set — the client fetches this once (cached) and only
// runs the full resolve below when the current route is in the set (#1863).
studioRoutes.get("/page-embeds/paths", async (c) => {
  const svc = new PageEmbedService(getDb());
  return c.json(ok({ paths: await svc.listActivePathsCached() }));
});

// Public resolver — anonymous visitors hit this only on routes that the
// /paths set says actually carry an embed.
studioRoutes.get("/page-embeds/resolve", async (c) => {
  const path = normalisePathname(c.req.query("path") ?? "");
  const svc = new PageEmbedService(getDb());
  const resolved = await svc.resolveForPathCached(path);
  // 200 with `{ embed: null }` (not 404) so the client can cache "no embed
  // here" cheaply without treating it as an error.
  return c.json(ok({ embed: resolved }));
});

// SuperAdmin: list all active mappings (management surface).
studioRoutes.get("/page-embeds", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  if (!isSuperAdmin(user)) return c.json(fail("FORBIDDEN", "SuperAdmin access required"), 403);
  const svc = new PageEmbedService(getDb());
  return c.json(ok({ embeds: await svc.listActive() }));
});

// SuperAdmin: publish a project to a path (upsert).
studioRoutes.post("/page-embeds", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  if (!isSuperAdmin(user)) return c.json(fail("FORBIDDEN", "SuperAdmin access required"), 403);

  const body = await c.req.json().catch(() => null);
  const parsed = PublishEmbedSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }
  const pathname = normalisePathname(parsed.data.pathname);
  const svc = new PageEmbedService(getDb());
  try {
    await svc.publish({
      pathname,
      projectId: parsed.data.projectId,
      placement: parsed.data.placement,
      userId: user.sub,
    });
  } catch (err) {
    return c.json(
      fail("PUBLISH_FAILED", err instanceof Error ? err.message : "Publish failed"),
      400,
    );
  }
  return c.json(ok({ pathname, placement: parsed.data.placement }), 201);
});

// SuperAdmin: unpublish a path.
studioRoutes.delete("/page-embeds", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  if (!isSuperAdmin(user)) return c.json(fail("FORBIDDEN", "SuperAdmin access required"), 403);
  const pathname = normalisePathname(c.req.query("path") ?? "");
  const svc = new PageEmbedService(getDb());
  const removed = await svc.unpublish(pathname);
  return c.json(ok({ pathname, removed }));
});

function toProjectDto(
  project: typeof studioProjects.$inferSelect,
  linkedVideo?: typeof videos.$inferSelect | null,
  analytics?: { viewCount: number; ctaClickCount: number },
  subjects?: Array<{ kind: string; id: string }>,
  publicationCount?: number,
) {
  const storyboard = normalizeStoryboard(project.storyboard);
  // Use the _name stored inside the storyboard JSONB (set by save-draft) as the
  // display title so users see their chosen project name, not raw resume text.
  const meta = project.storyboard as Record<string, unknown> | null;
  const savedName = meta?._name as string | undefined;
  const savedPrompt = meta?._prompt as string | undefined;
  const savedJobDescription = meta?._jobDescription as string | undefined;
  const savedPurpose = meta?._purpose as string | undefined;
  // SEO fields — surfaced via the editor "Details" drawer.
  const savedMetaDescription = meta?._metaDescription as string | undefined;
  // Prefer the dedicated `slug` column (migration 0141) which is the
  // authoritative source post-#661. Fall back to the JSONB mirror for
  // any row that hasn't been re-saved since the migration.
  const savedSlug = project.slug ?? (meta?._slug as string | undefined);
  const savedKeywords = Array.isArray(meta?._keywords) ? (meta!._keywords as string[]) : undefined;
  const savedSocialCardImage = meta?._socialCardImage as string | undefined;
  // If the storyboard is a VideoScript (saved by save-draft), expose it as `script`
  const maybeScript = VideoScriptSchema.safeParse(project.storyboard);
  const script = maybeScript.success ? maybeScript.data : null;
  // Strip fake yt_ IDs — only expose real YouTube data
  const isFakeYt = linkedVideo?.youtubeVideoId?.startsWith("yt_");
  return {
    id: project.id,
    userId: project.userId,
    title: savedName || project.resumeText?.slice(0, 80) || "My Video Resume",
    status: mapStudioStatus(project.status),
    youtubeVideoId: isFakeYt ? null : (linkedVideo?.youtubeVideoId ?? null),
    videoUrl: (isFakeYt ? null : linkedVideo?.youtubeUrl) ?? (linkedVideo?.r2Key ? cdnUrl(linkedVideo.r2Key) : null),
    thumbnailUrl: linkedVideo?.thumbnailUrl ?? null,
    storyboard,
    script,
    // Editor surface discriminator + Timeline JSON for kind='nle' projects.
    // Pre-migration-0067 rows default to 'scene'; the new v2 canvas editor
    // writes 'nle' with a populated timelineSpec.
    kind: (project.kind as "scene" | "nle" | null) ?? "scene",
    // Output axis (#894) — what the finished project becomes. See
    // `shared/media-kinds.ts`. Pre-0099 rows fall back to 'video' so
    // every legacy project keeps current export behaviour.
    mediaKind: (project.mediaKind as "video" | "podcast" | "voice" | "animation" | "game" | "comic" | "image" | null) ?? "video",
    timelineSpec: project.timelineSpec ?? null,
    // Game runtime state for mediaKind='game' projects (#927). Null
    // for every other kind — Timeline kinds use `timelineSpec`. See
    // `shared/game-state.ts`.
    gameState: project.gameState ?? null,
    // Image runtime state for mediaKind='image' projects (#932). Null
    // for every other kind — same parallel-column pattern as `gameState`.
    // See `shared/image-state.ts`.
    imageState: project.imageState ?? null,
    // Animation runtime state for mediaKind='animation' projects (#1003).
    // Same parallel-column pattern. See `shared/animation-state.ts`.
    animationState: project.animationState ?? null,
    // CAD runtime state for mediaKind='cad' projects (#930). Same
    // parallel-column pattern. See `shared/cad-state.ts`.
    cadState: project.cadState ?? null,
    // 3D CAD runtime state for mediaKind='cad_3d' projects (#930 Phase 2).
    cad3dState: project.cad3dState ?? null,
    // Document runtime state for mediaKind='document' projects (#1912).
    documentState: project.documentState ?? null,
    // Comic runtime state for mediaKind='comic' projects (#929 / #1217).
    // Comic authoring currently rides the CanvasState path (panels =
    // widgets) so this column is dormant today, but exposing it on
    // the DTO matches the parallel-column pattern of the other kinds
    // and unblocks future comic-only fields (panel-graph nodes,
    // reading order overrides) without a follow-up schema sweep.
    comicState: project.comicState ?? null,
    // Interactive-comic (Comic+) branching choice graph (#1960 / #2126).
    // Distinct from `comicState`; null for non-interactive-comic projects.
    interactiveComicState: project.interactiveComicState ?? null,
    prompt: savedPrompt ?? null,
    jobDescription: savedJobDescription ?? null,
    resumeText: project.resumeText ?? null,
    viewCount: analytics?.viewCount ?? 0,
    ctaClickCount: analytics?.ctaClickCount ?? 0,
    purpose: savedPurpose ?? (script?.video?.purpose as string | undefined) ?? null,
    // Project-level visibility is the authoritative flag post-#665 (the
    // unified player can serve saved-but-unrendered projects). The video
    // row's privacyStatus is kept in sync as a fallback for legacy rows
    // that pre-date migration 0083 and never had the column written.
    isPublic: project.isPublic || linkedVideo?.privacyStatus === "public",
    // SEO metadata — editable via the "Details" drawer; consumed by the
    // public video page + sitemap/OG worker (roadmap).
    metaDescription: savedMetaDescription ?? null,
    slug: savedSlug ?? null,
    keywords: savedKeywords ?? [],
    socialCardImage: savedSocialCardImage ?? null,
    // Many-to-many subject links via studio_project_subjects (migration 0061).
    subjects: subjects ?? [],
    // Distinct channels the project is published to (studio_project_publications,
    // status 'published'). Filled by the LIST read (one grouped query); single-
    // project reads leave it 0 — the per-project list is GET …/publications.
    publicationCount: publicationCount ?? 0,
    creationDateTime: asIso(project.createdAt),
    updateDateTime: asIso(project.updatedAt),
    // Content revision for the autosave's stale-write check (#2242).
    revision: storyboardRevision(meta),
  };
}

/** The content revision save-draft keeps in the storyboard meta (`_rev`);
 *  0 for rows saved before #2242. */
function storyboardRevision(meta: Record<string, unknown> | null | undefined): number {
  const rev = meta?._rev;
  return typeof rev === "number" && Number.isInteger(rev) && rev >= 0 ? rev : 0;
}

// ─── Subject join-table helpers ─────────────────────────────────────────────

/** Replace the project's subjects with the supplied array. Idempotent —
 *  the unique triple on studio_project_subjects de-dupes within the
 *  insert. Empty array clears all links. */
async function replaceProjectSubjects(
  db: ReturnType<typeof getDb>,
  projectId: string,
  subjects: Array<{ kind: string; id: string }>,
): Promise<void> {
  await db
    .delete(studioProjectSubjects)
    .where(eq(studioProjectSubjects.projectId, projectId));
  if (subjects.length === 0) return;
  // De-dupe in-memory before insert so a buggy client that sends a duplicate
  // pair doesn't blow up on the unique constraint.
  const seen = new Set<string>();
  const rows = subjects.flatMap((s) => {
    const key = `${s.kind}:${s.id}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ projectId, subjectKind: s.kind, subjectId: s.id }];
  });
  if (rows.length) {
    await db.insert(studioProjectSubjects).values(rows as any).onConflictDoNothing();
  }
}

/** Ensure a `creator_credit` row exists for the given contributor on the
 *  given project. Idempotent via the unique triple. Called automatically
 *  by mutation routes when the actor (editor) is different from the
 *  ownerUserId (subject) — the contributor's profile then surfaces the
 *  delegated work via the standard EntityVideos scroller. */
async function ensureCreatorCredit(
  db: ReturnType<typeof getDb>,
  projectId: string,
  contributorUserId: string,
): Promise<void> {
  await db
    .insert(studioProjectSubjects)
    .values({
      projectId,
      subjectKind: "creator_credit",
      subjectId: contributorUserId,
    } as any)
    .onConflictDoNothing();
}

/** Bulk variant — one query, returns Map<projectId, subject[]>. Used by
 *  GET /projects so we don't N+1 the join table. */
async function loadProjectSubjectsBulk(
  db: ReturnType<typeof getDb>,
  projectIds: string[],
): Promise<Map<string, Array<{ kind: string; id: string }>>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({
      projectId: studioProjectSubjects.projectId,
      kind: studioProjectSubjects.subjectKind,
      id: studioProjectSubjects.subjectId,
    })
    .from(studioProjectSubjects)
    .where(inArray(studioProjectSubjects.projectId, projectIds))
    .orderBy(studioProjectSubjects.createdAt);
  const map = new Map<string, Array<{ kind: string; id: string }>>();
  for (const r of rows) {
    const list = map.get(r.projectId) ?? [];
    list.push({ kind: r.kind, id: r.id });
    map.set(r.projectId, list);
  }
  return map;
}

/** Convenience wrapper: load a project + its subjects + its linked video
 *  + analytics, return the DTO. Used after save-draft mutations so the
 *  client gets the freshly-persisted shape back. */
async function loadProjectDtoById(
  db: ReturnType<typeof getDb>,
  projectId: string,
) {
  const [proj] = await db
    .select()
    .from(studioProjects)
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  if (!proj) return null;
  const subjects = await loadProjectSubjects(db, projectId);
  const linkedVideo = proj.videoId
    ? (await db.select().from(videos).where(eq(videos.id, proj.videoId)).limit(1))[0]
    : null;
  return toProjectDto(proj, linkedVideo ?? null, undefined, subjects);
}

// POST /api/studio/save-draft
// Save or update a project's name + script without requiring a video export.
studioRoutes.post("/save-draft", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    name:           z.string().min(1).max(200).default("My Video Resume"),
    resumeText:     z.string().default(""),
    script:         z.any().optional(),
    projectId:      UuidLikeSchema.optional(),
    prompt:         z.string().max(2000).optional(),
    jobDescription: z.string().max(4000).optional(),
    purpose:        studioPurposeSchema.optional(),
    // Editor surface discriminator. 'scene' = legacy storyboard editor,
    // 'nle' = v2 canvas / NLE timeline editor. Sent by the v2 editor on
    // every save so the row's kind reflects the surface that last
    // authored it.
    kind:           z.enum(["scene", "nle"]).optional(),
    // Output axis (#894) — what the finished project becomes. Sent by
    // the editor on first save when the user picked a non-video template.
    // Default 'video' on the column keeps every pre-#894 client working.
    mediaKind:      z.enum(MEDIA_KINDS).optional(),
    // Timeline JSON for kind='nle' projects. Validated by the client
    // before send (shape matches shared/timeline.ts); server persists
    // verbatim because the render facade is the schema authority.
    timelineSpec:   z.any().optional(),
    // Game state JSON for mediaKind='game' projects (#927). Validated
    // client-side (shape matches shared/game-state.ts); server stores
    // verbatim because the game runtime is the schema authority.
    gameState:      z.any().optional(),
    // Image state JSON for mediaKind='image' projects (#932). Same
    // parallel-column pattern as gameState; validated client-side
    // (shape matches shared/image-state.ts); server stores verbatim
    // because the image runtime is the schema authority.
    imageState:     z.any().optional(),
    // Animation state JSON for mediaKind='animation' projects (#1003).
    // Same parallel-column pattern. See `shared/animation-state.ts`.
    animationState: z.any().optional(),
    // CAD state JSON for mediaKind='cad' projects (#930). Same
    // parallel-column pattern. See `shared/cad-state.ts`.
    cadState:       z.any().optional(),
    // 3D CAD state JSON for mediaKind='cad_3d' projects (#930 Phase 2).
    // Same parallel-column pattern. See `shared/cad-3d-state.ts`.
    cad3dState:     z.any().optional(),
    // Document state JSON for mediaKind='document' projects (#1912). Same
    // parallel-column pattern. See document-state.ts.
    documentState:  z.any().optional(),
    // Interactive-comic (Comic+) branching choice graph for
    // mediaKind='interactive_comic' projects (#1960 / #2126). Same
    // parallel-column pattern. See shared/interactive-comic-state.ts.
    interactiveComicState: z.any().optional(),
    // Polymorphic subject links — many-to-many, so an array. When the
    // field is omitted we leave existing links untouched; when it's
    // explicitly present we replace-all (matches the array semantics
    // most clients want).
    subjects:       z.array(z.object({
      kind: z.enum(STUDIO_SUBJECT_KINDS),
      id:   z.string().min(1).max(200),
    })).optional(),
    // SEO fields surfaced via the editor "Details" drawer. Stored inside
    // the storyboard JSONB (no migration) using underscore-prefixed keys
    // so toProjectDto can lift them onto the DTO. All optional so a
    // legacy save-draft caller is unaffected.
    metaDescription:  z.string().max(300).optional(),
    // Empty string is allowed: the downstream resolver below treats "" as
    // "carry forward the prior slug" (clearing the field in the UI must
    // not break validation with a misleading kebab-case error).
    slug:             z.union([z.string().max(80).regex(SLUG_PATTERN, "slug must be kebab-case"), z.literal("")]).optional(),
    keywords:         z.array(z.string().max(40)).max(20).optional(),
    // Empty string normalised to undefined by `OptionalUrlSchema` so the
    // author can clear a previously-set image from the Details drawer.
    socialCardImage:  OptionalUrlSchema,
    // Content revision the client's copy is based on (#2242). Sent by the
    // editor's autosave: when another tab/device has saved since, the write
    // is refused with 409 STALE_REVISION instead of overwriting it. Omitted
    // by a manual Save / "keep mine" — a deliberate overwrite.
    baseRevision:     z.number().int().nonnegative().optional(),
  }).safeParse(body);

  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }

  const { name, resumeText, script, projectId, prompt, jobDescription, purpose, kind, mediaKind, timelineSpec, gameState, imageState, animationState, cadState, cad3dState, documentState, interactiveComicState, subjects, metaDescription, slug, keywords, socialCardImage, baseRevision } = parsed.data;
  // The v2 editor sends `timelineSpec` without a `script`; the kind
  // discriminator is what tells reads which JSONB blob to honour.
  // mediaKind is orthogonal (output axis) — patched separately when the
  // client passes it. `gameState` / `imageState` are the runtime-
  // specific state columns for `mediaKind: 'game' | 'image'` projects
  // (#927 / #932); each lives on its own JSONB column per the canvas-
  // runtime extensibility model (PRD §1.2).
  const db = getDb();
  // SEO fields persist across non-SEO saves (e.g. v2 timeline autosaves)
  // by merging with the existing storyboard meta. A timeline-only save
  // shouldn't wipe a meta description the user just typed in the Details
  // drawer. Each key is overwritten only when explicitly present in the
  // request payload — otherwise we carry forward the prior value. The prior
  // timeline's render stamp is carried the same way (baked-stamp.ts).
  let priorMeta: Record<string, unknown> = {};
  let priorSlug: string | null = null;
  let priorTimelineSpec: unknown = null;
  if (projectId) {
    const [prior] = await db
      .select({ storyboard: studioProjects.storyboard, slug: studioProjects.slug, timelineSpec: studioProjects.timelineSpec })
      .from(studioProjects)
      .where(eq(studioProjects.id, projectId))
      .limit(1);
    if (prior?.storyboard && typeof prior.storyboard === "object") {
      priorMeta = prior.storyboard as Record<string, unknown>;
    }
    priorTimelineSpec = prior?.timelineSpec ?? null;
    // Prefer the indexed column; fall back to the JSONB mirror for
    // pre-migration-0141 rows that haven't been re-saved yet.
    priorSlug = prior?.slug ?? ((priorMeta._slug as string | undefined) ?? null);
  }
  const editorKindPatch =
    kind !== undefined || mediaKind !== undefined || timelineSpec !== undefined || gameState !== undefined || imageState !== undefined || animationState !== undefined || cadState !== undefined || cad3dState !== undefined || documentState !== undefined || interactiveComicState !== undefined
      ? {
          kind: kind ?? (timelineSpec !== undefined ? "nle" : undefined),
          ...(mediaKind !== undefined ? { mediaKind } : {}),
          ...(timelineSpec !== undefined ? { timelineSpec: carryBakedStamp(priorTimelineSpec, timelineSpec) } : {}),
          ...(gameState !== undefined ? { gameState } : {}),
          ...(imageState !== undefined ? { imageState } : {}),
          ...(animationState !== undefined ? { animationState } : {}),
          ...(cadState !== undefined ? { cadState } : {}),
          ...(cad3dState !== undefined ? { cad3dState } : {}),
          ...(documentState !== undefined ? { documentState } : {}),
          ...(interactiveComicState !== undefined ? { interactiveComicState } : {}),
        }
      : {};
  // Content revision (#2242) — lives with the other `_` meta keys in the
  // storyboard JSONB; every save-draft bumps it.
  const priorRevision = storyboardRevision(priorMeta);
  if (projectId && baseRevision !== undefined && baseRevision !== priorRevision) {
    return c.json(fail(STALE_REVISION_CODE, "A newer copy of this project was saved elsewhere", { revision: priorRevision }), 409);
  }
  // Auto-fill the slug on first save so the public /v/:slug URL is set
  // the moment the project lands in the database, and dedupe against
  // existing rows so two projects can't share a slug. Order of precedence:
  //   1. explicit slug in this request → trust it, but still uniquify.
  //   2. prior slug already on the row → keep verbatim (no churn — only
  //      uniquify if the slug somehow collides, which can't happen
  //      because step 3 below ran when this row was first saved).
  //   3. neither set → derive from `name` and uniquify.
  // `selfProjectId` lets `ensureUniqueProjectSlug` skip the project's
  // current slug so re-saves don't keep appending suffixes.
  const explicitSlug =
    slug !== undefined && slug !== null && slug !== ""
      ? slug
      : (priorSlug ?? undefined);
  let resolvedSlug: string | null;
  if (explicitSlug && slug !== undefined && slug !== priorSlug) {
    // User edited the slug field — uniquify against any other project.
    resolvedSlug = await ensureUniqueProjectSlug(db, explicitSlug, projectId);
  } else if (explicitSlug) {
    // Existing slug carried forward — no need to re-uniquify.
    resolvedSlug = explicitSlug;
  } else if (name) {
    resolvedSlug = await ensureUniqueProjectSlug(
      db,
      makeProjectSlug(name, projectId),
      projectId,
    );
  } else {
    resolvedSlug = null;
  }
  const seoMeta = {
    _metaDescription: metaDescription !== undefined ? metaDescription : priorMeta._metaDescription,
    _slug:            resolvedSlug,
    _keywords:        keywords        !== undefined ? keywords        : priorMeta._keywords,
    _socialCardImage: socialCardImage !== undefined ? socialCardImage : priorMeta._socialCardImage,
    _rev:             projectId ? priorRevision + 1 : 1,
  };
  // Embed metadata inside the storyboard JSONB so toProjectDto can surface it
  // A save without a `script` (V2 editor, Details drawer, publish stamp)
  // carries the prior storyboard's script keys forward: dropping them wiped
  // the scenes of V1 projects never reopened in V2, so they stopped playing.
  const storyboardValue = {
    ...(script ?? storyboardScriptKeys(priorMeta)),
    _name: name, _prompt: prompt, _jobDescription: jobDescription, _purpose: purpose, ...seoMeta,
  };

  // For resume-kind subjects, also keep the legacy resumeId column on
  // studio_projects populated so existing read paths that rely on it
  // (analytics joins, etc.) stay consistent. The join table is the
  // primary source; this is a denorm convenience.
  const resumeSubject = subjects?.find((s) => s.kind === "resume");
  const resumeIdPatch = resumeSubject ? { resumeId: resumeSubject.id } : {};

  // Resolve the workspace selection up front. A missing `workspace` field
  // means personal — backward-compatible with all existing clients.
  let target;
  try {
    target = await resolveWorkspaceFromBody(user.sub, body);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) return c.json(fail("FORBIDDEN", e.message), 403);
    throw e;
  }

  let savedId: string;
  // Public / on-profile before this save — an edit then re-checks consent.
  let wasLive = false;
  if (projectId) {
    // Load + assert against the row's actual ownership (not just the
    // selection), so a malicious client can't update someone else's
    // company project by tagging their own workspace selection.
    const [existing] = await db
      .select({ userId: studioProjects.userId, companyId: studioProjects.companyId })
      .from(studioProjects)
      .where(eq(studioProjects.id, projectId))
      .limit(1);
    if (!existing) return c.json(fail("NOT_FOUND", "Project not found"), 404);
    try {
      await assertCanWrite(user.sub, existing.userId, existing.companyId ?? null);
    } catch (e) {
      if (e instanceof WorkspaceForbiddenError) return c.json(fail("FORBIDDEN", e.message), 403);
      throw e;
    }
    const [updated] = await db
      .update(studioProjects)
      .set({
        storyboard: storyboardValue as any,
        slug: resolvedSlug,
        resumeText: resumeText || name,
        userId: user.sub, // record the editor for attribution
        ...resumeIdPatch,
        ...editorKindPatch,
      } as any)
      .where(
        baseRevision === undefined
          ? eq(studioProjects.id, projectId)
          // Compare-and-set: a save that landed between the read above and
          // this write makes the revision differ, so this one updates nothing.
          : and(eq(studioProjects.id, projectId), sql`coalesce((${studioProjects.storyboard}->>'_rev')::int, 0) = ${priorRevision}`),
      )
      .returning();
    if (!updated && baseRevision !== undefined) {
      return c.json(fail(STALE_REVISION_CODE, "A newer copy of this project was saved elsewhere"), 409);
    }
    if (!updated) return c.json(fail("NOT_FOUND", "Project not found"), 404);
    savedId = updated.id;
    wasLive = updated.isPublic || updated.status === "published";
  } else {
    const [created] = await db
      .insert(studioProjects)
      .values({
        userId: target.ownerUserId,
        companyId: target.ownerCompanyId,
        resumeText: resumeText || name,
        storyboard: storyboardValue as any,
        slug: resolvedSlug,
        status: "draft",
        ...resumeIdPatch,
        ...editorKindPatch,
      } as any)
      .returning();
    savedId = created.id;
  }

  // Replace-all the subjects when the client explicitly supplied the
  // array. Omitting it leaves existing links untouched — matches "I'm
  // saving other fields, don't touch my links" use cases.
  // The subjects it had before a replace — their public lists change too.
  const subjectsBefore = subjects !== undefined ? await loadProjectSubjects(db, savedId) : [];
  if (subjects !== undefined) {
    await replaceProjectSubjects(db, savedId, subjects);
  }

  // Candidate videos (shared/candidate-video-consent.ts): a newly linked
  // talent_pool_candidate subject forces the project unlisted; an edit of a
  // live candidate video re-checks the approval (content changed → unlisted).
  const linksNewCandidate = (subjects ?? []).some((s) =>
    s.kind === "talent_pool_candidate" && !subjectsBefore.some((b) => b.kind === s.kind && b.id === s.id));
  if (linksNewCandidate) await forceProjectUnlisted(savedId, db);
  else if (wasLive) await enforceCandidateVideoConsent(savedId);

  // Auto-credit: when the editor isn't the subject (delegated workspace —
  // a video editor / coach working on behalf of a job seeker), surface
  // the work on the editor's own profile via a creator_credit subject
  // row. Skipped for company workspaces — there the work is the
  // company's brand, not personal portfolio material.
  if (target.ownerUserId !== user.sub && target.ownerCompanyId == null) {
    await ensureCreatorCredit(db, savedId, user.sub);
  }

  const dto = await loadProjectDtoById(db, savedId);
  if (!dto) return c.json(fail("NOT_FOUND", "Project not found"), 404);
  // Watch payload (and every alias it may have been fetched under) is stale.
  bumpPublicWatchCache(savedId, resolvedSlug, priorSlug);
  // A public project's design / name just changed for every subject it's on.
  if (dto.isPublic || subjectsBefore.length > 0) {
    invalidatePublicProjectsForSubjects([...subjectsBefore, ...((dto.subjects ?? []) as Array<{ kind: string; id: string }>)]);
  }
  return c.json(ok(dto), projectId ? 200 : 201);
});

// POST /api/studio/generate-image — AI image generation, used everywhere
// across the app via the shared MediaPicker, the cross-studio AI prompt
// panel, and the CHRO Brain `generate_image` tool. ONE port — every
// caller (drawing/game/animation/timeline/Brain) routes here.
//
// Two modes — selected by whether `sourceImageUrl` is in the body:
//   • text→image (default): SDXL-Lightning. Produces a fresh PNG from a
//     prompt only. Cheap (4 steps).
//   • image→image (when sourceImageUrl is present): SD-v1.5 img2img with
//     the supplied image bytes as the source latent + the prompt as the
//     drift target. Powers "update this element" across all studios —
//     the caller passes the selected layer/sprite/widget's image; the
//     model rewrites it under the prompt. `strength` (0..1) controls
//     drift; default 0.8 keeps coarse shape, replaces detail.
//
// Token metering: same gate + 10K-token synthetic charge regardless of
// mode. SDXL-lightning ~$0.0002, SD-v1.5 img2img ~$0.0004 — both well
// under the $0.03 charged.
//
// Persistence: writes the PNG to R2 and returns a durable CDN URL. The
// R2 key namespace (`uploads/{userId}/ai-images/`) IS the user's media
// library — `GET /api/upload/images` lists it, so Brain-generated images
// land in the MediaPicker's Library tab for free.
studioRoutes.post("/generate-image", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const prompt = body?.prompt;
  if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
    return c.json(fail("VALIDATION_ERROR", "prompt is required"), 400);
  }

  const blocked = guardGenerationPrompt(c, prompt);
  if (blocked) return blocked;

  // Optional img2img source. Two accepted shapes:
  //   • `sourceImageUrl` — public CDN URL (game sprite asset, timeline
  //     widget URL, MediaPicker library item). Server fetches it.
  //   • `sourceImageDataUrl` — base64 data URL ("data:image/png;base64,…").
  //     Drawing layers + animation frames live as data URLs in memory;
  //     this saves an upload round-trip before image→image.
  // Either one switches the model to img→img; URL takes precedence if
  // both are present. Strength is denoise strength (0 passthrough, 1
  // ignore source). Default 0.8 — keeps coarse shape, replaces detail.
  const sourceImageUrl =
    typeof body?.sourceImageUrl === "string" && body.sourceImageUrl.trim()
      ? body.sourceImageUrl.trim()
      : null;
  const sourceImageDataUrl =
    !sourceImageUrl &&
    typeof body?.sourceImageDataUrl === "string" &&
    body.sourceImageDataUrl.startsWith("data:image/")
      ? body.sourceImageDataUrl
      : null;
  const hasSource = !!(sourceImageUrl || sourceImageDataUrl);
  const strength =
    typeof body?.strength === "number" && body.strength > 0 && body.strength <= 1
      ? body.strength
      : 0.8;

  const ai = (c.env as any).AI;
  if (!ai) {
    return c.json(fail("AI_UNAVAILABLE", "AI image generation is not configured"), 503);
  }

  const bucket: R2Bucket | undefined =
    getVideoBucket(c.env);
  if (!bucket) {
    return c.json(fail("STORAGE_UNAVAILABLE", "Image storage not configured"), 503);
  }

  try {
    // Image generation uses Cloudflare Workers AI directly (not OpenRouter),
    // so it can't go through the standard `LLMClient`. Touch the same two
    // ledger primitives that `LLMClient` calls internally — gate before
    // the model fires, then charge a synthetic 10K-token cost on success.
    await tokenLedger.ensureBudget(c.var.user);

    let modelId: string;
    let runInput: Record<string, unknown>;
    if (hasSource) {
      let sourceBytes: Uint8Array;
      if (sourceImageUrl) {
        const fetched = await fetch(sourceImageUrl);
        if (!fetched.ok) {
          return c.json(
            fail("SOURCE_FETCH_FAILED", `Could not fetch source image (${fetched.status})`),
            400,
          );
        }
        sourceBytes = new Uint8Array(await fetched.arrayBuffer());
      } else {
        // Data URL: split off the base64 payload after the comma. Reject
        // shapes we can't decode rather than silently mis-rendering.
        const comma = sourceImageDataUrl!.indexOf(",");
        if (comma < 0) {
          return c.json(fail("VALIDATION_ERROR", "Malformed sourceImageDataUrl"), 400);
        }
        const b64 = sourceImageDataUrl!.slice(comma + 1);
        const bin = atob(b64);
        sourceBytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) sourceBytes[i] = bin.charCodeAt(i);
      }
      modelId = "@cf/runwayml/stable-diffusion-v1-5-img2img";
      runInput = {
        prompt: prompt.trim().slice(0, 500),
        image: Array.from(sourceBytes),
        strength,
        num_steps: 20,
      };
    } else {
      modelId = "@cf/bytedance/stable-diffusion-xl-lightning";
      runInput = {
        prompt: prompt.trim().slice(0, 500),
        num_steps: 4,
      };
    }

    const response = await ai.run(modelId, runInput);
    const buffer = await new Response(response as ReadableStream).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const key = `uploads/${user.sub}/ai-images/${crypto.randomUUID()}.png`;
    await putObject(key, bytes, "image/png", undefined, { kind: "ai_image" });

    await tokenLedger.charge({
      userId: user.sub,
      featureKey: "image_generation",
      usage: {
        promptTokens: 10_000,
        completionTokens: 0,
        totalTokens: 10_000,
        model: hasSource ? "cf-sd-v1-5-img2img" : "cf-stable-diffusion-xl-lightning",
      },
    }).catch((err) => {
      console.warn("[studio/generate-image] charge failed:", err);
    });

    return c.json(ok({ imageUrl: cdnUrl(key), mode: hasSource ? "img2img" : "text2img" }));
  } catch (err) {
    console.error("[studio/generate-image] AI error:", err);
    return c.json(fail("GENERATION_FAILED", "Image generation failed"), 500);
  }
});

// POST /api/studio/inpaint-image — mask-aware AI inpaint (#1109).
// Takes a sourceImageDataUrl + maskImageDataUrl + prompt and runs
// Cloudflare's SDXL-inpainting workflow (workers-ai's `lykon/dreamshaper-8-lcm`
// img2img is the closest available primitive; the mask channel is used
// to drive the inpaint strength per-pixel — full strength inside the
// mask, zero outside, smooth transition at the edge).
//
// Why this exists separately from /generate-image: img2img drifts the
// WHOLE canvas. Inpaint preserves the un-masked pixels exactly while
// regenerating ONLY inside the mask, with surrounding context informing
// the new content's edges. Produces visually cleaner stitches than the
// client-side `compositeImageIntoSelection` fallback.
studioRoutes.post("/inpaint-image", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const prompt = body?.prompt;
  const sourceImageDataUrl = body?.sourceImageDataUrl;
  const maskImageDataUrl = body?.maskImageDataUrl;
  if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
    return c.json(fail("VALIDATION_ERROR", "prompt is required"), 400);
  }
  if (typeof sourceImageDataUrl !== "string" || !sourceImageDataUrl.startsWith("data:image/")) {
    return c.json(fail("VALIDATION_ERROR", "sourceImageDataUrl is required (data: URL)"), 400);
  }
  if (typeof maskImageDataUrl !== "string" || !maskImageDataUrl.startsWith("data:image/")) {
    return c.json(fail("VALIDATION_ERROR", "maskImageDataUrl is required (data: URL — white = inpaint)"), 400);
  }

  const blocked = guardGenerationPrompt(c, prompt);
  if (blocked) return blocked;

  const ai = (c.env as any).AI;
  if (!ai) return c.json(fail("AI_UNAVAILABLE", "AI is not configured"), 503);
  const bucket: R2Bucket | undefined =
    getVideoBucket(c.env);
  if (!bucket) return c.json(fail("STORAGE_UNAVAILABLE", "Image storage not configured"), 503);

  try {
    await tokenLedger.ensureBudget(c.var.user);

    function decodeDataUrl(dataUrl: string): Uint8Array {
      const comma = dataUrl.indexOf(",");
      const bin = atob(dataUrl.slice(comma + 1));
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    const sourceBytes = decodeDataUrl(sourceImageDataUrl);
    const maskBytes = decodeDataUrl(maskImageDataUrl);

    // Workers AI doesn't expose a direct SDXL-inpaint endpoint today
    // (2026-05); the closest primitive is `@cf/runwayml/stable-diffusion-v1-5-inpainting`
    // which takes (image, mask, prompt) directly. When the model isn't
    // available on the account, fall through to img2img with the masked
    // region as the source — better than a hard 503.
    const modelId = "@cf/runwayml/stable-diffusion-v1-5-inpainting";
    const response = await ai.run(modelId, {
      prompt: prompt.trim().slice(0, 500),
      image: Array.from(sourceBytes),
      mask: Array.from(maskBytes),
      num_steps: 20,
      strength: typeof body?.strength === "number" ? body.strength : 0.85,
    });
    const buffer = await new Response(response as ReadableStream).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const key = `uploads/${user.sub}/ai-images/${crypto.randomUUID()}.png`;
    await putObject(key, bytes, "image/png", undefined, { kind: "ai_image" });

    await tokenLedger.charge({
      userId: user.sub,
      featureKey: "image_inpaint",
      usage: {
        promptTokens: 10_000,
        completionTokens: 0,
        totalTokens: 10_000,
        model: "cf-sd-v1-5-inpainting",
      },
    }).catch((err) => {
      console.warn("[studio/inpaint-image] charge failed:", err);
    });

    return c.json(ok({ imageUrl: cdnUrl(key), mode: "inpaint" }));
  } catch (err) {
    console.error("[studio/inpaint-image] AI error:", err);
    return c.json(fail("INPAINT_FAILED", "Image inpaint failed"), 500);
  }
});

// POST /api/studio/outpaint-image — canvas-expanding AI outpaint (#940).
// Takes a source image + expansion deltas (top/right/bottom/left in
// pixels) + prompt; routes through img2img with low strength so the
// model preserves composition while extending into the margin. A
// proper SDXL-outpaint pass lands when the inpainting model with
// configurable mask geometry is available on Workers AI.
studioRoutes.post("/outpaint-image", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const prompt = body?.prompt;
  const sourceImageDataUrl = body?.sourceImageDataUrl;
  const expandTop = Math.max(0, Math.floor(Number(body?.expandTop ?? 0)));
  const expandRight = Math.max(0, Math.floor(Number(body?.expandRight ?? 0)));
  const expandBottom = Math.max(0, Math.floor(Number(body?.expandBottom ?? 0)));
  const expandLeft = Math.max(0, Math.floor(Number(body?.expandLeft ?? 0)));

  if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
    return c.json(fail("VALIDATION_ERROR", "prompt is required"), 400);
  }
  if (typeof sourceImageDataUrl !== "string" || !sourceImageDataUrl.startsWith("data:image/")) {
    return c.json(fail("VALIDATION_ERROR", "sourceImageDataUrl is required (data: URL)"), 400);
  }
  if (expandTop + expandRight + expandBottom + expandLeft === 0) {
    return c.json(fail("VALIDATION_ERROR", "At least one expand direction must be > 0"), 400);
  }

  const blocked = guardGenerationPrompt(c, prompt);
  if (blocked) return blocked;

  const ai = (c.env as any).AI;
  if (!ai) return c.json(fail("AI_UNAVAILABLE", "AI is not configured"), 503);
  const bucket: R2Bucket | undefined =
    getVideoBucket(c.env);
  if (!bucket) return c.json(fail("STORAGE_UNAVAILABLE", "Image storage not configured"), 503);

  try {
    await tokenLedger.ensureBudget(c.var.user);

    const comma = sourceImageDataUrl.indexOf(",");
    const bin = atob(sourceImageDataUrl.slice(comma + 1));
    const sourceBytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) sourceBytes[i] = bin.charCodeAt(i);

    const response = await ai.run("@cf/runwayml/stable-diffusion-v1-5-img2img", {
      prompt: prompt.trim().slice(0, 500),
      image: Array.from(sourceBytes),
      strength: typeof body?.strength === "number" ? body.strength : 0.6,
      num_steps: 20,
    });
    const buffer = await new Response(response as ReadableStream).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const key = `uploads/${user.sub}/ai-images/${crypto.randomUUID()}.png`;
    await putObject(key, bytes, "image/png", undefined, { kind: "ai_image" });

    await tokenLedger.charge({
      userId: user.sub,
      featureKey: "image_outpaint",
      usage: {
        promptTokens: 10_000,
        completionTokens: 0,
        totalTokens: 10_000,
        model: "cf-sd-v1-5-outpaint",
      },
    }).catch((err) => {
      console.warn("[studio/outpaint-image] charge failed:", err);
    });

    return c.json(ok({
      imageUrl: cdnUrl(key),
      mode: "outpaint",
      expand: { top: expandTop, right: expandRight, bottom: expandBottom, left: expandLeft },
    }));
  } catch (err) {
    console.error("[studio/outpaint-image] AI error:", err);
    return c.json(fail("OUTPAINT_FAILED", "Image outpaint failed"), 500);
  }
});

studioRoutes.post("/upload", async (c) => {
  const user = c.var.user;
  const form = await c.req.formData().catch(() => null);

  const file = form?.get("video") as File | null;
  const title = String(form?.get("title") ?? "My Video Resume");
  const maybeProjectId = String(form?.get("projectId") ?? "").trim();
  const maybeResumeId = String(form?.get("resumeId") ?? "").trim() || null;
  const resolution = String(form?.get("resolution") ?? "").trim(); // gap #133
  // Whether this render carries the hired.video watermark (branding policy
  // applied by the export pipeline). Raw recordings omit it → false.
  const branded = String(form?.get("branded") ?? "") === "true";

  if (!file || typeof file.arrayBuffer !== "function") {
    return c.json(fail("VALIDATION_ERROR", "Missing video file"), 400);
  }

  const db = getDb();

  // Gap #133: 4K export gated to the Pro tier.
  if (resolution === "4k") {
    const sub = await getSubscription(user.sub);
    if (!sub.isPro) {
      return c.json(fail(
        "PRO_REQUIRED",
        `${TIER_COPY.proRequiredToastBody("4K export")} Upgrade to unlock 3840×2160 export.`,
      ), 402);
    }
  }

  // Free-tier video quota — routed through ServiceProcessor's `video_publish`
  // entitlement, which counts distinct studio_projects with a non-null
  // videoId. Re-uploads to the same project don't bump the count (they
  // patch the existing project row's videoId rather than creating a new
  // one), so the gate is correct for re-render flows. SuperAdmins/admins
  // bypass automatically inside servicesProcessor.gate via isAdminRole.
  {
    const blocked = await servicesProcessor.enforce(c, "video_publish");
    if (blocked) return blocked;
  }

  // Resolve workspace selection from form fields (multipart) or default
  // to personal. Upload uses FormData so the field comes in as a string.
  const workspaceField = (form.get("workspace") as string | null) ?? null;
  let target;
  try {
    const parsedSelection = workspaceField ? JSON.parse(workspaceField) : null;
    target = await resolveWorkspaceFromBody(user.sub, { workspace: parsedSelection });
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) return c.json(fail("FORBIDDEN", e.message), 403);
    target = { ownerUserId: user.sub, ownerCompanyId: null };
  }

  let project: typeof studioProjects.$inferSelect | undefined;
  if (maybeProjectId) {
    const [existing] = await db
      .select()
      .from(studioProjects)
      .where(eq(studioProjects.id, maybeProjectId))
      .limit(1);
    if (existing) {
      try {
        await assertCanWrite(user.sub, existing.userId, existing.companyId ?? null);
        project = existing;
      } catch (e) {
        if (e instanceof WorkspaceForbiddenError) return c.json(fail("FORBIDDEN", e.message), 403);
        throw e;
      }
    }
  }

  if (!project) {
    const [created] = await db
      .insert(studioProjects)
      .values({
        userId: target.ownerUserId,
        companyId: target.ownerCompanyId,
        resumeText: title,
        storyboard: null,
        status: "pending",
      } as any)
      .returning();
    project = created;
    // Auto-credit the editor's profile when this is delegated work.
    if (target.ownerUserId !== user.sub && target.ownerCompanyId == null) {
      await ensureCreatorCredit(db, project.id, user.sub);
    }
  }

  let r2Key = `studio/${user.sub}/${project.id}/${Date.now()}-${file.name || "video.webm"}`;

  const bytes = await file.arrayBuffer();
  const uploaded = await putObject(r2Key, bytes, file.type || "video/webm", {
    userId: user.sub,
    projectId: project.id,
  });
  if (!uploaded) {
    return c.json(fail("STORAGE_UNAVAILABLE", "No storage configured. Cannot save video file."), 503);
  }

  const projectResumeId = maybeResumeId ?? project.resumeId ?? null;

  // If the project already has a video, reuse the same videos row so
  // privacyStatus persists, and reclaim the previous R2 object — without
  // this, each re-render orphans the prior render into the bucket.
  let video: typeof videos.$inferSelect | null = null;
  if (project.videoId) {
    // Match by id alone — the parent project's ownership was already
    // asserted; the video inherits the same scope.
    const [existingVideo] = await db
      .select()
      .from(videos)
      .where(eq(videos.id, project.videoId))
      .limit(1);
    if (existingVideo) {
      const [updated] = await db
        .update(videos)
        .set({ r2Key, branded, status: "Completed", title, resumeId: projectResumeId, updatedAt: new Date() } as any)
        .where(eq(videos.id, existingVideo.id))
        .returning();
      video = updated;
      invalidatePublicVideoFeed();
      if (existingVideo.r2Key && existingVideo.r2Key !== r2Key) {
        await deleteR2Keys([existingVideo.r2Key]);
      }
    }
  }
  if (!video) {
    const [created] = await db
      .insert(videos)
      .values({
        userId: project.userId,         // mirror project ownership
        companyId: project.companyId,
        status: "Completed",
        r2Key,
        branded,
        title,
        resumeId: projectResumeId,
      } as any)
      .returning();
    video = created;
    invalidatePublicVideoFeed();
  }

  // Mark the project as Published so it shows up on the user's profile.
  // The user can still flip videos.privacyStatus via the Make Public toggle
  // to also expose it on the homepage public feed.
  let [updatedProject] = await db
    .update(studioProjects)
    .set({ status: "published", videoId: video.id, resumeId: projectResumeId, updatedAt: new Date() } as any)
    .where(eq(studioProjects.id, project.id))
    .returning();
  // A candidate video whose new render the candidate hasn't approved goes
  // (back) to unlisted + off-profile — a re-render is new content.
  if (await enforceCandidateVideoConsent(project.id)) {
    [updatedProject] = await db.select().from(studioProjects).where(eq(studioProjects.id, project.id)).limit(1);
  }
  // A page→video embed resolves the project's CURRENT video, so a
  // re-render must orphan the cached public resolve payloads.
  bumpPageEmbedsVersion();
  bumpPublicWatchCache(project.id, project.slug, project.videoId, video.id);

  // Mirror to the central usage ledger so video publishes show up on the
  // Usage Statement panel. Re-uploads to the same project (where the project
  // already had a video) are still counted as one publish event each.
  servicesProcessor.meterEvent(c, "video_publish", { projectId: project.id, videoId: video.id, resolution });
  // A new render of a public video must pass the explicit scan again before
  // it shows on the home wall (the client follows up with sampled frames).
  scheduleVideoScan(c, video.id);
  if (resolution === "4k") {
    servicesProcessor.meterEvent(c, "export_4k", { projectId: project.id, videoId: video.id });
  } else if (resolution === "1080p") {
    servicesProcessor.meterEvent(c, "export_1080p", { projectId: project.id, videoId: video.id });
  }

  return c.json(ok(toProjectDto(updatedProject, video)), 201);
});

studioRoutes.get("/status/:projectId", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const db = getDb();

  const [project] = await db
    .select()
    .from(studioProjects)
    .where(and(eq(studioProjects.id, projectId), eq(studioProjects.userId, user.sub)))
    .limit(1);

  if (!project) {
    return c.json(fail("NOT_FOUND", "Studio project not found"), 404);
  }

  let linkedVideo: typeof videos.$inferSelect | null = null;
  if (project.videoId) {
    const [video] = await db
      .select()
      .from(videos)
      .where(and(eq(videos.id, project.videoId), eq(videos.userId, user.sub)))
      .limit(1);
    linkedVideo = video ?? null;
  }

  const status = mapStudioStatus(project.status);
  const progressPercentage =
    status === "Draft" ? 10 :
    status === "Processing" ? 45 :
    status === "Publishing" ? 75 :
    status === "Completed" ? 100 : 0;

  return c.json(ok({
    id: project.id,
    status,
    progressPercentage,
    youtubeVideoId: linkedVideo?.youtubeVideoId ?? null,
    videoUrl: linkedVideo?.youtubeUrl ?? (linkedVideo?.r2Key ? cdnUrl(linkedVideo.r2Key) : null),
    // The hosted MP4 itself (null before the first render). Every render
    // uploads under a new key, so a caller waiting for a FRESH render (the
    // Chrome extension after updating a project) watches this change.
    renderUrl: linkedVideo?.r2Key ? cdnUrl(linkedVideo.r2Key) : null,
    errorMessage: status === "Failed" ? linkedVideo?.errorMessage ?? "Publishing failed" : null,
  }));
});

// ─── GET /projects/public ─────────────────────────────────────────────────────
// Public read path for the EntityVideos rail mounted on entity cards
// (resume / job / company / profile / article / etc.). Closes gap #323:
// the auth'd `/projects` endpoint filters by ownership, so a non-owner
// viewing someone else's card never saw videos linked to that entity —
// even when the owner had explicitly marked them public.
//
// Returns the projects matching `subject × isPublic=true` regardless of
// ownership, filtered to render-watchable statuses (everything except
// the two failure states). DTO shape is identical to `/projects` so the
// frontend can swap endpoints without a parallel type.
//
// Subject filter is REQUIRED — we don't expose an ungrouped global
// "all public studio projects" list here; the homepage feed has its
// own dedicated `/videos/public` route for that.
//
// MUST be declared before `/projects/:projectId` below — Hono's
// SmartRouter is normally static-first, but the explicit order also
// covers the LinearRouter fallback path and is unambiguous to readers.
studioRoutes.get("/projects/public", async (c) => {
  const subjectKindParam = c.req.query("subjectKind");
  const subjectIdParam = c.req.query("subjectId");
  if (
    !subjectKindParam ||
    !subjectIdParam ||
    !STUDIO_SUBJECT_KINDS.includes(subjectKindParam as (typeof STUDIO_SUBJECT_KINDS)[number])
  ) {
    return c.json(fail("VALIDATION_ERROR", "subjectKind and subjectId are required"), 400);
  }
  // Cached per subject (#274/#275 — the entity pages read this on every
  // view); every write that can change the list invalidates its subjects.
  const subject = { kind: subjectKindParam, id: subjectIdParam };
  const list = await getPublicProjectsCached(subject, async () => {
    const db = getDb();

    const subjectRows = await db
      .select({ projectId: studioProjectSubjects.projectId })
      .from(studioProjectSubjects)
      .where(and(
        eq(studioProjectSubjects.subjectKind, subjectKindParam),
        eq(studioProjectSubjects.subjectId, subjectIdParam),
      ));
    if (subjectRows.length === 0) return [];
    const projectIds = subjectRows.map((r) => r.projectId);

    const projects = await db
      .select()
      .from(studioProjects)
      .where(and(
        inArray(studioProjects.id, projectIds),
        publicStudioProjectWhere(),
        notInArray(studioProjects.status, ["failed", "publish_failed"]),
      ))
      .orderBy(desc(studioProjects.updatedAt));
    if (projects.length === 0) return [];

    // Linked videos for thumbnail / videoUrl resolution. Filter is implicit
    // — these rows belong to projects we've already vetted as public, so no
    // extra ownership check needed.
    const videoIds = projects.map((p) => p.videoId).filter((id): id is string => Boolean(id));
    const linkedVideos = videoIds.length
      ? await db.select().from(videos).where(inArray(videos.id, videoIds))
      : [];
    const videoById = new Map(linkedVideos.map((v) => [v.id, v]));

    return projects.map((p) => toProjectDto(
      p,
      p.videoId ? videoById.get(p.videoId) ?? null : null,
      // Analytics omitted — view/cta counts aren't part of the public
      // card surface and would require an extra grouped query.
      undefined,
      // Subjects omitted — the caller already knows the subject (it
      // supplied the filter pair) and the rail doesn't render them.
      [],
    ));
  });
  return c.json(ok(list));
});

// ─── GET /projects/:projectId ─────────────────────────────────────────────────
// Single-project hydration — the v2 editor at /studio/:id calls this so it
// doesn't have to fetch the full project list and filter client-side. Workspace
// authorization mirrors the list route: caller must be the owner, a member of
// the owning company, OR hold a workspace grant from the owner.
studioRoutes.get("/projects/:projectId", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const db = getDb();

  const [row] = await db
    .select({ userId: studioProjects.userId, companyId: studioProjects.companyId })
    .from(studioProjects)
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  // Return 404 (not 403) when the caller can't read — avoids leaking
  // existence to clients who would otherwise be able to enumerate ids.
  if (!row) return c.json(fail("NOT_FOUND", "Project not found"), 404);
  const allowed = await canActFor(user.sub, row.userId, row.companyId ?? null);
  if (!allowed) return c.json(fail("NOT_FOUND", "Project not found"), 404);

  const dto = await loadProjectDtoById(db, projectId);
  if (!dto) return c.json(fail("NOT_FOUND", "Project not found"), 404);
  return c.json(ok(dto));
});

// ─── DELETE /projects/:projectId ──────────────────────────────────────────────
studioRoutes.delete("/projects/:projectId", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const db = getDb();

  // Load row first so we can authorize against its real owner. Personal
  // rows still match `eq(userId, me)`; company/delegated rows now also
  // delete cleanly when the actor has the right grant.
  const [row] = await db
    .select({ id: studioProjects.id, userId: studioProjects.userId, companyId: studioProjects.companyId })
    .from(studioProjects)
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  if (!row) return c.json(fail("NOT_FOUND", "Project not found"), 404);
  try {
    await assertCanWrite(user.sub, row.userId, row.companyId ?? null);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) return c.json(fail("FORBIDDEN", e.message), 403);
    throw e;
  }
  const subjectsBefore = await loadProjectSubjects(db, projectId);
  // Also drops the master render's and fitted cuts' video rows + R2 objects.
  await deleteProjectWithMedia(projectId, { db });
  invalidatePublicProjectsForSubjects(subjectsBefore);
  return c.json(ok({ id: projectId }));
});

// ─── PATCH /projects/:projectId/status ────────────────────────────────────────
//
// Status is the canonical publish/unpublish toggle. The studio ellipsis
// menu's "Publish to Profile" / "Remove from Profile" lands here with
// status="published" / "exported". The handler is responsible for keeping
// THREE pieces of state in sync so every read surface agrees:
//
//   1. studio_projects.status                — the enum itself
//   2. studio_projects.is_profile_primary    — "THE video on my profile"
//                                              (per-user singleton via the
//                                              partial unique index from
//                                              migration 0088). Publish
//                                              flips this true + rolls
//                                              off any sibling primary
//                                              in the same tx. Unpublish
//                                              flips it false.
//   3. videos.privacy_status                 — gates the off-platform CDN
//                                              URL. Mirrored to "public"
//                                              on publish, "unlisted" on
//                                              unpublish. The sibling
//                                              /visibility route owns
//                                              this same mirror for
//                                              user-driven privacy
//                                              toggles — we just keep
//                                              the publish path in step
//                                              so /u/:handle (which
//                                              filters by privacy_status)
//                                              doesn't drift from
//                                              /api/studio/videos/user
//                                              (which filters by status).
//
// Was gap #723 (privacy mirror) + #725 (no primary concept). Closed
// 2026-05-16 alongside the homepage-featured flag.
studioRoutes.patch("/projects/:projectId/status", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    status: z.enum(["draft", "exported", "published", "processing", "failed"]),
  }).safeParse(body);

  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid status", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [row] = await db
    .select({
      id: studioProjects.id,
      userId: studioProjects.userId,
      companyId: studioProjects.companyId,
      videoId: studioProjects.videoId,
      mediaKind: studioProjects.mediaKind,
    })
    .from(studioProjects)
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  if (!row) return c.json(fail("NOT_FOUND", "Project not found"), 404);
  try {
    await assertCanWrite(user.sub, row.userId, row.companyId ?? null);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) return c.json(fail("FORBIDDEN", e.message), 403);
    throw e;
  }

  const nextStatus = parsed.data.status;
  const isPublish = nextStatus === "published";
  const isUnpublish = nextStatus === "exported";
  if (isPublish) {
    const blocked = await candidateConsentGate(c, projectId);
    if (blocked) return blocked;
    const capped = await postChannelGate(c, projectId, "profile");
    if (capped) return capped;
  }

  // The primary-profile pointer is owned by the row's userId (creator),
  // not the actor. Without this distinction a delegated editor publishing
  // on behalf of someone else would flip THEIR own primary. The row's
  // userId is the right scope key for the unique index too.
  if (isPublish) {
    // Roll off any sibling primary first so the partial unique index
    // never sees two true rows in the same tx. The same-row update
    // below promotes the freshly-published one.
    await db
      .update(studioProjects)
      .set({ isProfilePrimary: false, updatedAt: new Date() })
      .where(and(
        eq(studioProjects.userId, row.userId),
        eq(studioProjects.isProfilePrimary, true),
      ));
  }

  const [updated] = await db
    .update(studioProjects)
    .set({
      status: nextStatus,
      updatedAt: new Date(),
      ...(isPublish ? { isProfilePrimary: true } : {}),
      ...(isUnpublish ? { isProfilePrimary: false } : {}),
    } as any)
    .where(eq(studioProjects.id, projectId))
    .returning();
  if (!updated) return c.json(fail("NOT_FOUND", "Project not found"), 404);

  // Mirror to the linked videos row so privacy-status readers (channels,
  // homepage feed) agree with status readers. Skip when there is no
  // rendered video — those projects are still served live through
  // <CanvasStatePreview/> and don't have a CDN URL to gate.
  if (row.videoId && (isPublish || isUnpublish)) {
    await db
      .update(videos)
      .set({
        privacyStatus: isPublish ? "public" : "unlisted",
        updatedAt: new Date(),
      })
      .where(eq(videos.id, row.videoId));
    invalidatePublicVideoFeed();
    if (isPublish) scheduleVideoScan(c, row.videoId);
  }

  const linkedVideo = row.videoId
    ? (await db.select().from(videos).where(eq(videos.id, row.videoId)).limit(1))[0] ?? null
    : null;

  const dto = toProjectDto(updated, linkedVideo);
  // The /m/<slug> watch payload flips between "pending" and live with status.
  bumpPublicWatchCache(updated.id, updated.slug, updated.videoId);

  // Record (or clear) the on-platform "profile" publication so the editor's
  // "Published to" list reflects where the project actually lives. The view
  // URL is the public /m/<slug|id> link the share-menu also uses.
  if (isPublish) {
    await recordPublication({
      projectId,
      destination: "profile",
      externalUrl: publicVideoPath(dto.slug || projectId),
      status: "published",
    }).catch(() => undefined);
  } else if (isUnpublish) {
    await removePublication(projectId, "profile").catch(() => undefined);
  }

  // Award the project CREATOR (not necessarily the publishing actor) for
  // publishing a creative-studio create-kind (game / comic / podcast). Video
  // and other output kinds are scored elsewhere / not at all. Role is resolved
  // from the DB so a delegated editor publishing on the creator's behalf still
  // credits the creator. Deduped on project id. Fire-and-forget.
  if (isPublish && (row.mediaKind === "game" || row.mediaKind === "comic" || row.mediaKind === "podcast")) {
    try {
      const { GamificationService, ACTIONS } = await import("../domains/gamification/index.js");
      const { buildRepos } = await import("../repositories/index.js");
      const game = new GamificationService(buildRepos(db));
      const action =
        row.mediaKind === "game"
          ? ACTIONS.STUDIO_GAME_PUBLISHED
          : row.mediaKind === "comic"
            ? ACTIONS.STUDIO_COMIC_PUBLISHED
            : ACTIONS.STUDIO_PODCAST_PUBLISHED;
      await game.awardWithRoleLookup(action, {
        userId: row.userId,
        refId: projectId,
        refType: "studio_project",
        metadata: { mediaKind: row.mediaKind },
      });
    } catch (e) {
      console.warn("[gamification] studio-create-published award failed", { projectId, error: String(e) });
    }
  }

  // A failed status drops it from the public lists; a recovery restores it.
  invalidatePublicProjectsForSubjects(await loadProjectSubjects(getDb(), projectId));
  return c.json(ok(dto));
});

// ─── Publication records (#1920) ─────────────────────────────────────────────
// "Where has this project been published?" — one row per destination, served
// to the editor's Save menu + Details drawer. Every publish flow records its
// own row server-side (profile; YouTube and the other social networks via
// POST /projects/:id/publish/social/:platform — studio-social-publish.ts);
// there is no client-written recorder. See publication-service.ts.

// List a project's publication records (one per destination). Cached read.
studioRoutes.get("/projects/:projectId/publications", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const db = getDb();
  const [row] = await db
    .select({ id: studioProjects.id, userId: studioProjects.userId, companyId: studioProjects.companyId })
    .from(studioProjects)
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  if (!row) return c.json(fail("NOT_FOUND", "Project not found"), 404);
  try {
    await assertCanWrite(user.sub, row.userId, row.companyId ?? null);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) return c.json(fail("FORBIDDEN", e.message), 403);
    throw e;
  }
  return c.json(ok(await listPublications(projectId)));
});

// ─── PATCH /projects/:projectId/visibility ───────────────────────────────────
// Toggle a published video between public and unlisted.
studioRoutes.patch("/projects/:projectId/visibility", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    isPublic: z.boolean(),
  }).safeParse(body);

  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [project] = await db
    .select()
    .from(studioProjects)
    .where(eq(studioProjects.id, projectId))
    .limit(1);

  if (!project) return c.json(fail("NOT_FOUND", "Project not found"), 404);
  try {
    await assertCanWrite(user.sub, project.userId, project.companyId ?? null);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) return c.json(fail("FORBIDDEN", e.message), 403);
    throw e;
  }
  if (parsed.data.isPublic) {
    const blocked = await candidateConsentGate(c, project.id);
    if (blocked) return blocked;
  }

  // Project-level visibility is the authoritative flag after #665 — the
  // watch page plays the saved canvas live (<CanvasStatePreview/>), so toggling
  // Public on a draft makes it viewable in-platform without a render. The one
  // writer (services/studio/project-visibility.ts) mirrors videos.privacy_status
  // and orphans the search / feed / subject-list / watch caches.
  const updatedProject = await applyProjectVisibility(db, project, parsed.data.isPublic);
  // The home page's video wall shows a public render only after the explicit scan.
  if (parsed.data.isPublic && project.videoId) scheduleVideoScan(c, project.videoId);

  const linkedVideo = project.videoId
    ? (await db.select().from(videos).where(eq(videos.id, project.videoId)).limit(1))[0] ?? null
    : null;
  return c.json(ok(toProjectDto(updatedProject ?? project, linkedVideo)));
});

studioRoutes.get("/projects", async (c) => {
  const user = c.var.user;
  const db = getDb();

  // Optional polymorphic subject filter — `?subjectKind=resume&subjectId=abc`
  // returns only the projects linked to that entity. Now reads through
  // the studio_project_subjects join table (replaces the dropped 1:1
  // subject columns).
  const subjectKindParam = c.req.query("subjectKind");
  const subjectIdParam = c.req.query("subjectId");
  const subjectFilterValid =
    !!subjectKindParam &&
    !!subjectIdParam &&
    STUDIO_SUBJECT_KINDS.includes(subjectKindParam as (typeof STUDIO_SUBJECT_KINDS)[number]);

  // Optional explicit workspace scope — `?workspace=company:<id>` /
  // `?workspace=delegated:<userId>` / `?workspace=personal`. When omitted,
  // the read returns rows across every workspace the user can act in.
  const restrictToWorkspace = parseWorkspaceQueryParam(c.req.query("workspace"));

  const { companyIds, delegatedSubjectUserIds } = await listAccessibleWorkspaces(user.sub);
  const ownershipFilter = buildOwnershipFilter({
    userIdColumn: studioProjects.userId,
    companyIdColumn: studioProjects.companyId,
    actorUserId: user.sub,
    companyIds,
    delegatedSubjectUserIds,
    restrictToWorkspace,
  });

  // When the caller supplies a subject filter, narrow to the project ids
  // present in studio_project_subjects matching that pair. Done as a
  // pre-fetch so we don't have to add a join clause to the main select
  // (keeps the existing analytics fan-out intact).
  let subjectFilteredIds: string[] | null = null;
  if (subjectFilterValid) {
    const subjectRows = await db
      .select({ projectId: studioProjectSubjects.projectId })
      .from(studioProjectSubjects)
      .where(and(
        eq(studioProjectSubjects.subjectKind, subjectKindParam!),
        eq(studioProjectSubjects.subjectId, subjectIdParam!),
      ));
    subjectFilteredIds = subjectRows.map((r) => r.projectId);
    // Empty set short-circuits the entire query.
    if (subjectFilteredIds.length === 0) {
      return c.json(ok([]));
    }
  }

  const whereClause = subjectFilteredIds
    ? and(ownershipFilter, inArray(studioProjects.id, subjectFilteredIds))
    : ownershipFilter;

  // Capped at the 500 most-recently-updated projects; still returned in
  // ascending updatedAt order (response contract unchanged).
  const projects = await new MediaRepository(db).findStudioProjectsWhere(whereClause, 500);

  const videoIds = projects.map((p) => p.videoId).filter((id): id is string => Boolean(id));

  // Linked videos are filtered by the same ownership scope so a stray
  // (project, video) cross-reference can't leak someone else's video.
  const videoOwnershipFilter = buildOwnershipFilter({
    userIdColumn: videos.userId,
    companyIdColumn: videos.companyId,
    actorUserId: user.sub,
    companyIds,
    delegatedSubjectUserIds,
    restrictToWorkspace,
  });
  const projectIds = projects.map((p) => p.id);
  const [linkedVideos, analyticsRows] = await Promise.all([
    videoIds.length
      ? db.select().from(videos).where(and(videoOwnershipFilter, inArray(videos.id, videoIds)))
      : Promise.resolve([]),
    projectIds.length
      ? db
          .select({
            studioProjectId: videoAnalytics.studioProjectId,
            viewCount: sql<number>`count(*) filter (where ${videoAnalytics.event} = 'view')::int`,
            ctaClickCount: sql<number>`count(*) filter (where ${videoAnalytics.event} = 'cta_click')::int`,
          })
          .from(videoAnalytics)
          .where(inArray(videoAnalytics.studioProjectId, projectIds))
          .groupBy(videoAnalytics.studioProjectId)
      : Promise.resolve([]),
  ]);

  const videoById = new Map(linkedVideos.map((v) => [v.id, v]));
  const analyticsByProject = new Map(
    analyticsRows.map((a) => [a.studioProjectId, { viewCount: a.viewCount, ctaClickCount: a.ctaClickCount }]),
  );

  // Bulk-load subjects + published-channel counts so each DTO carries them
  // without N+1ing (one query each for the whole list).
  const [subjectsByProject, channelsByProject] = await Promise.all([
    loadProjectSubjectsBulk(db, projectIds),
    countPublishedChannelsByProject(projectIds, db),
  ]);

  const dtos = projects.map((p) => toProjectDto(
    p,
    p.videoId ? videoById.get(p.videoId) ?? null : null,
    analyticsByProject.get(p.id),
    subjectsByProject.get(p.id) ?? [],
    channelsByProject.get(p.id) ?? 0,
  ));
  // `?fields=` trims each row for list views (the full DTO carries every
  // editor state blob).
  const fields = parseFields(c.req.query("fields"), STUDIO_PROJECT_LIST_FIELDS);
  return c.json(ok(projectRows(dtos as Array<Record<string, unknown>>, fields)));
});

// ─── Per-link subject management ──────────────────────────────────────────────
// POST   /api/studio/projects/:projectId/subjects        — add a single link
// DELETE /api/studio/projects/:projectId/subjects/:kind/:subjectId — remove
// Both are idempotent — adding a link that already exists returns the
// row, removing one that doesn't exist returns 200. Saves the client
// from having to track current state perfectly.

studioRoutes.post("/projects/:projectId/subjects", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    kind: z.enum(STUDIO_SUBJECT_KINDS),
    id:   z.string().min(1).max(200),
  }).safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }
  const db = getDb();

  const [existing] = await db
    .select({ userId: studioProjects.userId, companyId: studioProjects.companyId })
    .from(studioProjects)
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  if (!existing) return c.json(fail("NOT_FOUND", "Project not found"), 404);
  try {
    await assertCanWrite(user.sub, existing.userId, existing.companyId ?? null);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) return c.json(fail("FORBIDDEN", e.message), 403);
    throw e;
  }

  const inserted = await db
    .insert(studioProjectSubjects)
    .values({ projectId, subjectKind: parsed.data.kind, subjectId: parsed.data.id } as any)
    .onConflictDoNothing()
    .returning({ id: studioProjectSubjects.projectId });

  // A newly linked candidate makes this a candidate video: unlisted until
  // the candidate approves it (POST /api/recruiter/candidate-video-consents).
  if (parsed.data.kind === "talent_pool_candidate" && inserted.length > 0) {
    await forceProjectUnlisted(projectId, db);
  }

  // Keep the legacy `studio_projects.resume_id` denorm in sync for
  // resume-kind links so analytics joins that read it stay consistent.
  if (parsed.data.kind === "resume") {
    await db
      .update(studioProjects)
      .set({ resumeId: parsed.data.id } as any)
      .where(eq(studioProjects.id, projectId));
  }

  invalidatePublicProjectsForSubjects([parsed.data]);
  const subjects = await loadProjectSubjects(db, projectId);
  return c.json(ok({ projectId, subjects }), 201);
});

studioRoutes.delete("/projects/:projectId/subjects/:kind/:subjectId", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const kind = c.req.param("kind");
  const subjectId = c.req.param("subjectId");
  if (!STUDIO_SUBJECT_KINDS.includes(kind as (typeof STUDIO_SUBJECT_KINDS)[number])) {
    return c.json(fail("VALIDATION_ERROR", "Unknown subject kind"), 400);
  }
  const db = getDb();

  const [existing] = await db
    .select({ userId: studioProjects.userId, companyId: studioProjects.companyId, resumeId: studioProjects.resumeId })
    .from(studioProjects)
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  if (!existing) return c.json(fail("NOT_FOUND", "Project not found"), 404);
  try {
    await assertCanWrite(user.sub, existing.userId, existing.companyId ?? null);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) return c.json(fail("FORBIDDEN", e.message), 403);
    throw e;
  }

  await db
    .delete(studioProjectSubjects)
    .where(and(
      eq(studioProjectSubjects.projectId, projectId),
      eq(studioProjectSubjects.subjectKind, kind),
      eq(studioProjectSubjects.subjectId, subjectId),
    ));

  // If the unlinked row was the legacy resumeId denorm, clear it.
  if (kind === "resume" && existing.resumeId === subjectId) {
    await db
      .update(studioProjects)
      .set({ resumeId: null } as any)
      .where(eq(studioProjects.id, projectId));
  }

  invalidatePublicProjectsForSubjects([{ kind, id: subjectId }]);
  const subjects = await loadProjectSubjects(db, projectId);
  return c.json(ok({ projectId, subjects }));
});

// ─── DELETE /videos/:id ───────────────────────────────────────────────────────
// Explicit per-video delete with R2 reclamation (gap #730). Reclaims the
// video's R2 blob THEN drops the row, so the object isn't leaked the way the
// `users` ON DELETE CASCADE leaks it. Authorized the same way every other
// video write is: `assertCanWrite` against the row's real owner (personal,
// company, or delegated grant) — admins/SA pass via canActFor's admin bypass.
// 404 (not 403) on unreadable ids to avoid leaking existence.
studioRoutes.delete("/videos/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();

  const [row] = await db
    .select({
      id: videos.id,
      userId: videos.userId,
      companyId: videos.companyId,
      r2Key: videos.r2Key,
    })
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);
  if (!row) return c.json(fail("NOT_FOUND", "Video not found"), 404);
  try {
    await assertCanWrite(user.sub, row.userId, row.companyId ?? null);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) return c.json(fail("FORBIDDEN", e.message), 403);
    throw e;
  }

  // Reclaim the blob first so a crash between the two leaves an orphaned R2
  // object (caught by the admin sweep) rather than a dangling DB row.
  await reclaimVideoR2([row]);
  await db.delete(videos).where(eq(videos.id, id));
  invalidatePublicVideoFeed();
  return c.json(ok({ id }));
});

// ─── GET /videos/user/:userId ─────────────────────────────────────────────────
// Returns published studio videos for a user (for profile display).
// No auth required — returns public/published videos only.
//
// Profile surface includes BOTH:
//   1. Videos the user owns (studio_projects.userId = :userId)
//   2. Videos credited to the user as a contributor / portfolio piece —
//      i.e. delegated work where they edited on someone else's behalf
//      (studio_project_subjects WHERE subject_kind = 'creator_credit'
//       AND subject_id = :userId). See migration adding creator_credit
//      to STUDIO_SUBJECT_KINDS in shared/studio-subject.ts.
studioRoutes.get("/videos/user/:userId", async (c) => {
  const userId = c.req.param("userId");
  const user = c.var.user as { sub: string } | undefined;
  const db = getDb();

  // Pre-fetch project ids credited to this user as a contributor. Empty
  // set is fine — the OR below short-circuits.
  const creditedProjectRows = await db
    .select({ projectId: studioProjectSubjects.projectId })
    .from(studioProjectSubjects)
    .where(and(
      eq(studioProjectSubjects.subjectKind, "creator_credit"),
      eq(studioProjectSubjects.subjectId, userId),
    ));
  const creditedProjectIds = creditedProjectRows.map((r) => r.projectId);

  const ownerOrCredit = creditedProjectIds.length
    ? or(eq(studioProjects.userId, userId), inArray(studioProjects.id, creditedProjectIds))
    : eq(studioProjects.userId, userId);

  // Source from studio_projects, NOT videos. v2 (kind='nle') projects
  // play live off `timelineSpec` via <CanvasStatePreview/> and never
  // have a `videos` row until export — the old INNER JOIN videos
  // gate, plus the legacy `status="published"` filter, kept every
  // public-yet-unrendered project off the profile/resume surfaces.
  // Visibility is project-level: `is_public=true` for the public
  // surface; owners/workspace editors see drafts so pre-publish QA
  // still resolves.
  const rows = await db
    .select({
      projectId: studioProjects.id,
      userId: studioProjects.userId,
      companyId: studioProjects.companyId,
      isPublic: studioProjects.isPublic,
      isProfilePrimary: studioProjects.isProfilePrimary,
      storyboard: studioProjects.storyboard,
      // mediaKind + per-runtime state — included so the
      // ProfileVideoPanel rail can dispatch via <ProjectPlayer/>
      // and render image / game / animation / cad / comic
      // projects with their own surface instead of falling
      // through to the legacy video-only path (#1215).
      mediaKind: studioProjects.mediaKind,
      timelineSpec: studioProjects.timelineSpec,
      gameState: studioProjects.gameState,
      imageState: studioProjects.imageState,
      animationState: studioProjects.animationState,
      cadState: studioProjects.cadState,
      cad3dState: studioProjects.cad3dState,
      comicState: studioProjects.comicState,
      createdAt: studioProjects.createdAt,
      // LEFT-joined optional baked artifacts.
      videoTitle: videos.title,
      r2Key: videos.r2Key,
      youtubeUrl: videos.youtubeUrl,
      youtubeVideoId: videos.youtubeVideoId,
      thumbnailUrl: videos.thumbnailUrl,
      description: videos.description,
      privacyStatus: videos.privacyStatus,
      isCreatorCredit: sql<boolean>`${studioProjects.userId} <> ${userId}`,
    })
    .from(studioProjects)
    .leftJoin(videos, eq(videos.id, studioProjects.videoId))
    .where(ownerOrCredit)
    .orderBy(desc(studioProjects.isProfilePrimary), desc(studioProjects.createdAt))
    .limit(40);

  // Workspace context for the owner/editor draft-visibility bypass.
  let userCompanyIds: string[] = [];
  let userDelegatedSubjects: string[] = [];
  if (user) {
    const ws = await listAccessibleWorkspaces(user.sub);
    userCompanyIds = ws.companyIds;
    userDelegatedSubjects = ws.delegatedSubjectUserIds;
  }
  const canEdit = (v: { userId: string; companyId: string | null }) => {
    if (!user) return false;
    if (v.userId === user.sub) return true;
    if (v.companyId && userCompanyIds.includes(v.companyId)) return true;
    if (v.companyId == null && userDelegatedSubjects.includes(v.userId)) return true;
    return false;
  };

  const visible = rows.filter((r) => r.isPublic || canEdit(r)).slice(0, 20);

  // Resolve which subject surfaces (profile/resume) each project belongs
  // to *for this user*. Profile qualifies when subject_kind='profile' AND
  // subject_id=:userId; resume qualifies when subject_kind='resume' AND
  // subject_id is one of this user's resumes. Other subject kinds (job
  // /company/...) are intentionally omitted — they don't render on the
  // profile page.
  const projectIds = visible.map((r) => r.projectId);
  const userResumeRows = projectIds.length
    ? await db
        .select({ id: resumeInformation.id })
        .from(resumeInformation)
        .where(eq(resumeInformation.userId, userId))
    : [];
  const userResumeIds = userResumeRows.map((r) => r.id);

  const surfaceRows = projectIds.length
    ? await db
        .select({
          projectId: studioProjectSubjects.projectId,
          subjectKind: studioProjectSubjects.subjectKind,
          subjectId: studioProjectSubjects.subjectId,
        })
        .from(studioProjectSubjects)
        .where(inArray(studioProjectSubjects.projectId, projectIds))
    : [];

  const subjectKindsByProject = new Map<string, Set<string>>();
  for (const s of surfaceRows) {
    const qualifies =
      (s.subjectKind === "profile" && s.subjectId === userId) ||
      (s.subjectKind === "resume" && userResumeIds.includes(s.subjectId));
    if (!qualifies) continue;
    const set = subjectKindsByProject.get(s.projectId) ?? new Set<string>();
    set.add(s.subjectKind);
    subjectKindsByProject.set(s.projectId, set);
  }

  return c.json(ok(visible.map((v) => {
    const meta = v.storyboard as { _name?: string } | null;
    return {
      // Project id — `/api/studio/public/:videoId` accepts both
      // project and video ids, so <StudioVideoSurface mode="lazy"/>
      // hydrates the canvas regardless of whether a baked video row
      // exists.
      id: v.projectId,
      title: meta?._name ?? v.videoTitle ?? null,
      videoUrl: v.youtubeUrl ?? (v.r2Key ? cdnUrl(v.r2Key) : null),
      youtubeUrl: v.youtubeUrl,
      youtubeVideoId: v.youtubeVideoId,
      thumbnailUrl: v.thumbnailUrl,
      description: v.description,
      privacyStatus: v.privacyStatus,
      // mediaKind + state-column fan-out (#1215) so the rail can
      // dispatch through <ProjectPlayer/> for non-video projects.
      mediaKind: (v.mediaKind as string | null) ?? "video",
      timelineSpec: v.timelineSpec ?? null,
      gameState: v.gameState ?? null,
      imageState: v.imageState ?? null,
      animationState: v.animationState ?? null,
      cadState: v.cadState ?? null,
      comicState: v.comicState ?? null,
      isProfilePrimary: Boolean(v.isProfilePrimary),
      isCreatorCredit: Boolean(v.isCreatorCredit),
      subjectKinds: Array.from(subjectKindsByProject.get(v.projectId) ?? []),
      createdAt: asIso(v.createdAt),
    };
  })));
});

// ─── GET /videos/resume/:resumeId ─────────────────────────────────────────────
// Projects associated with a specific resume. Source of truth is
// `studio_project_subjects` (subject_kind='resume' + subject_id=:resumeId)
// — the same polymorphic table the profile/job/company surfaces read.
// v2 projects (kind='nle') have no `videos` row until export, so the
// old `videos.resumeId` join missed them entirely; this version
// returns the project regardless and LEFT JOINs the optional baked
// video so thumbnails/MP4 URLs still flow when they exist.
//
// Visibility: public surface only sees `studio_projects.isPublic=true`.
// Workspace members keep edit-access (their own drafts surface for
// pre-publish QA).
//
// The returned `id` is the studio_project id — the frontend feeds it
// to <StudioVideoSurface mode="lazy"/> which fetches the public
// payload and mounts <CanvasStatePreview/> off `timelineSpec`, so the
// resume header plays the SAME canvas the editor preview renders.
studioRoutes.get("/videos/resume/:resumeId", async (c) => {
  const resumeId = c.req.param("resumeId");
  const user = c.var.user as { sub: string } | undefined;
  const db = getDb();

  const rows = await db
    .select({
      projectId: studioProjects.id,
      userId: studioProjects.userId,
      companyId: studioProjects.companyId,
      isPublic: studioProjects.isPublic,
      projectStatus: studioProjects.status,
      storyboard: studioProjects.storyboard,
      // mediaKind + parallel state — surfaced so the resume detail
      // header carousel can dispatch through <ProjectPlayer/> per
      // kind (#1215). Without these the rail rendered image / game
      // / animation projects as "Video is being processed".
      mediaKind: studioProjects.mediaKind,
      timelineSpec: studioProjects.timelineSpec,
      gameState: studioProjects.gameState,
      imageState: studioProjects.imageState,
      animationState: studioProjects.animationState,
      cadState: studioProjects.cadState,
      comicState: studioProjects.comicState,
      isProfilePrimary: studioProjects.isProfilePrimary,
      createdAt: studioProjects.createdAt,
      // LEFT-joined optional baked video — present after export, null
      // before. Thumbnails + MP4 URL come from here when set; the live
      // canvas branch always works regardless.
      videoTitle: videos.title,
      r2Key: videos.r2Key,
      youtubeUrl: videos.youtubeUrl,
      youtubeVideoId: videos.youtubeVideoId,
      thumbnailUrl: videos.thumbnailUrl,
      privacyStatus: videos.privacyStatus,
      videoStatus: videos.status,
    })
    .from(studioProjectSubjects)
    .innerJoin(studioProjects, eq(studioProjects.id, studioProjectSubjects.projectId))
    .leftJoin(videos, eq(videos.id, studioProjects.videoId))
    .where(and(
      eq(studioProjectSubjects.subjectKind, "resume"),
      eq(studioProjectSubjects.subjectId, resumeId),
    ))
    .orderBy(desc(studioProjects.isProfilePrimary), desc(studioProjects.createdAt));

  // Workspace context for the owner/editor branch below.
  let userCompanyIds: string[] = [];
  let userDelegatedSubjects: string[] = [];
  if (user) {
    const ws = await listAccessibleWorkspaces(user.sub);
    userCompanyIds = ws.companyIds;
    userDelegatedSubjects = ws.delegatedSubjectUserIds;
  }
  const canEdit = (v: { userId: string; companyId: string | null }) => {
    if (!user) return false;
    if (v.userId === user.sub) return true;
    if (v.companyId && userCompanyIds.includes(v.companyId)) return true;
    if (v.companyId == null && userDelegatedSubjects.includes(v.userId)) return true;
    return false;
  };

  const visible = rows.filter((v) => {
    // Public surface: project must be marked public.
    if (v.isPublic) return true;
    // Owner/editor surface: see drafts for pre-publish QA.
    return canEdit(v);
  });

  return c.json(ok(visible.map((v) => {
    const meta = v.storyboard as { _name?: string } | null;
    return {
      // Project id — /api/studio/public/:videoId accepts both project
      // and video ids, so the lazy surface hydrates either way.
      id: v.projectId,
      title: meta?._name ?? v.videoTitle ?? null,
      videoUrl: v.youtubeUrl ?? (v.r2Key ? cdnUrl(v.r2Key) : null),
      youtubeUrl: v.youtubeUrl,
      youtubeVideoId: v.youtubeVideoId,
      thumbnailUrl: v.thumbnailUrl,
      privacyStatus: v.privacyStatus,
      status: v.videoStatus ?? v.projectStatus,
      // mediaKind + state-column fan-out (#1215).
      mediaKind: (v.mediaKind as string | null) ?? "video",
      timelineSpec: v.timelineSpec ?? null,
      gameState: v.gameState ?? null,
      imageState: v.imageState ?? null,
      animationState: v.animationState ?? null,
      cadState: v.cadState ?? null,
      comicState: v.comicState ?? null,
      isProfilePrimary: v.isProfilePrimary,
      createdAt: asIso(v.createdAt),
    };
  })));
});

// ─── GET /videos/public ───────────────────────────────────────────────────────
// Discovery feed (card-feed) and the home page's video wall. Cached until a
// video changes (services/studio/public-video-feed.ts). No auth required.
studioRoutes.get("/videos/public", async (c) => {
  return c.json(ok(await getPublicVideoFeed()));
});

// ─── GET /videos/featured ─────────────────────────────────────────────────────
// Homepage hero carousel. Returns SA-featured public projects in the
// order they were last promoted (most-recent first). Empty array →
// HeroVideoSpotlight falls back to its skeleton state. No auth required.
//
// Source of truth is `studio_projects.is_featured` (migration 0091)
// rather than the legacy `videos.is_featured`. v2 (kind='nle') projects
// play live off `timelineSpec` via <CanvasStatePreview/> and have no
// `videos` row until export — sourcing here from projects lets the
// hero surface every featurable canvas regardless of whether it's
// been rendered to MP4. The returned `id` is the project id; the
// frontend's <StudioVideoSurface mode="lazy"/> hits
// `/api/studio/public/:videoId` (already accepts project ids) which
// mounts the SAME player the public /v/:id watch page uses. Toggled
// via PATCH /api/admin/studio/projects/:id/featured.
studioRoutes.get("/videos/featured", async (c) => {
  const db = getDb();
  const rows = await db
    .select({
      id: studioProjects.id,
      videoId: studioProjects.videoId,
      storyboard: studioProjects.storyboard,
      // mediaKind + parallel state cols — the hero spotlight on the
      // homepage now dispatches via <ProjectPlayer/> so a Photoshop
      // drawing / memory-match game / animation in the SA-featured
      // set plays its own runtime instead of the legacy video-only
      // surface (#1215).
      mediaKind: studioProjects.mediaKind,
      timelineSpec: studioProjects.timelineSpec,
      gameState: studioProjects.gameState,
      imageState: studioProjects.imageState,
      animationState: studioProjects.animationState,
      cadState: studioProjects.cadState,
      comicState: studioProjects.comicState,
      createdAt: studioProjects.createdAt,
      updatedAt: studioProjects.updatedAt,
      // LEFT-joined optional baked video. Thumbnails + MP4 URL flow
      // when present; the live canvas branch always works regardless.
      videoTitle: videos.title,
      youtubeUrl: videos.youtubeUrl,
      youtubeVideoId: videos.youtubeVideoId,
      r2Key: videos.r2Key,
      thumbnailUrl: videos.thumbnailUrl,
      description: videos.description,
      ownerName: users.name,
      resumeId: videos.resumeId,
    })
    .from(studioProjects)
    .innerJoin(users, eq(studioProjects.userId, users.id))
    .leftJoin(videos, eq(videos.id, studioProjects.videoId))
    .where(and(eq(studioProjects.isFeatured, true), publicStudioProjectWhere()))
    .orderBy(desc(studioProjects.updatedAt))
    .limit(20);

  return c.json(ok(rows.map((r) => {
    const meta = r.storyboard as { _name?: string } | null;
    return {
      // Project id — public watch endpoint resolves either project or
      // video id, so the lazy surface hydrates either way.
      id: r.id,
      title: meta?._name ?? r.videoTitle ?? `${r.ownerName ?? "Hired.video"} Video`,
      videoUrl: r.youtubeUrl ?? (r.r2Key ? cdnUrl(r.r2Key) : null),
      youtubeUrl: r.youtubeUrl,
      youtubeVideoId: r.youtubeVideoId,
      thumbnailUrl: r.thumbnailUrl,
      description: r.description,
      isFeatured: true,
      // mediaKind + state-column fan-out (#1215).
      mediaKind: (r.mediaKind as string | null) ?? "video",
      timelineSpec: r.timelineSpec ?? null,
      gameState: r.gameState ?? null,
      imageState: r.imageState ?? null,
      animationState: r.animationState ?? null,
      cadState: r.cadState ?? null,
      comicState: r.comicState ?? null,
      ownerName: r.ownerName,
      resumeId: r.resumeId,
      createdAt: asIso(r.createdAt),
    };
  })));
});

// ─── GET /public/:videoId ──────────────────────────────────────────────────────
// Returns public metadata for a single video. No auth required.
// Accepts a UUID (videos.id), a YouTube-style ID (videos.youtubeVideoId),
// or a vanity slug stored on the project (studioProjects.slug).
// Served through getPublicWatchCached (video id + per-alias version token);
// save-draft / publish / NLE PATCH / visibility / render / campaign edits bump it.
studioRoutes.get("/public/:videoId", async (c) => {
  const { videoId } = c.req.param();
  const result = await getPublicWatchCached(videoId, async () => {
  const db = getDb();

  // The :videoId param can be any of:
  //   - videos.id (UUID)
  //   - videos.youtubeVideoId (string)
  //   - studioProjects.id (UUID — what the studio "Copy URL" button uses)
  //   - studioProjects.slug (kebab-case vanity slug — used by the
  //     V2 save menu's share link; migration 0141 promoted this from
  //     storyboard._slug to a real indexed column)
  //
  // Resolution order: try project-by-UUID first when the param looks
  // like one, then project-by-slug when it doesn't, then fall through
  // to the existing video lookup. The project lookups also tell us
  // whether to return a "pending" payload (project exists but no
  // rendered video yet) instead of a flat 404 when someone visits a
  // shared link before the owner finished rendering.
  const videoIdIsUuid = isUuid(videoId);
  let resolvedVideoId: string | null = null;
  const projectSelect = {
    id: studioProjects.id,
    videoId: studioProjects.videoId,
    isPublic: studioProjects.isPublic,
    status: studioProjects.status,
    kind: studioProjects.kind,
    // Output-axis discriminator (#894) — drives the public watch page's
    // surface dispatch (ProjectPlayer). Without this in the payload the
    // /v/<id> page fell through to "Video is being processed" for every
    // non-video kind (image / game / animation / cad) because the
    // dispatcher had no signal to branch on. Default 'video' applies
    // server-side for pre-0099 rows.
    mediaKind: studioProjects.mediaKind,
    // Title + SEO meta aren't columns — toProjectDto reads them from the
    // storyboard JSONB (set by save-draft). On a project saved by the
    // deleted V1 editor the storyboard is also its VideoScript, served as
    // `legacyScript` (meta stripped) for read-time conversion (#721).
    storyboard: studioProjects.storyboard,
    // The authoritative V2 playback state (Timeline JSON). The watch page
    // hydrates it via timelineToCanvasState → <CanvasStatePreview/>.
    timelineSpec: studioProjects.timelineSpec,
    // Parallel-column state for non-Timeline canvas runtimes. Each kind
    // owns its own JSONB column per the canvas-runtime extensibility
    // model (PRD §1.2). ProjectPlayer reads these to mount GameStage /
    // first-layer image / first-frame animation on the public watch
    // page so a Photoshop drawing or memory-match game renders the
    // same pixels here that the editor shows.
    gameState: studioProjects.gameState,
    imageState: studioProjects.imageState,
    animationState: studioProjects.animationState,
    cadState: studioProjects.cadState,
    // Comic column included for parallel-column parity (#1217).
    comicState: studioProjects.comicState,
    ownerName: users.name,
    ownerAvatar: userProfiles.avatarUrl,
  };
  type ProjectRow = {
    id: string;
    videoId: string | null;
    isPublic: boolean;
    status: string | null;
    kind: string | null;
    mediaKind: string | null;
    storyboard: unknown;
    timelineSpec: unknown;
    gameState: unknown;
    imageState: unknown;
    animationState: unknown;
    cadState: unknown;
    comicState: unknown;
    ownerName: string | null;
    ownerAvatar: string | null;
  };
  // Pulls the JSONB-stored meta fields out of a project row in one place
  // so the UUID and slug lookups can't drift on which fields they expose.
  const toProjectInfo = (proj: ProjectRow) => {
    const meta = proj.storyboard as Record<string, unknown> | null;
    return {
      id: proj.id,
      isPublic: proj.isPublic,
      // Published = live by link (the profile post). `isPublic` is the
      // separate public / unlisted listing flag: an unlisted video still
      // plays for anyone with the link.
      published: proj.status === "published",
      title: (meta?._name as string | undefined) ?? null,
      storyboard: proj.storyboard ?? null,
      timelineSpec: proj.timelineSpec ?? null,
      kind: proj.kind ?? null,
      // Default 'video' here mirrors the column default and the DTO
      // fallback in toProjectDto — pre-0099 rows surface as video.
      mediaKind: (proj.mediaKind as string | null) ?? "video",
      gameState: proj.gameState ?? null,
      imageState: proj.imageState ?? null,
      animationState: proj.animationState ?? null,
      cadState: proj.cadState ?? null,
      comicState: proj.comicState ?? null,
      ownerName: proj.ownerName,
      ownerAvatar: proj.ownerAvatar,
      metaDescription: (meta?._metaDescription as string | undefined) ?? null,
      keywords: Array.isArray(meta?._keywords) ? (meta!._keywords as string[]) : [],
      socialCardImage: (meta?._socialCardImage as string | undefined) ?? null,
    };
  };
  // Project-side info, populated when the param resolves to a studio
  // project (by UUID or vanity slug). Carries the project-level visibility
  // and the saved playback state so the public payload plays live through
  // <CanvasStatePreview/> — no MP4 render required (#666, #721).
  let projectInfo: ReturnType<typeof toProjectInfo> | null = null;
  if (videoIdIsUuid) {
    const [proj] = await db
      .select(projectSelect)
      .from(studioProjects)
      .innerJoin(users, eq(studioProjects.userId, users.id))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(studioProjects.id, videoId))
      .limit(1);
    if (proj) {
      if (proj.videoId) resolvedVideoId = proj.videoId;
      projectInfo = toProjectInfo(proj);
    }
  } else if (isValidSlug(videoId)) {
    // Looks like a kebab-case slug — match against the indexed `slug`
    // column (migration 0141). The validator regex on save-draft
    // enforces this exact shape, so anything matching it is a plausible
    // slug; anything not is treated as a YouTube ID by the fall-through.
    const [proj] = await db
      .select(projectSelect)
      .from(studioProjects)
      .innerJoin(users, eq(studioProjects.userId, users.id))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(studioProjects.slug, videoId))
      .limit(1);
    if (proj) {
      if (proj.videoId) resolvedVideoId = proj.videoId;
      projectInfo = toProjectInfo(proj);
    }
  }
  const condition = resolvedVideoId
    ? eq(videos.id, resolvedVideoId)
    : videoIdIsUuid
      ? or(eq(videos.id, videoId), eq(videos.youtubeVideoId, videoId))
      : eq(videos.youtubeVideoId, videoId);

  const rows = await db
    .select({
      id: videos.id,
      title: videos.title,
      description: videos.description,
      youtubeUrl: videos.youtubeUrl,
      youtubeVideoId: videos.youtubeVideoId,
      r2Key: videos.r2Key,
      thumbnailUrl: videos.thumbnailUrl,
      privacyStatus: videos.privacyStatus,
      createdAt: videos.createdAt,
      // Stored VideoScript — used to extract aspect + resolution for the
      // public player's frame so a 9:16 vertical doesn't get letterboxed
      // into a 16:9 box.
      storyboard: videos.storyboard,
      ownerName: users.name,
      ownerAvatar: userProfiles.avatarUrl,
      resumeId: videos.resumeId,
    })
    .from(videos)
    .innerJoin(users, eq(videos.userId, users.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(condition)
    .limit(1);

  // No video AND no project → genuine 404.
  if (!rows.length && !projectInfo) {
    return { status: 404 as const, body: fail("NOT_FOUND", "Video not found") };
  }

  const v = rows[0];
  // Public-visibility gate. After the Save/Publish split (#665, #667) a
  // project's own `isPublic` flag is the authoritative answer for the
  // in-platform watch page — <CanvasStatePreview/> plays the saved
  // canvas live, so a render isn't required. Fall back to
  // `videos.privacy_status` only when there's no project row (legacy
  // direct uploads with no storyboard).
  const isViewable = projectInfo ? projectInfo.isPublic || projectInfo.published : v?.privacyStatus === "public";
  if (!isViewable) {
    const ownerName = projectInfo?.ownerName ?? v?.ownerName ?? null;
    const ownerAvatar = projectInfo?.ownerAvatar ?? v?.ownerAvatar ?? null;
    return { status: 200 as const, body: ok({
      pending: true as const,
      // Lets the watch page offer the OWNER "Publish" / "Edit" in place of a
      // dead end — it checks ownership with the authed project read, which
      // 404s everyone else. Null for a legacy direct upload (no project).
      id: projectInfo?.id ?? null,
      title: projectInfo?.title || v?.title || "Video in progress",
      ownerName,
      ownerAvatar,
    }) };
  }

  // Prefer R2 CDN URL; only use YouTube URL if it's a real YouTube video.
  // All `v.*` reads are nullable because a saved-public-unrendered project
  // takes the ready branch without a `videos` row — the watch page
  // plays its saved canvas live instead of a baked MP4.
  const isFakeYoutube = v?.youtubeVideoId?.startsWith("yt_") ?? false;
  const realYoutubeUrl = isFakeYoutube ? null : (v?.youtubeUrl ?? null);
  const realYoutubeId = isFakeYoutube ? null : (v?.youtubeVideoId ?? null);
  const videoUrl = realYoutubeUrl ?? (v?.r2Key ? cdnUrl(v.r2Key) : null);

  // Pull aspect / resolution from the saved storyboard so the public
  // player can size its frame correctly. The script persists `aspect` as
  // "W:H" and `resolution` as "720p" / "1080p" / "4k" — both come along
  // for the ride; the client picks whatever it can handle. Prefer the
  // project's storyboard (always current) over the video row's snapshot
  // (frozen at render time).
  const storyboardForPlayback = projectInfo?.storyboard ?? v?.storyboard ?? null;
  const scriptForMeta = storyboardForPlayback as
    | { video?: { aspect?: string; resolution?: string } }
    | null;
  const aspect = scriptForMeta?.video?.aspect ?? null;
  const resolution = scriptForMeta?.video?.resolution ?? null;

  // CTA hot-zones — extracted from the source project's Timeline so the
  // public player can overlay clickable anchors on top of the baked
  // MP4. Best-effort: a video without a backing project (legacy /
  // external upload) just returns an empty array. The Timeline lives on
  // `studio_projects.timeline_spec`; one query, no recursive joins.
  let ctaHotzones: ReturnType<typeof extractCtaHotzones> = [];
  try {
    let timelineSpec: unknown = null;
    let hotzoneProjectId: string | null = null;
    if (projectInfo) {
      const [proj] = await db
        .select({ id: studioProjects.id, timelineSpec: studioProjects.timelineSpec })
        .from(studioProjects)
        .where(eq(studioProjects.id, projectInfo.id))
        .limit(1);
      timelineSpec = proj?.timelineSpec ?? null;
      hotzoneProjectId = proj?.id ?? null;
    } else if (v) {
      const [proj] = await db
        .select({ id: studioProjects.id, timelineSpec: studioProjects.timelineSpec })
        .from(studioProjects)
        .where(eq(studioProjects.videoId, v.id))
        .limit(1);
      timelineSpec = proj?.timelineSpec ?? null;
      hotzoneProjectId = proj?.id ?? null;
    }
    if (timelineSpec) {
      ctaHotzones = extractCtaHotzones(timelineSpec as Timeline);
    }
    // Campaign UTMs (#1138) ride on the links viewers actually click: the
    // player's hot-zones. Same campaign rule as the export bake.
    if (ctaHotzones.length > 0 && hotzoneProjectId) {
      ctaHotzones = bakeCampaignUtmIntoHotzones(ctaHotzones, await findProjectCampaignUtm(hotzoneProjectId));
    }
  } catch {
    // Malformed timeline / missing column / future schema drift — return
    // no hot-zones rather than failing the whole public payload.
  }

  // Owner + title prefer the live project row (always current) and fall
  // back to the snapshot on the video row for legacy direct uploads.
  const ownerName = projectInfo?.ownerName ?? v?.ownerName ?? null;
  const ownerAvatar = projectInfo?.ownerAvatar ?? v?.ownerAvatar ?? null;
  const title = projectInfo?.title || v?.title || `${ownerName ?? "Owner"}'s Video Resume`;

  return { status: 200 as const, body: ok({
    pending: false as const,
    id: projectInfo?.id ?? v!.id,
    title,
    description: v?.description ?? null,
    videoUrl,
    youtubeUrl: realYoutubeUrl,
    youtubeVideoId: realYoutubeId,
    thumbnailUrl: v?.thumbnailUrl ?? null,
    ownerName,
    ownerAvatar,
    resumeId: v?.resumeId ?? null,
    // V2 playback state (#721): the Timeline JSON the editor saved. The
    // watch page hydrates it via timelineToCanvasState and mounts
    // <CanvasStatePreview/> — the same renderer as the editor preview.
    timelineSpec: projectInfo?.timelineSpec ?? null,
    // Read-time adapter input for projects saved by the deleted V1 editor
    // (no timeline, scenes in the storyboard JSONB). Null for V2 rows; the
    // client converts it with the editor's own V1 importer. Save-draft meta
    // (prompt, job description, …) is stripped — see public-video-state.ts.
    legacyScript: legacyScriptForPublic(storyboardForPlayback),
    kind: projectInfo?.kind ?? null,
    // Output-axis discriminator + per-runtime state. ProjectPlayer on
    // the watch page reads these to mount the right surface — image
    // pixels, GameStage, AnimationStage first-frame — instead of the
    // legacy video-only StudioVideoSurface fallback that emitted
    // "Video is being processed" for every non-video kind. Legacy
    // direct uploads with no project row default to 'video' so they
    // still take the baked-MP4 path.
    mediaKind: projectInfo?.mediaKind ?? "video",
    gameState: projectInfo?.gameState ?? null,
    imageState: projectInfo?.imageState ?? null,
    animationState: projectInfo?.animationState ?? null,
    cadState: projectInfo?.cadState ?? null,
    comicState: projectInfo?.comicState ?? null,
    aspect,
    resolution,
    ctaHotzones,
    // SEO meta authored in the project Details drawer (Meta tab). The
    // public watch page overlays these onto the og:/twitter:/keywords
    // tags so the share preview reflects what the owner typed, not the
    // raw video.title/description fallback chain. Null/empty means
    // "fall back to defaults" — the client decides the precedence.
    metaDescription: projectInfo?.metaDescription ?? null,
    keywords: projectInfo?.keywords ?? [],
    socialCardImage: projectInfo?.socialCardImage ?? null,
    createdAt: asIso(v?.createdAt ?? new Date()),
  }) };
  // Never cache "pending": the owner publishes from that very page and
  // refetches at once — a cached placeholder would hide the publish.
  }, (r) => !(r.body as { data?: { pending?: boolean } }).data?.pending);
  return c.json(result.body, result.status);
});

// ─── Brand Kit CRUD ──────────────────────────────────────────────────────────
// GET    /api/studio/brand-kits          — list user's brand kits
// POST   /api/studio/brand-kits          — create brand kit
// PATCH  /api/studio/brand-kits/:id      — update brand kit
// DELETE /api/studio/brand-kits/:id      — delete brand kit

const BrandKitSchema = z.object({
  name:           z.string().min(1).max(100).default("My Brand"),
  logoUrl:        z.string().url().optional().or(z.literal("")),
  primaryColor:   z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2563eb"),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0f172a"),
  accentColor:    z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#14b8a6"),
  fontFamily:     z.string().max(100).default("Inter"),
  isDefault:      z.boolean().default(false),
});

studioRoutes.get("/brand-kits", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const restrictToWorkspace = parseWorkspaceQueryParam(c.req.query("workspace"));
  const { companyIds, delegatedSubjectUserIds } = await listAccessibleWorkspaces(userId);
  const ownership = buildOwnershipFilter({
    userIdColumn: studioBrandKits.userId,
    companyIdColumn: studioBrandKits.companyId,
    actorUserId: userId,
    companyIds,
    delegatedSubjectUserIds,
    restrictToWorkspace,
  });
  const kits = await db
    .select()
    .from(studioBrandKits)
    .where(ownership)
    .orderBy(desc(studioBrandKits.createdAt));
  return c.json(ok(kits));
});

studioRoutes.post("/brand-kits", requirePro("Brand Kits"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => null);
  const parsed = BrandKitSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  let target;
  try {
    target = await resolveWorkspaceFromBody(userId, body);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) return c.json(fail("FORBIDDEN", e.message), 403);
    throw e;
  }
  const db = getDb();
  // If isDefault, clear existing defaults — scoped to the target workspace
  // so a company default doesn't blank a personal default and vice versa.
  if (parsed.data.isDefault) {
    const scope = target.ownerCompanyId
      ? eq(studioBrandKits.companyId, target.ownerCompanyId)
      : and(eq(studioBrandKits.userId, target.ownerUserId), isNull(studioBrandKits.companyId));
    await db.update(studioBrandKits).set({ isDefault: false } as any).where(scope);
  }
  const [kit] = await db
    .insert(studioBrandKits)
    .values({
      ...parsed.data,
      userId: target.ownerUserId,
      companyId: target.ownerCompanyId,
      logoUrl: parsed.data.logoUrl || null,
    } as any)
    .returning();
  return c.json(ok(kit), 201);
});

studioRoutes.patch("/brand-kits/:id", requirePro("Brand Kits"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  const db = getDb();
  const [existing] = await db
    .select({ userId: studioBrandKits.userId, companyId: studioBrandKits.companyId })
    .from(studioBrandKits)
    .where(eq(studioBrandKits.id, c.req.param("id")))
    .limit(1);
  if (!existing) return c.json(fail("NOT_FOUND", "Brand kit not found"), 404);
  try {
    await assertCanWrite(userId, existing.userId, existing.companyId ?? null);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) return c.json(fail("FORBIDDEN", e.message), 403);
    throw e;
  }
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === "string") updates.name = body.name;
  if (typeof body.logoUrl === "string") updates.logoUrl = body.logoUrl || null;
  if (typeof body.primaryColor === "string") updates.primaryColor = body.primaryColor;
  if (typeof body.secondaryColor === "string") updates.secondaryColor = body.secondaryColor;
  if (typeof body.accentColor === "string") updates.accentColor = body.accentColor;
  if (typeof body.fontFamily === "string") updates.fontFamily = body.fontFamily;
  if (typeof body.isDefault === "boolean") {
    if (body.isDefault) {
      // Clear other defaults in the same workspace scope as this kit.
      const scope = existing.companyId
        ? eq(studioBrandKits.companyId, existing.companyId)
        : and(eq(studioBrandKits.userId, existing.userId), isNull(studioBrandKits.companyId));
      await db.update(studioBrandKits).set({ isDefault: false } as any).where(scope);
    }
    updates.isDefault = body.isDefault;
  }
  const [updated] = await db
    .update(studioBrandKits)
    .set(updates as any)
    .where(eq(studioBrandKits.id, c.req.param("id")))
    .returning();
  if (!updated) return c.json(fail("NOT_FOUND", "Brand kit not found"), 404);
  return c.json(ok(updated));
});

studioRoutes.delete("/brand-kits/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [existing] = await db
    .select({ userId: studioBrandKits.userId, companyId: studioBrandKits.companyId })
    .from(studioBrandKits)
    .where(eq(studioBrandKits.id, c.req.param("id")))
    .limit(1);
  if (!existing) return c.json(ok({ deleted: false }));
  try {
    await assertCanWrite(userId, existing.userId, existing.companyId ?? null);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) return c.json(fail("FORBIDDEN", e.message), 403);
    throw e;
  }
  await db.delete(studioBrandKits).where(eq(studioBrandKits.id, c.req.param("id")));
  return c.json(ok({ deleted: true }));
});

// ─── Clone project ────────────────────────────────────────────────────────────
// POST /api/studio/projects/:projectId/clone
studioRoutes.post("/projects/:projectId/clone", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  // Load the original by id alone — assertCanWrite handles the auth so
  // company/delegated members can clone projects they didn't originate.
  const [original] = await db
    .select()
    .from(studioProjects)
    .where(eq(studioProjects.id, c.req.param("projectId")))
    .limit(1);
  if (!original) return c.json(fail("NOT_FOUND", "Project not found"), 404);
  try {
    await assertCanWrite(userId, original.userId, original.companyId ?? null);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) return c.json(fail("FORBIDDEN", e.message), 403);
    throw e;
  }
  // The clone may target a different workspace (eg copy a personal video
  // into a company workspace). Body `workspace` overrides the source.
  const body = await c.req.json().catch(() => ({}));
  let target;
  try {
    target = await resolveWorkspaceFromBody(userId, body);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) return c.json(fail("FORBIDDEN", e.message), 403);
    throw e;
  }
  // No explicit selection? Inherit the source's ownership.
  const ownerCompanyId = body?.workspace ? target.ownerCompanyId : original.companyId;
  // Embed a "copy" suffix in the storyboard name metadata
  const meta = (original.storyboard as Record<string, unknown> | null) ?? {};
  const clonedStoryboard = { ...meta, _name: `${meta._name ?? "Project"} (Copy)` };
  const [clone] = await db
    .insert(studioProjects)
    .values({
      userId: target.ownerUserId,
      companyId: ownerCompanyId ?? null,
      resumeText: original.resumeText,
      resumeId: null,
      storyboard: clonedStoryboard as any,
      status: "draft",
    } as any)
    .returning();
  return c.json(ok(toProjectDto(clone)), 201);
});

// ─── Project analytics ────────────────────────────────────────────────────────
// POST /api/studio/projects/:projectId/view       — record a view (public, no auth)
// POST /api/studio/projects/:projectId/cta-click  — record a CTA click
// GET  /api/studio/projects/:projectId/analytics  — owner analytics summary
//
// Keyed on the project (not the rendered video) post-#665. See migration 0085.

studioRoutes.post("/projects/:projectId/view", async (c) => {
  const studioProjectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => ({}));
  const db = getDb();
  await db.insert(videoAnalytics).values({
    studioProjectId,
    userId: c.var.user?.sub ?? null,
    event: "view",
    referrer: typeof body.referrer === "string" ? body.referrer.slice(0, 500) : null,
    campaignId: typeof body.campaignId === "string" ? body.campaignId : null,
    metadata: body.metadata ?? null,
  } as any);
  return c.json(ok({ tracked: true }), 202);
});

studioRoutes.post("/projects/:projectId/cta-click", async (c) => {
  const studioProjectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => ({}));
  const db = getDb();
  await db.insert(videoAnalytics).values({
    studioProjectId,
    userId: c.var.user?.sub ?? null,
    event: "cta_click",
    referrer: typeof body.referrer === "string" ? body.referrer.slice(0, 500) : null,
    campaignId: typeof body.campaignId === "string" ? body.campaignId : null,
    metadata: body.metadata ?? null,
  } as any);
  return c.json(ok({ tracked: true }), 202);
});

// Pro-gated via the shared `requireVideoAnalytics` middleware (paired with
// `studio-features.ts /analytics/projects/:projectId`). Returns CTA clicks
// + share counts + CTR. Free users get basic view counts via
// /api/studio/projects.
studioRoutes.get("/projects/:projectId/analytics", requireVideoAnalytics, async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  const projectId = c.req.param("projectId");
  const db = getDb();
  // Verify ownership against studio_projects (project-level visibility post-#665
  // means there may be no `videos` row to gate against). Workspace/company
  // ownership is checked the same way the project list query does it.
  const [project] = await db
    .select({ id: studioProjects.id })
    .from(studioProjects)
    .where(and(eq(studioProjects.id, projectId), eq(studioProjects.userId, userId)))
    .limit(1);
  if (!project) return c.json(fail("NOT_FOUND", "Project not found"), 404);
  const rows = await db
    .select({ event: videoAnalytics.event, total: count() })
    .from(videoAnalytics)
    .where(eq(videoAnalytics.studioProjectId, projectId))
    .groupBy(videoAnalytics.event);
  const stats = Object.fromEntries(rows.map((r) => [r.event, Number(r.total)]));
  return c.json(ok({
    projectId,
    views: stats["view"] ?? 0,
    ctaClicks: stats["cta_click"] ?? 0,
    shares: stats["share"] ?? 0,
    clickThroughRate: stats["view"] ? Math.round(((stats["cta_click"] ?? 0) / stats["view"]) * 100) / 100 : 0,
  }));
});

// ─── Embed code ───────────────────────────────────────────────────────────────
// GET /api/studio/videos/:videoId/embed — returns HTML embed snippet
studioRoutes.get("/videos/:videoId/embed", async (c) => {
  const videoId = c.req.param("videoId");
  const db = getDb();
  const [vid] = await db
    .select({ id: videos.id, title: videos.title, youtubeVideoId: videos.youtubeVideoId, r2Key: videos.r2Key, privacyStatus: videos.privacyStatus })
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);
  if (!vid || vid.privacyStatus !== "public") return c.json(fail("NOT_FOUND", "Video not found or not public"), 404);
  const videoUrl = vid.youtubeVideoId
    ? `https://www.youtube.com/embed/${vid.youtubeVideoId}`
    : vid.r2Key
    ? cdnUrl(vid.r2Key)
    : null;
  if (!videoUrl) return c.json(fail("NOT_AVAILABLE", "Video not yet available for embed"), 404);
  const title = vid.title ?? "Video";
  const width = Number(c.req.query("width") ?? 640);
  const height = Number(c.req.query("height") ?? 360);
  const embedHtml = `<iframe width="${width}" height="${height}" src="${videoUrl}" title="${title.replace(/"/g, "&quot;")}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  const shareUrl = `https://hired.video/video/${videoId}`;
  return c.json(ok({ embedHtml, shareUrl, videoUrl, width, height }));
});

// ─── Campaign management ──────────────────────────────────────────────────────
// GET    /api/studio/campaigns           — list my campaigns
// POST   /api/studio/campaigns           — create campaign
// PATCH  /api/studio/campaigns/:id       — update campaign
// DELETE /api/studio/campaigns/:id       — delete campaign
// GET    /api/studio/campaigns/:id/stats — rollup analytics for campaign

const CampaignSchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  utmSource:   z.string().max(100).optional(),
  utmMedium:   z.string().max(100).optional(),
  utmCampaign: z.string().max(100).optional(),
  projectIds:  z.array(UuidLikeSchema).default([]),
});

/**
 * Project membership now lives in the `video_campaign_projects` junction
 * (gap #983, migration 0462) rather than a jsonb array on `video_campaigns`.
 * These helpers keep that detail behind the campaign routes so the DTO still
 * exposes a flat `projectIds: string[]` (the frontend contract is unchanged).
 */

/** Bulk-load ordered project ids for many campaigns in ONE query (no N+1). */
async function loadCampaignProjectIds(
  db: ReturnType<typeof getDb>,
  campaignIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (campaignIds.length === 0) return map;
  const rows = await db
    .select({
      campaignId: videoCampaignProjects.campaignId,
      projectId: videoCampaignProjects.projectId,
    })
    .from(videoCampaignProjects)
    .where(inArray(videoCampaignProjects.campaignId, campaignIds))
    .orderBy(asc(videoCampaignProjects.campaignId), asc(videoCampaignProjects.position));
  for (const r of rows) {
    const list = map.get(r.campaignId) ?? [];
    list.push(r.projectId);
    map.set(r.campaignId, list);
  }
  return map;
}

/**
 * Replace a campaign's project membership with `projectIds` (ordered).
 * Idempotent: clears existing rows, then inserts the new set. Dangling ids
 * (no matching studio_projects row) are filtered out so the FK can't fail —
 * mirrors the legacy behaviour where the jsonb array could carry stale ids
 * harmlessly. Runs inside the caller's request; one delete + one insert.
 */
async function setCampaignProjects(
  db: ReturnType<typeof getDb>,
  campaignId: string,
  projectIds: string[],
): Promise<void> {
  const previousRows = await db
    .select({ projectId: videoCampaignProjects.projectId })
    .from(videoCampaignProjects)
    .where(eq(videoCampaignProjects.campaignId, campaignId));
  await db.delete(videoCampaignProjects).where(eq(videoCampaignProjects.campaignId, campaignId));
  const unique = Array.from(new Set(projectIds));
  if (unique.length === 0) {
    bumpPublicWatchCache(...previousRows.map((r) => r.projectId));
    return;
  }
  const existing = await db
    .select({ id: studioProjects.id })
    .from(studioProjects)
    .where(inArray(studioProjects.id, unique));
  const valid = new Set(existing.map((r) => r.id));
  const rows = unique
    .filter((id) => valid.has(id))
    .map((projectId, position) => ({ campaignId, projectId, position }));
  if (rows.length === 0) {
    bumpPublicWatchCache(...previousRows.map((r) => r.projectId));
    return;
  }
  await db.insert(videoCampaignProjects).values(rows);
  bumpPublicWatchCache(...previousRows.map((r) => r.projectId), ...rows.map((r) => r.projectId));
}

/** Shape the campaign DTO with its hydrated `projectIds` (junction-backed). */
function toCampaignDto<T extends { id: string }>(campaign: T, projectIds: string[]) {
  return { ...campaign, projectIds };
}

studioRoutes.get("/campaigns", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const restrictToWorkspace = parseWorkspaceQueryParam(c.req.query("workspace"));
  const { companyIds, delegatedSubjectUserIds } = await listAccessibleWorkspaces(userId);
  const ownership = buildOwnershipFilter({
    userIdColumn: videoCampaigns.userId,
    companyIdColumn: videoCampaigns.companyId,
    actorUserId: userId,
    companyIds,
    delegatedSubjectUserIds,
    restrictToWorkspace,
  });
  const campaigns = await db
    .select()
    .from(videoCampaigns)
    .where(and(ownership, sql`${videoCampaigns.status} != 'archived'`))
    .orderBy(desc(videoCampaigns.createdAt));
  // Bulk-hydrate junction membership so each DTO carries `projectIds` without
  // N+1ing the join table (gap #983).
  const projectIdsByCampaign = await loadCampaignProjectIds(db, campaigns.map((c) => c.id));
  return c.json(ok(campaigns.map((campaign) =>
    toCampaignDto(campaign, projectIdsByCampaign.get(campaign.id) ?? []),
  )));
});

studioRoutes.post("/campaigns", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => null);
  const parsed = CampaignSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  let target;
  try {
    target = await resolveWorkspaceFromBody(userId, body);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) return c.json(fail("FORBIDDEN", e.message), 403);
    throw e;
  }
  const db = getDb();
  const { projectIds, ...campaignFields } = parsed.data;
  const [campaign] = await db
    .insert(videoCampaigns)
    .values({
      ...campaignFields,
      userId: target.ownerUserId,
      companyId: target.ownerCompanyId,
    } as any)
    .returning();
  // Membership lives in the junction (gap #983) — write the ordered set.
  await setCampaignProjects(db, campaign.id, projectIds);
  return c.json(ok(toCampaignDto(campaign, projectIds)), 201);
});

studioRoutes.patch("/campaigns/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  const db = getDb();
  const [existing] = await db
    .select({ userId: videoCampaigns.userId, companyId: videoCampaigns.companyId })
    .from(videoCampaigns)
    .where(eq(videoCampaigns.id, c.req.param("id")))
    .limit(1);
  if (!existing) return c.json(fail("NOT_FOUND", "Campaign not found"), 404);
  try {
    await assertCanWrite(userId, existing.userId, existing.companyId ?? null);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) return c.json(fail("FORBIDDEN", e.message), 403);
    throw e;
  }
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === "string") updates.name = body.name;
  if (typeof body.description === "string") updates.description = body.description;
  if (typeof body.utmSource === "string") updates.utmSource = body.utmSource;
  if (typeof body.utmMedium === "string") updates.utmMedium = body.utmMedium;
  if (typeof body.utmCampaign === "string") updates.utmCampaign = body.utmCampaign;
  if (typeof body.status === "string") updates.status = body.status;
  const campaignId = c.req.param("id");
  // Membership (gap #983) lives in the junction — replace it when provided.
  if (Array.isArray(body.projectIds)) {
    await setCampaignProjects(db, campaignId, body.projectIds as string[]);
  }
  const [updated] = await db
    .update(videoCampaigns)
    .set(updates as any)
    .where(eq(videoCampaigns.id, campaignId))
    .returning();
  if (!updated) return c.json(fail("NOT_FOUND", "Campaign not found"), 404);
  const projectIdsByCampaign = await loadCampaignProjectIds(db, [campaignId]);
  // UTM / status edits bake into public watch hotzones; bump AFTER the
  // campaign row is committed so a concurrent fill cannot recache the old tags.
  bumpPublicWatchCache(...(projectIdsByCampaign.get(campaignId) ?? []));
  return c.json(ok(toCampaignDto(updated, projectIdsByCampaign.get(campaignId) ?? [])));
});

studioRoutes.delete("/campaigns/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [existing] = await db
    .select({ userId: videoCampaigns.userId, companyId: videoCampaigns.companyId })
    .from(videoCampaigns)
    .where(eq(videoCampaigns.id, c.req.param("id")))
    .limit(1);
  if (!existing) return c.json(ok({ archived: false }));
  try {
    await assertCanWrite(userId, existing.userId, existing.companyId ?? null);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) return c.json(fail("FORBIDDEN", e.message), 403);
    throw e;
  }
  const campaignId = c.req.param("id");
  const members = await loadCampaignProjectIds(db, [campaignId]);
  await db
    .update(videoCampaigns)
    .set({ status: "archived", updatedAt: new Date() } as any)
    .where(eq(videoCampaigns.id, campaignId));
  bumpPublicWatchCache(...(members.get(campaignId) ?? []));
  return c.json(ok({ archived: true }));
});

studioRoutes.get("/campaigns/:id/stats", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [campaign] = await db
    .select()
    .from(videoCampaigns)
    .where(eq(videoCampaigns.id, c.req.param("id")))
    .limit(1);
  if (!campaign) return c.json(fail("NOT_FOUND", "Campaign not found"), 404);
  try {
    await assertCanWrite(userId, campaign.userId, campaign.companyId ?? null);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) return c.json(fail("FORBIDDEN", e.message), 403);
    throw e;
  }
  // Membership comes from the junction (gap #983), not a jsonb column.
  const projectIdsByCampaign = await loadCampaignProjectIds(db, [campaign.id]);
  const projectIds = projectIdsByCampaign.get(campaign.id) ?? [];
  if (projectIds.length === 0) return c.json(ok({ views: 0, ctaClicks: 0, shares: 0, projectCount: 0 }));
  const rows = await db
    .select({ event: videoAnalytics.event, total: count() })
    .from(videoAnalytics)
    .where(inArray(videoAnalytics.studioProjectId, projectIds))
    .groupBy(videoAnalytics.event);
  const stats = Object.fromEntries(rows.map((r) => [r.event, Number(r.total)]));
  return c.json(ok({
    campaignId: campaign.id,
    projectCount: projectIds.length,
    views: stats["view"] ?? 0,
    ctaClicks: stats["cta_click"] ?? 0,
    shares: stats["share"] ?? 0,
  }));
});

// ─── Ad-optimised templates (extends the existing template list) ───────────────

interface AdTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tier: AdTemplateTier;
  readonly purpose: string;
  readonly style: { theme: string; color_palette: readonly string[]; font_style: string };
  readonly motion: "minimal" | "moderate" | "cinematic";
  readonly resolution: "720p" | "1080p";
  readonly previewUrl: string | null;
}

const AD_TEMPLATES: readonly AdTemplate[] = [
  {
    id: "job-ad-bold",
    name: "Job Ad — Bold",
    description: "High-contrast job advertisement template with prominent CTA",
    tier: TIER_ID.free,
    purpose: "job_ad",
    style: { theme: "bold", color_palette: ["#1e1b4b", "#7c3aed", "#fbbf24"], font_style: "Poppins" },
    motion: "moderate",
    resolution: "720p",
    previewUrl: null,
  },
  {
    id: "company-promo-clean",
    name: "Company Promo — Clean",
    description: "Professional brand video template for company promotions",
    tier: TIER_ID.free,
    purpose: "company_promo",
    style: { theme: "corporate", color_palette: ["#1e3a5f", "#3b82f6", "#f8fafc"], font_style: "Inter" },
    motion: "minimal",
    resolution: "720p",
    previewUrl: null,
  },
  {
    id: "recruiter-brand-warm",
    name: "Recruiter Brand — Warm",
    description: "Personal brand template designed for recruiters and talent partners",
    tier: TIER_ID.free,
    purpose: "recruiter_brand",
    style: { theme: "warm", color_palette: ["#7c2d12", "#fb923c", "#fef3c7"], font_style: "Nunito" },
    motion: "moderate",
    resolution: "720p",
    previewUrl: null,
  },
  {
    id: "product-launch-neon",
    name: "Product Launch — Neon",
    description: "Energetic neon-accented template for product and feature launches",
    tier: TIER_ID.pro,
    purpose: "product_launch",
    style: { theme: "tech", color_palette: ["#030712", "#22d3ee", "#a3e635"], font_style: "JetBrains Mono" },
    motion: "cinematic",
    resolution: "1080p",
    previewUrl: null,
  },
  {
    id: "testimonial-social",
    name: "Testimonial — Social",
    description: "9:16 vertical format optimised for social-first testimonial ads",
    tier: TIER_ID.pro,
    purpose: "company_promo",
    style: { theme: "social", color_palette: ["#18181b", "#f472b6", "#fbbf24"], font_style: "DM Sans" },
    motion: "cinematic",
    resolution: "1080p",
    previewUrl: null,
  },
];

// Override the templates endpoint to include ad templates
studioRoutes.get("/ad-templates", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  const sub = await getSubscription(userId);
  const purpose = c.req.query("purpose");
  let filtered = AD_TEMPLATES;
  if (purpose) filtered = filtered.filter((t) => t.purpose === purpose);
  const available = sub.isPro ? filtered : filtered.map((t) => ({ ...t, locked: t.tier === TIER_ID.pro }));
  return c.json(ok(available));
});

// ─── POST /edit-script ────────────────────────────────────────────────────────
// AI surgical editing: takes an existing VideoScript + plain-English instruction
// and returns an updated VideoScript with minimal changes.

const EditScriptSchema = z.object({
  script:      VideoScriptSchema,
  instruction: z.string().min(2).max(500),
  // No `model` field — model selection is server-owned via the
  // studio_edit_script use case. SA overrides happen via admin tooling.
});

studioRoutes.post("/edit-script", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = EditScriptSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("INVALID_REQUEST", "Invalid request", parsed.error.flatten()), 400);

  const { script, instruction } = parsed.data;

  const llm = createLLMClient(c.env, c.var.user);
  const systemPrompt = `You are a video script editor. The user has provided a VideoScript JSON and an editing instruction.
Make ONLY the minimal changes needed to fulfil the instruction. Do NOT regenerate the whole script.
Return ONLY valid JSON matching the original VideoScript schema.`;

  try {
    const { data } = await llm.callJson("studio_edit_script", {
      useCase: "studio_edit_script",
      systemPrompt,
      userMessage: `Instruction: ${instruction}\n\nCurrent script:\n${JSON.stringify(script)}`,
    }, VideoScriptSchema);
    return c.json(ok(data));
  } catch {
    // Fall through: return the unchanged script when the LLM call fails.
  }
  return c.json(ok(script));
});
