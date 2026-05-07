import { Hono } from "hono";
import { and, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Env, Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { tokenLedger } from "../domains/billing/token-ledger.js";
import { createLLMClient } from "../services/adapters/llm-client.js";
import { getSubscription } from "../services/billing/BillingService.js";
import { requirePro, requireVideoAnalytics } from "../middleware/tierEnforcement.js";
import { cdnUrl } from "../utils/cdn.js";
import { TIER_COPY, TIER_ID, type AdTemplateTier } from "../../../shared/tier-copy.js";
import { decideStudioQuota } from "../../../shared/studio-quota.js";
import { USER_ROLES } from "../../../shared/user-roles.js";
import { STUDIO_SUBJECT_KINDS } from "../../../shared/studio-subject.js";
import {
  assertCanWrite,
  buildOwnershipFilter,
  listAccessibleWorkspaces,
  resolveWorkspaceForWrite,
  WorkspaceForbiddenError,
  type WorkspaceSelection,
} from "../services/studio/workspace.js";

const { studioProjects, studioProjectSubjects, videos, users, userProfiles, studioBrandKits, videoAnalytics, videoCampaigns } = schema;

/** Body field shape every Studio mutation now accepts. Personal flows
 *  omit the field and continue to behave exactly as before. */
const WorkspaceFieldSchema = z
  .union([
    z.object({ kind: z.literal("personal") }),
    z.object({ kind: z.literal("company"), companyId: z.string().uuid() }),
    z.object({ kind: z.literal("delegated"), subjectUserId: z.string().uuid() }),
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

export const studioRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// All scene types — covers both job-seeker (resume) and advertising use cases
const SCENE_TYPES = [
  "intro", "achievement", "skills", "closing",
  // Advertising / promotional scene types
  "job-details", "company-culture", "cta", "testimonial",
  "product-feature", "brand-story", "requirements", "benefits",
] as const;
type SceneType = typeof SCENE_TYPES[number];

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
  resumeId: z.string().uuid().optional(),
  prompt: z.string().max(500).optional(),
  jobDescription: z.string().max(4000).optional(),
  // No `model` or `temperature` fields on purpose — both are server-owned
  // (sourced from USE_CASE_PROFILES). End users never configure either;
  // SA-only overrides happen via the SuperAdmin admin tooling, not the
  // request body.
  resolution: z.enum(["720p", "1080p"]).optional(),
  motion: z.enum(["minimal", "moderate", "cinematic"]).optional(),
  // Advertising: set purpose to unlock ad-specific scene types + prompts
  purpose: z.enum(["resume", "job_ad", "company_promo", "recruiter_brand", "product_launch", "personal_brand"]).default("resume"),
  // Brand kit to inject into generated script
  brandKitId: z.string().uuid().optional(),
  // CTA for ad use cases
  ctaUrl: z.string().url().optional(),
  ctaText: z.string().max(100).optional(),
});

const PublishVideoSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().default(""),
  privacyStatus: z.enum(["public", "private", "unlisted"]).default("unlisted"),
  resumeId: z.string().uuid().optional(),
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
    purpose: z.enum(["resume", "job_ad", "company_promo", "recruiter_brand", "product_launch", "personal_brand"]).optional(),
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

type StudioPurpose = "resume" | "job_ad" | "company_promo" | "recruiter_brand" | "product_launch" | "personal_brand";

function buildStudioSystemPrompt(
  targetDuration: number,
  motion: string,
  jobDescription?: string,
  purpose: StudioPurpose = "resume",
  ctaUrl?: string,
  ctaText?: string,
): string {
  const ctaBlock = ctaUrl ? `\n- For the "cta" scene: ctaUrl: "${ctaUrl}", ctaText: "${ctaText ?? "Learn More"}"` : "";
  const typeInterface = `"intro"|"achievement"|"skills"|"closing"|"job-details"|"company-culture"|"cta"|"testimonial"|"product-feature"|"brand-story"|"requirements"|"benefits"`;

  const baseInterface = `TypeScript interface:
interface VideoScript {
  video: { duration: number; fps: 30; resolution: "720p"; aspect: "16:9"; purpose: string; theme: { colorPalette: string[]; fontFamily: string; motion: string; transition: string; background: string } }
  scenes: Array<{ id: string; start: number; duration: number; type: ${typeInterface}; title?: string; subtitle?: string; text?: string; items?: string[]; skills?: string[]; ctaUrl?: string; ctaText?: string }>
}`;

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

  // Default: resume
  const jobBlock = jobDescription
    ? `\n\nPersonalise the intro scene for this role. Filter achievements and skills to only those relevant.\nJob Description:\n${jobDescription.slice(0, 3000)}`
    : "";
  return `You are a professional video director and career storyteller. Produce a JSON VideoScript for a ${targetDuration}-second video resume that powerfully showcases this specific candidate.

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

const PREMIUM_TEMPLATES = [
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
    ? [...BASIC_TEMPLATES, ...PREMIUM_TEMPLATES]
    : BASIC_TEMPLATES.map((t) => ({ ...t, lockedCount: PREMIUM_TEMPLATES.length }));

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
  const llm = createLLMClient(c.env, c.var.user);
  const systemPrompt = buildStudioSystemPrompt(targetDuration, motion, jobDescription, purpose, ctaUrl, ctaText);
  const defaultPrompt = purpose === "resume"
    ? "Create a professional video resume"
    : purpose === "job_ad" ? "Create a compelling job advertisement video"
    : purpose === "company_promo" ? "Create an engaging company promotional video"
    : purpose === "recruiter_brand" ? "Create a recruiter personal brand video"
    : "Create a product launch video";

  try {
    const { data } = await llm.callJson("studio_storyboard", {
      useCase: "studio_script",
      systemPrompt,
      userMessage: `${prompt || defaultPrompt}\n\n${resumeText.slice(0, 6000)}`,
    }, VideoScriptSchema);
    script = data;
  } catch (err) {
    console.error("[studio/storyboard] LLM call failed, using mock:", err);
    script = purpose === "resume"
      ? buildMockVideoScript(resumeText, targetDuration, motion)
      : buildMockAdVideoScript(resumeText, targetDuration, motion, purpose, ctaUrl, ctaText);
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

function getS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION ?? "auto",
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY ?? "",
      secretAccessKey: process.env.STORAGE_SECRET_KEY ?? "",
    },
    forcePathStyle: true,
  });
}

function getBucket(): string {
  return process.env.STORAGE_BUCKET ?? "hired.video";
}

function canUseObjectStorage(): boolean {
  return Boolean(process.env.STORAGE_ENDPOINT && process.env.STORAGE_ACCESS_KEY && process.env.STORAGE_SECRET_KEY);
}

/**
 * Get the R2 bucket binding from the Worker environment.
 * This is the correct way to access R2 in Cloudflare Workers — the S3 client
 * path requires separate STORAGE_* env vars that may not be configured.
 */
function getR2Bucket(): R2Bucket | undefined {
  return (globalThis as any).__ENV?.VIDEO_BUCKET;
}

/**
 * Upload a file to R2 using the native binding (preferred) or S3 client (fallback).
 * Returns true if the file was uploaded, false if no storage is available.
 */
async function uploadToStorage(key: string, body: ArrayBuffer, contentType: string, metadata?: Record<string, string>): Promise<boolean> {
  // Preferred: R2 binding (always available in Cloudflare Workers)
  const r2 = getR2Bucket();
  if (r2) {
    await r2.put(key, body, {
      httpMetadata: { contentType },
      customMetadata: metadata,
    });
    return true;
  }

  // Fallback: S3 client (requires STORAGE_* env vars)
  if (canUseObjectStorage()) {
    const s3 = getS3Client();
    await s3.send(new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: Buffer.from(body),
      ContentType: contentType,
      Metadata: metadata,
    }));
    return true;
  }

  console.warn("[studio] No storage available — R2 binding and S3 env vars both missing. File not uploaded:", key);
  return false;
}

function toProjectDto(
  project: typeof studioProjects.$inferSelect,
  linkedVideo?: typeof videos.$inferSelect | null,
  analytics?: { viewCount: number; ctaClickCount: number },
  subjects?: Array<{ kind: string; id: string }>,
) {
  const storyboard = normalizeStoryboard(project.storyboard);
  // Use the _name stored inside the storyboard JSONB (set by save-draft) as the
  // display title so users see their chosen project name, not raw resume text.
  const meta = project.storyboard as Record<string, unknown> | null;
  const savedName = meta?._name as string | undefined;
  const savedPrompt = meta?._prompt as string | undefined;
  const savedJobDescription = meta?._jobDescription as string | undefined;
  const savedPurpose = meta?._purpose as string | undefined;
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
    prompt: savedPrompt ?? null,
    jobDescription: savedJobDescription ?? null,
    resumeText: project.resumeText ?? null,
    viewCount: analytics?.viewCount ?? 0,
    ctaClickCount: analytics?.ctaClickCount ?? 0,
    purpose: savedPurpose ?? (script?.video?.purpose as string | undefined) ?? null,
    isPublic: linkedVideo?.privacyStatus === "public",
    // Many-to-many subject links via studio_project_subjects (migration 0061).
    subjects: subjects ?? [],
    creationDateTime: asIso(project.createdAt),
    updateDateTime: asIso(project.updatedAt),
  };
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

/** Read all subject links for a single project, in stable creation order. */
async function loadProjectSubjects(
  db: ReturnType<typeof getDb>,
  projectId: string,
): Promise<Array<{ kind: string; id: string }>> {
  const rows = await db
    .select({ kind: studioProjectSubjects.subjectKind, id: studioProjectSubjects.subjectId, createdAt: studioProjectSubjects.createdAt })
    .from(studioProjectSubjects)
    .where(eq(studioProjectSubjects.projectId, projectId))
    .orderBy(studioProjectSubjects.createdAt);
  return rows.map((r) => ({ kind: r.kind, id: r.id }));
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
    projectId:      z.string().uuid().optional(),
    prompt:         z.string().max(2000).optional(),
    jobDescription: z.string().max(4000).optional(),
    purpose:        z.enum(["resume", "job_ad", "company_promo", "recruiter_brand", "product_launch", "personal_brand"]).optional(),
    // Polymorphic subject links — many-to-many, so an array. When the
    // field is omitted we leave existing links untouched; when it's
    // explicitly present we replace-all (matches the array semantics
    // most clients want).
    subjects:       z.array(z.object({
      kind: z.enum(STUDIO_SUBJECT_KINDS),
      id:   z.string().min(1).max(200),
    })).optional(),
  }).safeParse(body);

  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }

  const { name, resumeText, script, projectId, prompt, jobDescription, purpose, subjects } = parsed.data;
  // Embed metadata inside the storyboard JSONB so toProjectDto can surface it
  const storyboardValue = script
    ? { ...script, _name: name, _prompt: prompt, _jobDescription: jobDescription, _purpose: purpose }
    : { _name: name, _prompt: prompt, _jobDescription: jobDescription, _purpose: purpose };
  const db = getDb();

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
        resumeText: resumeText || name,
        userId: user.sub, // record the editor for attribution
        ...resumeIdPatch,
      } as any)
      .where(eq(studioProjects.id, projectId))
      .returning();
    if (!updated) return c.json(fail("NOT_FOUND", "Project not found"), 404);
    savedId = updated.id;
  } else {
    const [created] = await db
      .insert(studioProjects)
      .values({
        userId: target.ownerUserId,
        companyId: target.ownerCompanyId,
        resumeText: resumeText || name,
        storyboard: storyboardValue as any,
        status: "draft",
        ...resumeIdPatch,
      } as any)
      .returning();
    savedId = created.id;
  }

  // Replace-all the subjects when the client explicitly supplied the
  // array. Omitting it leaves existing links untouched — matches "I'm
  // saving other fields, don't touch my links" use cases.
  if (subjects !== undefined) {
    await replaceProjectSubjects(db, savedId, subjects);
  }

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
  return c.json(ok(dto), projectId ? 200 : 201);
});

// POST /api/studio/generate-image — AI image generation, used everywhere
// across the app via the shared MediaPicker (not just the studio).
//
// Token metering: runs through `aiCall()`, which gates on the user's token
// budget (free 50K / Pro 1M) before invoking the model and debits a
// synthetic 10K-token charge on success. SDXL-lightning inference is ~$0.0002
// raw; at our $3/M cost basis 10K tokens = $0.03, sitting between the
// autofill (~2K) and resume-roast (~20K) charges and matching margin policy.
//
// Persistence: writes the PNG to R2 and returns a durable CDN URL. The
// previous implementation returned a base64 data URL, which works for the
// studio (storyboard JSON) but blows up DB rows when used as a profile
// avatar / company logo / article cover. CDN URL is the only sane shape
// for a first-class media-picker output.
studioRoutes.post("/generate-image", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const prompt = body?.prompt;
  if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
    return c.json(fail("VALIDATION_ERROR", "prompt is required"), 400);
  }

  const ai = (c.env as any).AI;
  if (!ai) {
    return c.json(fail("AI_UNAVAILABLE", "AI image generation is not configured"), 503);
  }

  const bucket: R2Bucket | undefined =
    (c.env as any).VIDEO_BUCKET ?? (globalThis as any).__ENV?.VIDEO_BUCKET;
  if (!bucket) {
    return c.json(fail("STORAGE_UNAVAILABLE", "Image storage not configured"), 503);
  }

  try {
    // Image generation uses Cloudflare Workers AI directly (not OpenRouter),
    // so it can't go through the standard `LLMClient`. Touch the same two
    // ledger primitives that `LLMClient` calls internally — gate before
    // the model fires, then charge a synthetic 10K-token cost on success.
    await tokenLedger.ensureBudget(c.var.user);

    const response = await ai.run("@cf/bytedance/stable-diffusion-xl-lightning", {
      prompt: prompt.trim().slice(0, 500),
      num_steps: 4,
    });
    const buffer = await new Response(response as ReadableStream).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const key = `uploads/${user.sub}/ai-images/${crypto.randomUUID()}.png`;
    await bucket.put(key, bytes, { httpMetadata: { contentType: "image/png" } });

    await tokenLedger.charge({
      userId: user.sub,
      featureKey: "image_generation",
      usage: {
        promptTokens: 10_000,
        completionTokens: 0,
        totalTokens: 10_000,
        model: "cf-stable-diffusion-xl-lightning",
      },
    }).catch((err) => {
      console.warn("[studio/generate-image] charge failed:", err);
    });

    return c.json(ok({ imageUrl: cdnUrl(key) }));
  } catch (err) {
    console.error("[studio/generate-image] AI error:", err);
    return c.json(fail("GENERATION_FAILED", "Image generation failed"), 500);
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

  // Free-tier video quota — single source of truth in shared/studio-quota.ts
  // so the studio UI can pre-check with the same rule. SuperAdmins bypass.
  // Re-uploads to the same project replace the existing video and don't
  // count against the quota, so we exclude the current project from the
  // published-video count.
  {
    const sub = await getSubscription(user.sub);
    const isSuperAdmin =
      user.isSuperAdmin === true ||
      user.roles?.includes(USER_ROLES.SUPER_ADMIN) === true;

    const owned = await db
      .select({ id: studioProjects.id, videoId: studioProjects.videoId })
      .from(studioProjects)
      .where(eq(studioProjects.userId, user.sub));
    const publishedVideoCount = owned.filter(
      (p) => p.videoId != null && (!maybeProjectId || p.id !== maybeProjectId),
    ).length;

    const decision = decideStudioQuota({
      isPro: sub.isPro,
      isSuperAdmin,
      publishedVideoCount,
    });
    if (!decision.allowed) {
      return c.json(
        fail(
          "QUOTA_EXCEEDED",
          TIER_COPY.freeQuotaExceededForFeature({
            freeAllowance: "publish 1 video",
            feature: "videos",
          }),
        ),
        402,
      );
    }
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
  const uploaded = await uploadToStorage(r2Key, bytes, file.type || "video/webm", {
    userId: user.sub,
    projectId: project.id,
  });
  if (!uploaded) {
    return c.json(fail("STORAGE_UNAVAILABLE", "No storage configured. Cannot save video file."), 503);
  }

  const projectResumeId = maybeResumeId ?? project.resumeId ?? null;

  // If the project already has a video, mark the old r2Key for cleanup and
  // reuse the same videos row so privacyStatus + isPublic settings persist.
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
        .set({ r2Key, status: "Completed", title, resumeId: projectResumeId, updatedAt: new Date() } as any)
        .where(eq(videos.id, existingVideo.id))
        .returning();
      video = updated;
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
        title,
        resumeId: projectResumeId,
      } as any)
      .returning();
    video = created;
  }

  // Mark the project as Published so it shows up on the user's profile.
  // The user can still flip videos.privacyStatus via the Make Public toggle
  // to also expose it on the homepage public feed.
  const [updatedProject] = await db
    .update(studioProjects)
    .set({ status: "published", videoId: video.id, resumeId: projectResumeId, updatedAt: new Date() } as any)
    .where(eq(studioProjects.id, project.id))
    .returning();

  return c.json(ok(toProjectDto(updatedProject, video)), 201);
});

studioRoutes.post("/publish", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = PublishVideoSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [project] = await db
    .select()
    .from(studioProjects)
    .where(eq(studioProjects.id, parsed.data.projectId))
    .limit(1);

  if (!project) {
    return c.json(fail("NOT_FOUND", "Studio project not found"), 404);
  }
  try {
    await assertCanWrite(user.sub, project.userId, project.companyId ?? null);
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) return c.json(fail("FORBIDDEN", e.message), 403);
    throw e;
  }

  let linkedVideo: typeof videos.$inferSelect | null = null;
  if (project.videoId) {
    // Match by id alone — the parent project's ownership was already
    // asserted above, and the published video inherits the project's
    // ownership semantics.
    const [existingVideo] = await db
      .select()
      .from(videos)
      .where(eq(videos.id, project.videoId))
      .limit(1);
    linkedVideo = existingVideo ?? null;
  }

  const publishResumeId = parsed.data.resumeId ?? project.resumeId ?? null;

  if (!linkedVideo) {
    const [createdVideo] = await db
      .insert(videos)
      .values({
        userId: project.userId,         // mirror the project's owner user
        companyId: project.companyId,   // and company (null for personal)
        status: "Completed",
        title: parsed.data.title,
        description: parsed.data.description,
        privacyStatus: parsed.data.privacyStatus,
        resumeId: publishResumeId,
      } as any)
      .returning();
    linkedVideo = createdVideo;
  }

  // Only set YouTube fields if the video was actually uploaded to YouTube.
  // For R2-hosted videos, leave youtubeVideoId/youtubeUrl as-is (null).
  const [updatedVideo] = await db
    .update(videos)
    .set({
      title: parsed.data.title,
      description: parsed.data.description,
      privacyStatus: parsed.data.privacyStatus,
      status: "Completed",
      resumeId: publishResumeId,
      updatedAt: new Date(),
    } as any)
    .where(eq(videos.id, linkedVideo.id))
    .returning();

  const [updatedProject] = await db
    .update(studioProjects)
    .set({
      status: "published",
      videoId: linkedVideo.id,
      resumeId: publishResumeId,
      updatedAt: new Date(),
    } as any)
    .where(eq(studioProjects.id, project.id))
    .returning();

  return c.json(ok(toProjectDto(updatedProject, updatedVideo)));
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
    errorMessage: status === "Failed" ? linkedVideo?.errorMessage ?? "Publishing failed" : null,
  }));
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
  await db.delete(studioProjects).where(eq(studioProjects.id, projectId));
  return c.json(ok({ id: projectId }));
});

// ─── PATCH /projects/:projectId/status ────────────────────────────────────────
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
  const [updated] = await db
    .update(studioProjects)
    .set({ status: parsed.data.status, userId: user.sub, updatedAt: new Date() } as any)
    .where(eq(studioProjects.id, projectId))
    .returning();
  if (!updated) return c.json(fail("NOT_FOUND", "Project not found"), 404);
  return c.json(ok(toProjectDto(updated)));
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

  const privacyStatus = parsed.data.isPublic ? "public" : "unlisted";

  // Update the linked video's privacy status. Match on id alone — the
  // assertCanWrite above already verified the parent project's ownership.
  if (project.videoId) {
    await db
      .update(videos)
      .set({ privacyStatus, isPublic: parsed.data.isPublic, updatedAt: new Date() } as any)
      .where(eq(videos.id, project.videoId));
  }

  const linkedVideo = project.videoId
    ? (await db.select().from(videos).where(eq(videos.id, project.videoId)).limit(1))[0] ?? null
    : null;

  return c.json(ok({
    ...toProjectDto(project, linkedVideo),
    isPublic: parsed.data.isPublic,
  }));
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

  const projects = await db
    .select()
    .from(studioProjects)
    .where(whereClause)
    .orderBy(studioProjects.updatedAt);

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
  const [linkedVideos, analyticsRows] = await Promise.all([
    videoIds.length
      ? db.select().from(videos).where(and(videoOwnershipFilter, inArray(videos.id, videoIds)))
      : Promise.resolve([]),
    videoIds.length
      ? db
          .select({
            videoId: videoAnalytics.videoId,
            viewCount: sql<number>`count(*) filter (where ${videoAnalytics.event} = 'view')::int`,
            ctaClickCount: sql<number>`count(*) filter (where ${videoAnalytics.event} = 'cta_click')::int`,
          })
          .from(videoAnalytics)
          .where(inArray(videoAnalytics.videoId, videoIds))
          .groupBy(videoAnalytics.videoId)
      : Promise.resolve([]),
  ]);

  const videoById = new Map(linkedVideos.map((v) => [v.id, v]));
  const analyticsById = new Map(
    analyticsRows.map((a) => [a.videoId, { viewCount: a.viewCount, ctaClickCount: a.ctaClickCount }]),
  );

  // Bulk-load subjects so each DTO carries its links without N+1ing.
  const subjectsByProject = await loadProjectSubjectsBulk(db, projects.map((p) => p.id));

  return c.json(ok(projects.map((p) => toProjectDto(
    p,
    p.videoId ? videoById.get(p.videoId) ?? null : null,
    p.videoId ? analyticsById.get(p.videoId) : undefined,
    subjectsByProject.get(p.id) ?? [],
  ))));
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

  await db
    .insert(studioProjectSubjects)
    .values({ projectId, subjectKind: parsed.data.kind, subjectId: parsed.data.id } as any)
    .onConflictDoNothing();

  // Keep the legacy `studio_projects.resume_id` denorm in sync for
  // resume-kind links so analytics joins that read it stay consistent.
  if (parsed.data.kind === "resume") {
    await db
      .update(studioProjects)
      .set({ resumeId: parsed.data.id } as any)
      .where(eq(studioProjects.id, projectId));
  }

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

  const subjects = await loadProjectSubjects(db, projectId);
  return c.json(ok({ projectId, subjects }));
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
  const db = getDb();

  // Pre-fetch project ids credited to this user as a contributor. Empty
  // set is fine — the OR in the main query short-circuits.
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

  const rows = await db
    .select({
      id: videos.id,
      title: videos.title,
      youtubeUrl: videos.youtubeUrl,
      youtubeVideoId: videos.youtubeVideoId,
      r2Key: videos.r2Key,
      thumbnailUrl: videos.thumbnailUrl,
      description: videos.description,
      privacyStatus: videos.privacyStatus,
      createdAt: videos.createdAt,
      // Mark portfolio entries so the frontend can label them ("Edited
      // for X") instead of showing the credited user as the subject.
      isCreatorCredit: sql<boolean>`${studioProjects.userId} <> ${userId}`,
    })
    .from(studioProjects)
    .innerJoin(videos, eq(videos.id, studioProjects.videoId))
    .where(and(ownerOrCredit, eq(studioProjects.status, "published")))
    .orderBy(desc(videos.createdAt))
    .limit(20);

  return c.json(ok(rows.map((v) => ({
    id: v.id,
    title: v.title,
    videoUrl: v.youtubeUrl ?? (v.r2Key ? cdnUrl(v.r2Key) : null),
    youtubeUrl: v.youtubeUrl,
    youtubeVideoId: v.youtubeVideoId,
    thumbnailUrl: v.thumbnailUrl,
    description: v.description,
    privacyStatus: v.privacyStatus,
    isCreatorCredit: Boolean(v.isCreatorCredit),
    createdAt: asIso(v.createdAt),
  }))));
});

// ─── GET /videos/resume/:resumeId ─────────────────────────────────────────────
// Returns videos associated with a specific resume.
// Public videos: no auth required. Private/unlisted: only visible to owner.
studioRoutes.get("/videos/resume/:resumeId", async (c) => {
  const resumeId = c.req.param("resumeId");
  const user = c.var.user as { sub: string } | undefined;
  const db = getDb();

  const rows = await db
    .select()
    .from(videos)
    .where(eq(videos.resumeId, resumeId))
    .orderBy(desc(videos.createdAt));

  // Filter based on visibility. Public videos are always visible. Private/
  // unlisted videos are visible to the owner (personal) AND any company /
  // delegated workspace member who would normally have edit access.
  let userCompanyIds: string[] = [];
  let userDelegatedSubjects: string[] = [];
  if (user) {
    const ws = await listAccessibleWorkspaces(user.sub);
    userCompanyIds = ws.companyIds;
    userDelegatedSubjects = ws.delegatedSubjectUserIds;
  }
  const visible = rows.filter((v) => {
    if (v.privacyStatus === "public") return true;
    if (!user) return false;
    if (v.userId === user.sub) return true;
    if (v.companyId && userCompanyIds.includes(v.companyId)) return true;
    if (v.companyId == null && userDelegatedSubjects.includes(v.userId)) return true;
    return false;
  });

  return c.json(ok(visible.map((v) => ({
    id: v.id,
    title: v.title,
    videoUrl: v.youtubeUrl ?? (v.r2Key ? cdnUrl(v.r2Key) : null),
    youtubeUrl: v.youtubeUrl,
    youtubeVideoId: v.youtubeVideoId,
    thumbnailUrl: v.thumbnailUrl,
    privacyStatus: v.privacyStatus,
    status: v.status,
    createdAt: asIso(v.createdAt),
  }))));
});

// ─── GET /videos/public ───────────────────────────────────────────────────────
// Returns the 20 most-recent public videos for the homepage feed.
// No auth required.
studioRoutes.get("/videos/public", async (c) => {
  const db = getDb();

  const rows = await db
    .select({
      id: videos.id,
      title: videos.title,
      youtubeUrl: videos.youtubeUrl,
      youtubeVideoId: videos.youtubeVideoId,
      r2Key: videos.r2Key,
      thumbnailUrl: videos.thumbnailUrl,
      description: videos.description,
      createdAt: videos.createdAt,
      ownerName: users.name,
      resumeId: videos.resumeId,
    })
    .from(videos)
    .innerJoin(users, eq(videos.userId, users.id))
    .where(eq(videos.privacyStatus, "public"))
    .orderBy(desc(videos.createdAt))
    .limit(20);

  return c.json(ok(rows.map((v) => ({
    id: v.id,
    title: v.title || `${v.ownerName}'s Video Resume`,
    videoUrl: v.youtubeUrl ?? (v.r2Key ? cdnUrl(v.r2Key) : null),
    youtubeUrl: v.youtubeUrl,
    youtubeVideoId: v.youtubeVideoId,
    thumbnailUrl: v.thumbnailUrl,
    description: v.description,
    ownerName: v.ownerName,
    resumeId: v.resumeId,
    createdAt: asIso(v.createdAt),
  }))));
});

