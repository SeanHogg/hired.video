// Hand-curated demo VideoScripts surfaced on /marketplace/templates/<slug>.
// Each entry is a tiny, fully-valid VideoScript the unified <StudioPlayer/>
// can compile + render directly — no LLM call, no auth, no user data
// needed. The marketplace press-play preview uses these so visitors can
// see what a template actually produces before adopting it.
//
// Per-template themes mirror the colour/mood story of the matching
// `TemplateThumb` mockup so the still card and the playable preview
// feel like the same brand. Durations are kept short (~16–22s) so the
// preview doesn't outlast the visitor's attention span and we don't have
// to schedule a real CDN-hosted audio bed.

import type { ContentTemplate } from "./catalog";
import type {
  SceneScript,
  VideoScript,
  VideoTheme,
} from "@/types/video-script";

// ─── Builder ─────────────────────────────────────────────────────────────────

type SceneSeed = Omit<SceneScript, "id" | "start">;

/** Assigns `id` + `start` to a list of scene seeds and rolls them up into a
 *  complete VideoScript. Single helper so every demo entry stays declarative
 *  (the durations sum to `video.duration` automatically). */
function buildScript(theme: VideoTheme, seeds: SceneSeed[]): VideoScript {
  let cursor = 0;
  const scenes: SceneScript[] = seeds.map((s, i) => {
    const scene: SceneScript = { id: `scene-${i}`, start: cursor, ...s };
    cursor += s.duration;
    return scene;
  });
  return {
    video: {
      duration: cursor,
      fps: 30,
      resolution: "720p",
      aspect: "16:9",
      theme,
    },
    scenes,
  };
}

// ─── Demo VideoScripts ───────────────────────────────────────────────────────

const basic = buildScript(
  {
    colorPalette: ["#475569", "#94a3b8", "#e2e8f0", "#ffffff"],
    fontFamily: "Inter",
    motion: "minimal",
    transition: "fade",
    background: "gradient",
  },
  [
    {
      type: "intro",
      duration: 6,
      title: "One scene, one idea.",
      subtitle: "Type a prompt — get a video.",
      text: "The Basic template skips the multi-scene script and renders exactly what you describe.",
    },
    {
      type: "closing",
      duration: 5,
      title: "Yours in 60 seconds.",
      subtitle: "No editing required.",
    },
  ],
);

const profile = buildScript(
  {
    colorPalette: ["#0f172a", "#7c3aed", "#f97316", "#f8fafc"],
    fontFamily: "Inter",
    motion: "moderate",
    transition: "fade",
    background: "gradient",
  },
  [
    {
      type: "intro",
      duration: 5,
      title: "Alex Rivera",
      subtitle: "Product Designer · San Francisco",
      text: "Designing tools that help people get back time.",
    },
    {
      type: "achievement",
      duration: 6,
      title: "What I do",
      items: [
        "Lead end-to-end product design for B2B SaaS",
        "Ship from research → prototype → production",
        "Pair with PMs + engineers daily",
      ],
    },
    {
      type: "skills",
      duration: 5,
      title: "Services on offer",
      skills: ["Design audits", "0-to-1 prototypes", "Design systems", "Workshops"],
    },
    {
      type: "cta",
      duration: 4,
      title: "Let's build something.",
      subtitle: "alex@rivera.design",
    },
  ],
);

const resume = buildScript(
  {
    colorPalette: ["#0f172a", "#2563eb", "#14b8a6", "#f8fafc"],
    fontFamily: "Inter",
    motion: "moderate",
    transition: "fade",
    background: "gradient",
  },
  [
    {
      type: "intro",
      duration: 5,
      title: "Jordan Park",
      subtitle: "Senior Backend Engineer",
      text: "Eight years building distributed systems at scale.",
    },
    {
      type: "achievement",
      duration: 6,
      title: "Career highlights",
      items: [
        "Took payments throughput from 800/s → 14k/s",
        "Led migration off monolith for 60-engineer team",
        "Cut p99 latency 38% on the auth service",
      ],
    },
    {
      type: "skills",
      duration: 5,
      title: "Core stack",
      skills: ["Go", "Postgres", "Kafka", "Kubernetes", "gRPC", "Observability"],
    },
    {
      type: "closing",
      duration: 4,
      title: "Open to roles.",
      subtitle: "Staff / Principal · remote-first",
    },
  ],
);

