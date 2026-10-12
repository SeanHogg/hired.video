/**
 * Help-first deflection — pure logic for the AI Brain's `POST /api/ai/help-assist`.
 *
 * Help CONTENT lives in the client bundle (frontend/lib/help/content.ts), so
 * the client retrieves candidate docs locally and supplies the snippets; a
 * cheap free-pool model either answers grounded ONLY in those docs (in the
 * CHRO voice) or emits the escalate sentinel. These helpers hold the
 * deterministic decisions (doc framing + escalate detection + grounding
 * prompt) so they're unit-testable without the LLM/env; the route ([ai.ts])
 * is left as thin gateway wiring.
 */

/** Sentinel the model returns when the supplied docs don't answer the
 *  question — the client then escalates to the full /chat path. */
export const HELP_ASSIST_ESCALATE_TOKEN = "NEED_AI";

/** Build the grounding docs block from client-supplied help candidates.
 *  Caps doc count + per-doc length so a few large articles can't blow the
 *  cheap model's context window. Returns "" when nothing usable was
 *  supplied (the caller then escalates — there's nothing to ground on). */
export function buildHelpDocsBlock(
  candidates: unknown,
  opts: { maxDocs?: number; maxBodyChars?: number } = {},
): string {
  const { maxDocs = 6, maxBodyChars = 4000 } = opts;
  return (Array.isArray(candidates) ? candidates : [])
    .slice(0, maxDocs)
    .map((d) => (d && typeof d === "object" ? (d as Record<string, unknown>) : null))
    .filter(
      (d): d is Record<string, unknown> =>
        !!d && typeof d.body === "string" && (d.body as string).trim().length > 0,
    )
    .map(
      (d, i) =>
        `### Doc ${i + 1}: ${String(d.title ?? d.slug ?? "")}\n${String(d.body).slice(0, maxBodyChars)}`,
    )
    .join("\n\n");
}

/** Decide whether a help-assist model reply is a usable answer or an
 *  escalation. An empty reply, or the sentinel appearing anywhere in the
 *  reply, means the docs didn't cover it → escalate rather than render a
 *  thin/garbled answer. */
export function decideHelpEscalation(
  answer: string | null | undefined,
): { escalate: true } | { escalate: false; answer: string } {
  const trimmed = (answer ?? "").trim();
  if (!trimmed || trimmed.includes(HELP_ASSIST_ESCALATE_TOKEN)) return { escalate: true };
  return { escalate: false, answer: trimmed };
}

/** The grounding system prompt — the shared CHRO persona plus strict
 *  source-only rules so the answer is indistinguishable from any other AI
 *  reply yet never invents facts the docs don't contain. */
export function buildHelpAssistSystemPrompt(persona: string, docsBlock: string): string {
  return `${persona}

You are answering the user's question using ONLY the help documentation provided below.
Rules:
- Answer in your own natural voice as the assistant. Do NOT mention "the documentation", "the docs", "the help articles", or that you were given any source — just answer the question directly.
- Use ONLY facts contained in the documentation. Do not invent steps, names, prices, URLs, or features.
- If the documentation does not contain enough information to answer the question confidently, reply with EXACTLY "${HELP_ASSIST_ESCALATE_TOKEN}" and nothing else.
- Be concise and actionable.

HELP DOCUMENTATION:
${docsBlock}`;
}
