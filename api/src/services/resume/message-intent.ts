/**
 * Is a /build chat message a QUESTION about the résumé, or possibly a change
 * request? Decided in code, before any model call, so a question can never
 * be applied as an edit — whatever the model does with it.
 *
 *   - "question": answer only; the draft is never touched.
 *   - "open": may be a change request (or a question we couldn't recognise) —
 *     the model decides, and may still answer instead of editing.
 *
 * Polite requests phrased as questions ("can you make it punchier?") stay
 * "open": they ask for a change.
 */
export type MessageIntent = "question" | "open";

/** Starts like a question no matter how it ends ("why skills first"). */
const WH_START_RE = /^(how|why|what|when|where|who|whom|whose|which|explain|tell me|help me understand)\b/i;
/** "Can you / could you / would you / please …" — a polite change request,
 *  unless what follows asks for an explanation. */
const REQUEST_START_RE = /^(please\b|(can|could|would|will)\s+you\b)/i;
const EXPLAIN_RE = /\b(explain|tell me|describe|clarify|why|how (did|do|does|come)|what (does|did|is|makes))\b/i;
/** Change verbs as stems, so any inflection matches ("shortened",
 *  "cutting"). "what if you shortened it" is a request, not a question. */
const CHANGE_VERB_RE =
  /\b(mak|rewrit|re-?word|shorten|lengthen|trim|cut|remov|delet|drop|add|chang|replac|fix|tailor|reorder|mov|fit|tighten|expand|condens|updat|edit|improv|polish|punch|swap|renam|turn)/i;

export function classifyMessageIntent(message: string): MessageIntent {
  const text = message.trim();
  if (!text) return "open";
  if (REQUEST_START_RE.test(text)) return EXPLAIN_RE.test(text) ? "question" : "open";
  if (WH_START_RE.test(text)) {
    // "what if you made it shorter" / "how about cutting the summary"
    return /^(what if|what about|how about)\b/i.test(text) && CHANGE_VERB_RE.test(text) ? "open" : "question";
  }
  if (text.endsWith("?")) return CHANGE_VERB_RE.test(text) && !EXPLAIN_RE.test(text) ? "open" : "question";
  return "open";
}