const personal_brand = buildScript(
  {
    colorPalette: ["#1e1b4b", "#f43f5e", "#fbbf24", "#fafafa"],
    fontFamily: "Inter",
    motion: "cinematic",
    transition: "cinematic-fade",
    background: "gradient",
  },
  [
    {
      type: "brand-story",
      duration: 5,
      title: "I rebuild careers.",
      subtitle: "Coach · Author · Operator",
    },
    {
      type: "achievement",
      duration: 6,
      title: "Three years, one mission",
      items: [
        "400+ professionals coached into senior roles",
        "Best-selling course on career pivots",
        "Featured in WSJ, Fast Company, The Information",
      ],
    },
    {
      type: "testimonial",
      duration: 5,
      title: "“She rewrote the way I think about ambition.”",
      subtitle: "— Maya, now Director of Engineering",
    },
    {
      type: "cta",
      duration: 4,
      title: "Work with me",
      subtitle: "rivera-coaching.com",
    },
  ],
);

const skills_demo = buildScript(
  {
    colorPalette: ["#ffffff", "#7c3aed", "#f59e0b", "#0f172a"],
    fontFamily: "Inter",
    motion: "moderate",
    transition: "slide",
    background: "solid",
  },
  [
    {
      type: "intro",
      duration: 4,
      title: "Skills, in motion.",
      subtitle: "Not a list — a portfolio.",
    },
    {
      type: "skills",
      duration: 6,
      title: "What I work with",
      skills: ["TypeScript", "React", "Node", "Postgres", "AWS", "Terraform"],
    },
    {
      type: "achievement",
      duration: 6,
      title: "Where each one paid off",
      items: [
        "TypeScript → cut runtime bugs 60% on checkout",
        "Terraform → onboarding from 3 days to 2 hours",
        "Postgres tuning → query p99 down 5×",
      ],
    },
    {
      type: "closing",
      duration: 3,
      title: "Proof, not promises.",
    },
  ],
);

const code_walkthrough = buildScript(
  {
    colorPalette: ["#020617", "#22d3ee", "#a78bfa", "#facc15"],
    fontFamily: "JetBrains Mono",
    motion: "minimal",
    transition: "cut",
    background: "dark-tech-grid",
  },
  [
    {
      type: "intro",
      duration: 5,
      title: "How it actually works.",
      subtitle: "A 30-second walk through the core loop.",
    },
    {
      type: "product-feature",
      duration: 6,
      title: "The render pipeline",
      text: "VideoScript → compileVideo() → CompiledVideo → frame renderer at 30 FPS.",
    },
    {
      type: "product-feature",
      duration: 6,
      title: "Why one player",
      items: [
        "Baked MP4 when fresh",
        "Live canvas when not",
        "Same external API — chrome doesn't branch",
      ],
    },
    {
      type: "cta",
      duration: 4,
      title: "Repo + write-up",
      subtitle: "github.com/yourname/project",
    },
  ],
);

const design_portfolio = buildScript(
  {
    colorPalette: ["#efe9e1", "#7a6b5a", "#b8a89a", "#1f2937"],
    fontFamily: "Inter",
    motion: "cinematic",
    transition: "cinematic-fade",
    background: "solid",
  },
  [
    {
      type: "intro",
      duration: 5,
      title: "Selected work, 2024–2026.",
      subtitle: "Mira Chen · Product Designer",
    },
    {
      type: "product-feature",
      duration: 6,
      title: "Healthcare scheduling redesign",
      text: "Cut booking abandonment from 41% to 17% across 1.2M monthly visits.",
    },
    {
      type: "product-feature",
      duration: 6,
      title: "Banking onboarding system",
      text: "Shipped a 14-screen flow in 9 weeks. Conversion +28% vs control.",
    },
    {
      type: "cta",
      duration: 4,
      title: "Full case studies",
      subtitle: "mirachen.design",
    },
  ],
);

const data_analysis = buildScript(
  {
    colorPalette: ["#ffffff", "#0ea5e9", "#7c3aed", "#0f172a"],
    fontFamily: "Inter",
    motion: "minimal",
    transition: "fade",
    background: "solid",
  },
  [
    {
      type: "intro",
      duration: 5,
      title: "Q3 — what the numbers said.",
      subtitle: "Three findings, one recommendation.",
    },
    {
      type: "achievement",
      duration: 6,
      title: "Headline findings",
      items: [
        "Activation rate up 22% MoM across 14 cohorts",
        "Churn concentrated in the 7-day window post-trial",
        "Two pricing pages drive 71% of paid conversions",
      ],
    },
    {
      type: "product-feature",
      duration: 5,
      title: "What changed",
      text: "We rebuilt the trial-to-paid prompt and re-ordered the pricing grid.",
    },
    {
      type: "closing",
      duration: 4,
      title: "Recommendation",
      subtitle: "Ship the new prompt sitewide; A/B the pricing change.",
    },
  ],
);

