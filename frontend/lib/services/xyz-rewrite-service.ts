/**
 * Client for the XYZ rewrite AI tools (resume-rewrite-xyz-highlights / -text)
 * the whole-résumé XYZ pass calls (#990). Shapes are the shared schemas.
 */
import { apiClient } from "@/lib/api-client";
import { aiToolPath } from "@shared/ai-tools/tool-ids";
import {
  RewriteXyzHighlightsResponseSchema,
  RewriteXyzTextResponseSchema,
  type RewriteXyzKind,
} from "@shared/tool-schemas";

export const xyzRewriteService = {
  /** One entry's bullets, reframed as XYZ accomplishments (fewer, stronger). */
  async highlights(
    highlights: string[],
    context: { role?: string; organization?: string; summary?: string },
  ): Promise<string[]> {
    const { data } = await apiClient.post(
      aiToolPath("resume-rewrite-xyz-highlights"),
      { highlights, context },
      RewriteXyzHighlightsResponseSchema,
    );
    return data.items.map((i) => i.text);
  },

  /** One summary / title, rewritten (a title is only polished, never promoted). */
  async text(
    kind: RewriteXyzKind,
    original: string,
    context: { role?: string; organization?: string; highlights?: string[] },
  ): Promise<string> {
    const { data } = await apiClient.post(
      aiToolPath("resume-rewrite-xyz-text"),
      { kind, original, context },
      RewriteXyzTextResponseSchema,
    );
    return data.improved;
  },
};
