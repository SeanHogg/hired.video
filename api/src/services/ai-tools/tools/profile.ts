/**
 * Profile AI tools — profile-audit (rewritten headline + summary with the
 * 5-check audit) and improve-text (the ✨ next to headline / About).
 * Neither writes: the client applies accepted text via PUT /api/users/me.
 */
import { z } from "zod";
import { DomainError } from "../../../domains/errors.js";
import { success } from "../../../types/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../../adapters/llm-client.js";
import { aiFailure } from "../../adapters/llm-error.js";
import { runProfileAudit } from "../../profile/ProfileAuditService.js";
import { defineAiTool, failTool } from "../types.js";

export const profileAuditTool = defineAiTool({
  id: "profile-audit",
  schema: z.object({}).passthrough(),
  requirePro: "Profile Audit",
  tokenBudget: "gate",
  handler: async (c) => {
    try {
      const result = await runProfileAudit({ userId: c.var.user.sub as string, env: c.env, user: c.var.user });
      return c.json(success(result), 200);
    } catch (err) {
      if (err instanceof Error && err.message === "USER_NOT_FOUND") {
        return failTool(c, new DomainError(404, "NOT_FOUND", "Your profile could not be loaded."));
      }
      return aiFailure(c, err, "[profile-audit] failed");
    }
  },
});

type ImproveField = "headline" | "about";

const IMPROVE_FIELD_GUIDANCE: Record<ImproveField, { max: number; system: string }> = {
  headline: {
    max: 160,
    system:
      "You rewrite a professional profile headline (a one-line tagline shown under a person's name). " +
      "Make it concise, specific and compelling — highlight role, value and focus. " +
      "Keep it to a single line, no more than ~140 characters. " +
      "Do NOT use quotation marks, hashtags, emojis, or a trailing period. " +
      "Return ONLY the rewritten headline text with no preamble, labels, or explanation.",
  },
  about: {
    max: 2000,
    system:
      "You polish a professional 'About' bio for a career profile. " +
      "Improve clarity, flow and impact while preserving every fact, name and number in the original. " +
      "Keep the first-person voice when the source uses it. Use short, scannable paragraphs. " +
      "Stay under 2000 characters. " +
      "Return ONLY the rewritten bio text with no preamble, labels, headings, or explanation.",
  },
};

function improvePrompt(field: ImproveField, text: string, ctx: { name?: string; role?: string; company?: string }): string {
  const facts = [ctx.name && `Name: ${ctx.name}`, ctx.role && `Current role: ${ctx.role}`, ctx.company && `Company: ${ctx.company}`]
    .filter(Boolean)
    .join("\n");
  const factBlock = facts ? `Context:\n${facts}\n\n` : "";
  const label = field === "about" ? "About bio" : "headline";
  return text ? `${factBlock}Rewrite the following ${label}:\n\n${text}` : `${factBlock}Write a strong ${label} from the context above.`;
}

/** Strip wrapping quotes / label prefixes, one line for a headline, clamp. */
function sanitizeImproved(raw: string, field: ImproveField): string {
  let out = (raw ?? "").trim().replace(/^(headline|about|bio)\s*[:-]\s*/i, "").trim();
  if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'"))) out = out.slice(1, -1).trim();
  if (field === "headline") out = out.replace(/\s*\n+\s*/g, " ").trim();
  const max = IMPROVE_FIELD_GUIDANCE[field].max;
  return out.length > max ? out.slice(0, max).trim() : out;
}

const ctxString = z.string().optional().transform((v) => v?.slice(0, 120));

/** `{ field, text?, context? }` → `{ text }`. `text` may be empty (write
 *  from `context`). Counts against the monthly AI allowance. */
export const improveTextTool = defineAiTool({
  id: "improve-text",
  schema: z
    .object({
      field: z.enum(["headline", "about"]),
      text: z.string().optional().transform((v) => (v ?? "").trim().slice(0, 4000)),
      context: z.object({ name: ctxString, role: ctxString, company: ctxString }).partial().optional(),
    })
    .refine((v) => Boolean(v.text || v.context?.name || v.context?.role || v.context?.company), {
      message: "Provide some text or profile context to improve",
    }),
  tokenBudget: "gate",
  useCase: "profile_text_improve",
  handler: async (c, { field, text, context }) => {
    if (!hasAnyLLMProviderKey(c.env)) return failTool(c, new DomainError(503, "AI_UNAVAILABLE", "AI is not configured"));
    try {
      const { content } = await createLLMClient(c.env, c.var.user).callText(
        field === "about" ? "profile_about_improve" : "profile_headline_improve",
        {
          useCase: "profile_text_improve",
          systemPrompt: IMPROVE_FIELD_GUIDANCE[field].system,
          userMessage: improvePrompt(field, text, context ?? {}),
          responseFormat: "text",
        },
      );
      const improved = sanitizeImproved(content, field);
      if (!improved) return failTool(c, new DomainError(502, "AI_EMPTY", "No suggestion was produced"));
      return c.json(success({ text: improved }), 200);
    } catch (err) {
      return aiFailure(c, err, "[ai/improve-text] LLM error");
    }
  },
});