const job_ad = buildScript(
  {
    colorPalette: ["#7c3aed", "#2563eb", "#f43f5e", "#ffffff"],
    fontFamily: "Inter",
    motion: "moderate",
    transition: "slide",
    background: "gradient",
  },
  [
    {
      type: "intro",
      duration: 4,
      title: "We're hiring.",
      subtitle: "Senior Full-Stack Engineer · Remote",
    },
    {
      type: "job-details",
      duration: 6,
      title: "The role",
      items: [
        "Own the candidate-facing product end to end",
        "Pair with design weekly, ship every Tuesday",
        "TypeScript / React / Node / Postgres",
      ],
    },
    {
      type: "benefits",
      duration: 5,
      title: "Why join",
      skills: ["$160k–$210k", "Equity", "Remote-first", "Unlimited PTO", "4-day weeks"],
    },
    {
      type: "cta",
      duration: 4,
      title: "Apply by Friday.",
      subtitle: "jobs.example.com/se",
    },
  ],
);

const company_promo = buildScript(
  {
    colorPalette: ["#0f172a", "#7c3aed", "#2563eb", "#ffffff"],
    fontFamily: "Inter",
    motion: "cinematic",
    transition: "cinematic-fade",
    background: "gradient",
  },
  [
    {
      type: "brand-story",
      duration: 5,
      title: "Build with us.",
      subtitle: "ACME · Series B · 60 engineers",
    },
    {
      type: "company-culture",
      duration: 6,
      title: "How we work",
      items: [
        "Async-first, two synchronous hours/day",
        "Ship to prod from day one",
        "Outcomes over output — always",
      ],
    },
    {
      type: "benefits",
      duration: 5,
      title: "What you get",
      skills: ["Top-of-market comp", "Equity", "Remote-first", "Learning budget"],
    },
    {
      type: "cta",
      duration: 4,
      title: "Open roles",
      subtitle: "acme.co/careers",
    },
  ],
);

const sizzle_reel = buildScript(
  {
    colorPalette: ["#bae6fd", "#84cc16", "#0f172a", "#ffffff"],
    fontFamily: "Inter",
    motion: "cinematic",
    transition: "cinematic-fade",
    background: "gradient",
  },
  [
    {
      type: "intro",
      duration: 3,
      title: "Sizzle Reel",
      subtitle: "Three minutes of the best moments — in twenty seconds.",
    },
    {
      type: "product-feature",
      duration: 4,
      title: "Highlights cut to the beat",
      text: "Drop clips. Pick a track. We score the moments and cut to the music.",
    },
    {
      type: "testimonial",
      duration: 5,
      title: "“It picked the exact shots I'd have picked — in five seconds.”",
      subtitle: "— Sam, podcast producer",
    },
    {
      type: "cta",
      duration: 4,
      title: "Build yours",
      subtitle: "Drop clips · pick a track · publish.",
    },
  ],
);

const tool_promo = buildScript(
  {
    colorPalette: ["#4338ca", "#d946ef", "#fde68a", "#ffffff"],
    fontFamily: "Inter",
    motion: "moderate",
    transition: "slide",
    background: "gradient",
  },
  [
    {
      type: "intro",
      duration: 4,
      title: "New Tool Drop",
      subtitle: "A 30-second look at the latest from the catalog.",
    },
    {
      type: "product-feature",
      duration: 6,
      title: "What it does",
      text: "Turn raw recordings into shareable videos — captions, music, and end-cap included.",
    },
    {
      type: "benefits",
      duration: 5,
      title: "Why you'll like it",
      skills: ["No timeline editing", "Captions in 12 languages", "Free tier", "Renders in-browser"],
    },
    {
      type: "cta",
      duration: 4,
      title: "Try it",
      subtitle: "hired.video/tools",
    },
  ],
);

// ─── Registry ────────────────────────────────────────────────────────────────

/** Per-template demo VideoScript used by the marketplace press-play
 *  preview. Keyed by `ContentTemplate` so the catalog can attach the
 *  matching script via `TEMPLATE_DEMO_SCRIPTS[def.id]` and the registry
 *  stays the single source of truth. */
export const TEMPLATE_DEMO_SCRIPTS: Record<ContentTemplate, VideoScript> = {
  basic,
  profile,
  resume,
  personal_brand,
  skills_demo,
  code_walkthrough,
  design_portfolio,
  data_analysis,
  job_ad,
  company_promo,
  sizzle_reel,
  tool_promo,
};
