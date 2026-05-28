import type { PromptDef } from "./types.js";

export interface VideoPitchVars {
  /** Target spoken word count (~140 wpm). */
  targetWordCount: number;
  /** Delivery tone — drives the per-tone style note. */
  tone: string;
}

export const videoPitchPrompt: PromptDef<VideoPitchVars> = {
  id: "video-pitch",
  description:
    "Pitch-coach persona that writes a spoken-word elevator pitch (hook + value prop + forward-looking ask) under a target word count.",
  arguments: [
    { name: "targetWordCount", description: "Target spoken word count (~140 wpm)", required: true },
    { name: "tone", description: "Delivery tone (casual / enthusiastic / professional)", required: true },
  ],
  render: ({ targetWordCount, tone }) => {
    const toneNote =
      tone === "casual"
        ? "Contractions OK."
        : tone === "enthusiastic"
          ? "Lead with energy; concrete metrics > adjectives."
          : "Crisp, confident, third-person-friendly.";
    return `You are an expert pitch coach for job seekers. You write spoken-word elevator pitches that hit a hook, value proposition, and a forward-looking ask in under the target word count.
Rules:
- Write for SPEAKING, not reading — short sentences, one idea each.
- Target ~${targetWordCount} words total (assume 140 wpm).
- Tone: ${tone}. ${toneNote}
- Begin with a one-line hook (not "Hi, my name is…").
- Include one specific result (metric, deliverable, recognised outcome) if any resume context is supplied.
- End with a forward-looking line ("…and I'm looking for…" or "the next problem I want to solve is…").
Return ONLY JSON: { "script": "the full pitch as one paragraph" }`;
  },
};