// ─── GET /public/:videoId ──────────────────────────────────────────────────────
// Returns public metadata for a single video. No auth required.
// Accepts a UUID (videos.id) or a YouTube-style ID (videos.youtubeVideoId).
studioRoutes.get("/public/:videoId", async (c) => {
  const { videoId } = c.req.param();
  const db = getDb();

  // The :videoId param can be any of:
  //   - videos.id (UUID)
  //   - videos.youtubeVideoId (string)
  //   - studioProjects.id (UUID — what the studio "Copy URL" button uses)
  //
  // We resolve studioProjects.id → videos.id first if it matches a project,
  // then fall through to the existing video-id / youtube-id lookup. The
  // project lookup also tells us whether to return a "pending" payload
  // (project exists but no rendered video yet) instead of a flat 404 when
  // someone visits a shared link before the owner finished rendering.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(videoId);
  let resolvedVideoId: string | null = null;
  let pendingProject: {
    title: string | null;
    ownerName: string | null;
    ownerAvatar: string | null;
  } | null = null;
  if (isUuid) {
    const [proj] = await db
      .select({
        videoId: studioProjects.videoId,
        // Title isn't a column — toProjectDto reads it from
        // storyboard._name (set by save-draft). Same trick here.
        storyboard: studioProjects.storyboard,
        ownerName: users.name,
        ownerAvatar: userProfiles.avatarUrl,
      })
      .from(studioProjects)
      .innerJoin(users, eq(studioProjects.userId, users.id))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(studioProjects.id, videoId))
      .limit(1);
    if (proj) {
      if (proj.videoId) {
        resolvedVideoId = proj.videoId;
      }
      const meta = proj.storyboard as { _name?: string } | null;
      pendingProject = {
        title: meta?._name ?? null,
        ownerName: proj.ownerName,
        ownerAvatar: proj.ownerAvatar,
      };
    }
  }
  const condition = resolvedVideoId
    ? eq(videos.id, resolvedVideoId)
    : isUuid
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
  if (!rows.length && !pendingProject) {
    return c.json(fail("NOT_FOUND", "Video not found"), 404);
  }

  // Project exists but never rendered, OR rendered but not yet public →
  // return a 200 "pending" payload so the public page can show "Owner is
  // preparing this video" instead of a generic not-found error.
  const v = rows[0];
  if (!v || v.privacyStatus !== "public") {
    const owner = v ?? pendingProject!;
    return c.json(ok({
      pending: true as const,
      title: pendingProject?.title || v?.title || "Video in progress",
      ownerName: owner.ownerName,
      ownerAvatar: owner.ownerAvatar,
    }));
  }

  // Prefer R2 CDN URL; only use YouTube URL if it's a real YouTube video
  const isFakeYoutube = v.youtubeVideoId?.startsWith("yt_");
  const realYoutubeUrl = isFakeYoutube ? null : v.youtubeUrl;
  const realYoutubeId = isFakeYoutube ? null : v.youtubeVideoId;
  const videoUrl = realYoutubeUrl ?? (v.r2Key ? cdnUrl(v.r2Key) : null);

  // Pull aspect / resolution from the saved storyboard so the public
  // player can size its frame correctly. The script persists `aspect` as
  // "W:H" and `resolution` as "720p" / "1080p" / "4k" — both come along
  // for the ride; the client picks whatever it can handle.
  const storyboardMeta = v.storyboard as { video?: { aspect?: string; resolution?: string } } | null;
  const aspect = storyboardMeta?.video?.aspect ?? null;
  const resolution = storyboardMeta?.video?.resolution ?? null;

  return c.json(ok({
    pending: false as const,
    id: v.id,
    title: v.title || `${v.ownerName}'s Video Resume`,
    description: v.description,
    videoUrl,
    youtubeUrl: realYoutubeUrl,
    youtubeVideoId: realYoutubeId,
    thumbnailUrl: v.thumbnailUrl,
    ownerName: v.ownerName,
    ownerAvatar: v.ownerAvatar,
    resumeId: v.resumeId,
    aspect,
    resolution,
    createdAt: asIso(v.createdAt),
  }));
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

// ─── Video analytics ──────────────────────────────────────────────────────────
// POST /api/studio/videos/:videoId/view       — record a view (public, no auth)
// POST /api/studio/videos/:videoId/cta-click  — record a CTA click
// GET  /api/studio/videos/:videoId/analytics  — owner analytics summary

studioRoutes.post("/videos/:videoId/view", async (c) => {
  const videoId = c.req.param("videoId");
  const body = await c.req.json().catch(() => ({}));
  const db = getDb();
  await db.insert(videoAnalytics).values({
    videoId,
    userId: c.var.user?.sub ?? null,
    event: "view",
    referrer: typeof body.referrer === "string" ? body.referrer.slice(0, 500) : null,
    campaignId: typeof body.campaignId === "string" ? body.campaignId : null,
    metadata: body.metadata ?? null,
  } as any);
  return c.json(ok({ tracked: true }), 202);
});

studioRoutes.post("/videos/:videoId/cta-click", async (c) => {
  const videoId = c.req.param("videoId");
  const body = await c.req.json().catch(() => ({}));
  const db = getDb();
  await db.insert(videoAnalytics).values({
    videoId,
    userId: c.var.user?.sub ?? null,
    event: "cta_click",
    referrer: typeof body.referrer === "string" ? body.referrer.slice(0, 500) : null,
    campaignId: typeof body.campaignId === "string" ? body.campaignId : null,
    metadata: body.metadata ?? null,
  } as any);
  return c.json(ok({ tracked: true }), 202);
});

// Pro-gated via the shared `requireVideoAnalytics` middleware (paired with
// `studio-features.ts /analytics/:videoId`). Returns CTA clicks + share
// counts + CTR. Free users get basic view counts via /api/studio/projects.
studioRoutes.get("/videos/:videoId/analytics", requireVideoAnalytics, async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  const videoId = c.req.param("videoId");
  const db = getDb();
  // Verify ownership
  const [vid] = await db.select({ id: videos.id }).from(videos).where(and(eq(videos.id, videoId), eq(videos.userId, userId))).limit(1);
  if (!vid) return c.json(fail("NOT_FOUND", "Video not found"), 404);
  // Aggregate counts by event type
  const rows = await db
    .select({ event: videoAnalytics.event, total: count() })
    .from(videoAnalytics)
    .where(eq(videoAnalytics.videoId, videoId))
    .groupBy(videoAnalytics.event);
  const stats = Object.fromEntries(rows.map((r) => [r.event, Number(r.total)]));
  return c.json(ok({
    videoId,
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
  videoIds:    z.array(z.string().uuid()).default([]),
});

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
  return c.json(ok(campaigns));
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
  const [campaign] = await db
    .insert(videoCampaigns)
    .values({
      ...parsed.data,
      userId: target.ownerUserId,
      companyId: target.ownerCompanyId,
      videoIds: parsed.data.videoIds,
    } as any)
    .returning();
  return c.json(ok(campaign), 201);
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
  if (Array.isArray(body.videoIds)) updates.videoIds = body.videoIds;
  const [updated] = await db
    .update(videoCampaigns)
    .set(updates as any)
    .where(eq(videoCampaigns.id, c.req.param("id")))
    .returning();
  if (!updated) return c.json(fail("NOT_FOUND", "Campaign not found"), 404);
  return c.json(ok(updated));
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
  await db
    .update(videoCampaigns)
    .set({ status: "archived", updatedAt: new Date() } as any)
    .where(eq(videoCampaigns.id, c.req.param("id")));
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
  const videoIds = (campaign.videoIds as string[]) ?? [];
  if (videoIds.length === 0) return c.json(ok({ views: 0, ctaClicks: 0, shares: 0, videoCount: 0 }));
  const rows = await db
    .select({ event: videoAnalytics.event, total: count() })
    .from(videoAnalytics)
    .where(inArray(videoAnalytics.videoId, videoIds))
    .groupBy(videoAnalytics.event);
  const stats = Object.fromEntries(rows.map((r) => [r.event, Number(r.total)]));
  return c.json(ok({
    campaignId: campaign.id,
    videoCount: videoIds.length,
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
