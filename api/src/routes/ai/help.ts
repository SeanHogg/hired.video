/** POST /api/ai/help-assist — help-first deflection in front of /chat. */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import { createLLMClient, hasAnyLLMProviderKey, type LLMMessage } from "../../services/adapters/llm-client.js";
import { logger } from "../../lib/logger.js";
import {
  buildHelpDocsBlock,
  buildHelpAssistSystemPrompt,
  decideHelpEscalation,
} from "../../services/help/help-assist.js";
import { SYSTEM_PROMPT } from "./chat.js";

export const aiHelpRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// POST /api/ai/help-assist — help-first deflection in front of /chat
// ---------------------------------------------------------------------------
/**
 * The Brain answers FAQ-shaped questions from the bundled help docs BEFORE
 * spending a premium turn. Help CONTENT lives in the client bundle (see
 * frontend/lib/help/content.ts), so the client retrieves candidate docs
 * locally and supplies the snippets here; a CHEAP free-pool model either
 * answers grounded ONLY in those docs (in the CHRO voice, indistinguishable
 * from any other AI reply) or returns the escalate sentinel.
 *
 *   Request:  { question: string, candidates: [{slug,title,summary,body}], history? }
 *   Response: { escalate: true } | { escalate: false, answer: string }
 *
 * Seamless + safe: a grounded answer renders in the same bubble as /chat;
 * anything the docs don't cover (or ANY failure) returns `escalate: true` so
 * the client falls through to /chat, which owns the token budget, the
 * career-coach message cap, tools, and typed error envelopes. This endpoint
 * deliberately does NOT meter the career-coach cap — a doc-answered question
 * must not burn the user's quota (that's the whole point of deflecting).
 */
aiHelpRoutes.post("/help-assist", async (c) => {
  // No auth gate: the Brain answers from PUBLIC help docs for everyone,
  // including signed-out visitors (mounted optional-auth — `c.var.user` is
  // present only when a JWT was sent, and is used solely for unbilled
  // attribution). It never reads private data and never escalates to premium.
  const body = await c.req.json().catch(() => ({}));
  const question = typeof body.message === "string" ? body.message.trim()
    : typeof body.question === "string" ? body.question.trim() : "";
  const history: Array<{ role: string; content: string }> = Array.isArray(body.history) ? body.history : [];

  const docs = buildHelpDocsBlock(body.candidates);

  // No question / no usable docs / no provider → nothing to deflect to; let
  // the client escalate to the full path.
  if (!question || !docs || !hasAnyLLMProviderKey(c.env as any)) {
    return c.json(success({ escalate: true }), 200);
  }

  try {
    const llm = createLLMClient(c.env as any, c.var.user);
    const llmMessages: LLMMessage[] = [
      { role: "system", content: buildHelpAssistSystemPrompt(SYSTEM_PROMPT, docs) },
      ...history.slice(-6).map((h) => ({
        role: (h.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
        content: String(h.content ?? ""),
      })),
      { role: "user", content: question },
    ];

    const result = await llm.callMessages("help_assist", {
      useCase: "help_assist",
      messages: llmMessages,
      responseFormat: "text",
    });

    return c.json(success(decideHelpEscalation(result.content)), 200);
  } catch (err) {
    // ANY failure degrades to escalation — the client falls back to /chat,
    // which owns budget + error handling. Never surface a help-path error.
    logger.error("[ai/help-assist] degraded → escalate", err);
    return c.json(success({ escalate: true }), 200);
  }
});
