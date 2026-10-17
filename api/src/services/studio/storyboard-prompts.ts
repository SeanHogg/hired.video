/**
 * LLM prompt construction for POST /api/studio/storyboard: the explicit
 * scene-count detector (gap #483), the per-purpose system prompts, and the
 * default user brief per purpose. Split out of routes/studio.ts (W2-3a).
 */
import type { StudioPurpose } from "./video-script.js";

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

export function buildStudioSystemPrompt(
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

/** The user-message lead-in when the caller sent no free-form prompt. */
export function defaultStoryboardPrompt(purpose: StudioPurpose): string {
  return purpose === "resume"
    ? "Create a professional video resume"
    : purpose === "job_ad" ? "Create a compelling job advertisement video"
    : purpose === "company_promo" ? "Create an engaging company promotional video"
    : purpose === "recruiter_brand" ? "Create a recruiter personal brand video"
    : purpose === "course_lesson" ? "Create a short course lesson teaching one concept end-to-end"
    : purpose === "pitch" ? "Create a short personal video pitch introducing me to recruiters"
    : "Create a product launch video";
}
