/**
 * Outreach message personalization.
 *
 * Sits on top of the deterministic `{{var}}` substitution that follow-up
 * steps / outreach sequences already do, and rewrites the rendered body so it
 * reads as if written individually for the recipient — the "AI message
 * personalization" layer in the Smart-Outreach product surface.
 *
 * It is NEVER a replacement for the template substitution: the caller renders
 * `{{name}}`/`{{company}}`/… first, then (when the step opts in) passes the
 * rendered body here. Shared by every sender so the follow-up cron and any
 * future recruiter-sequence sender can't drift on prompt/guardrails.
 *
 * Always safe: returns the original body unchanged when no LLM provider is
 * configured or the call fails. A personalization outage must never block or
 * drop a scheduled send.
 */

import { createLLMClient, hasAnyLLMProviderKey } from "../adapters/llm-client.js";
import type { Env, JwtPayload } from "../../types/index.js";

export interface PersonalizeArgs {
  /** The already-rendered message body (after `{{var}}` substitution). */
  body: string;
  /** Recipient display name, if known. */
  recipientName?: string | null;
  /** Free-form context vars (company, role, trigger, …) used to tailor tone. */
  context?: Record<string, string>;
  /** Subject line — for the model's framing only; not rewritten. */
  subject?: string;
}

export async function personalizeMessage(
  env: Env,
  user: JwtPayload | undefined,
  args: PersonalizeArgs,
): Promise<string> {
  const base = (args.body ?? "").trim();
  // Nothing to personalize, or no model available → return the deterministic
  // body untouched (the caller's `{{var}}` render is still a valid message).
  if (!base || !hasAnyLLMProviderKey(env)) return args.body;

  const ctxLines = Object.entries(args.context ?? {})
    .filter(([, v]) => typeof v === "string" && v.trim().length > 0)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const systemPrompt =
`You personalize one-to-one outreach messages. Rewrite the DRAFT so it reads as if written individually for this recipient.

HARD RULES:
1. Keep the core message, offer, and any call-to-action identical in meaning.
2. Keep it roughly the same length (within ~25%). No filler, no padding.
3. Use the recipient context for ONE or TWO genuinely specific touches — NEVER invent facts that aren't in the context.
4. Preserve every link verbatim and keep the recipient's name. Do NOT add a subject line, signature, or salutation that wasn't already in the draft.
5. Plain text only. Output ONLY the rewritten message — no preamble, no surrounding quotes, no commentary.`;

  const userMessage =
`Recipient: ${args.recipientName?.trim() || "(unknown)"}
${args.subject ? `Subject: ${args.subject}\n` : ""}${ctxLines ? `Context:\n${ctxLines}\n` : ""}
DRAFT:
${base}`;

  try {
    const llm = createLLMClient(env, user);
    const { content } = await llm.callText("recruiter_outreach", {
      useCase: "recruiter_outreach",
      systemPrompt,
      userMessage,
    });
    const out = content?.trim();
    return out && out.length > 0 ? out : args.body;
  } catch (err) {
    console.error("[outreach/personalize] LLM failed, sending base body:", err);
    return args.body;
  }
}
