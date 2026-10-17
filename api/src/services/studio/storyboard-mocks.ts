/**
 * Deterministic VideoScript scaffolds per studio purpose — the `basic`
 * blank-starter path of POST /api/studio/storyboard (no LLM round-trip) and
 * the per-purpose scene plans the LLM prompts mirror. Split out of
 * routes/studio.ts (W2-3a).
 */
import type { Motion, StudioPurpose, VideoScript } from "./video-script.js";

export function buildMockAdVideoScript(
  text: string,
  targetDuration: number,
  motion: Motion,
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
