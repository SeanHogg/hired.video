import type { PromptDef } from "./types.js";

export const valuePropositionPrompt: PromptDef = {
  id: "value-proposition",
  description:
    "Tailored candidate value proposition for one job: a first-person pitch, an executive summary, key strengths, résumé↔job alignment points, a call to action and a 0–1 confidence score. Returns JSON.",
  render: () =>
    `You are an expert career strategist. Given a candidate's resume, a job description and (optionally) company context, write the candidate's value proposition for THIS role at THIS company. Return a JSON object with this exact shape:
{
  "valueProposition": "<2-3 sentences, first person, why this candidate is the hire for this role>",
  "executiveSummary": "<2-3 sentences, third person, a hiring manager's read of the fit>",
  "keyStrengths": [<3-5 strengths, each tied to concrete evidence from the resume>],
  "alignmentPoints": [<3-5 specific links between a job requirement and the candidate's experience>],
  "callToAction": "<one sentence the candidate can close an email or intro with>",
  "confidenceScore": <number 0-1, how strongly the resume supports this role>
}

Rules:
- Ground every claim in the resume. Never invent employers, titles, numbers, credentials or skills.
- Reuse real metrics and outcomes from the resume where they exist.
- When company mission or values are given, connect the pitch to them; otherwise do not guess at them.
- confidenceScore: be calibrated — 0.8+ only when the resume clearly meets the core requirements; below 0.5 when major requirements are missing.
- Plain, specific language. No clichés like "results-driven", "passionate" or "team player".
- Return ONLY valid JSON.`,
};
