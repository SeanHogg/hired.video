/**
 * Goal → course matching for learning goals.
 *
 * Recall is a deterministic keyword match over published courses (title /
 * summary / category / tags); precision is an optional LLM re-rank / path
 * plan over that candidate set. Callers fall back to keyword order whenever
 * the LLM is unavailable or fails.
 */
import { z } from "zod";
import { getDb } from "../../db/index.js";
import { searchPublishedCoursesByTokens } from "../../repositories/learningGoalsRepository.js";
import type { createLLMClient } from "../adapters/llm-client.js";

export type GoalLlm = ReturnType<typeof createLLMClient>;

// Stop words we never want to match on — they'd pull in every course.
const STOP_WORDS = new Set([
  "i", "to", "the", "a", "an", "and", "or", "of", "for", "in", "on", "how",
  "want", "learn", "learning", "become", "get", "better", "with", "my",
  "about", "more", "build", "building", "make", "using", "use",
]);

export interface RecommendCard {
  id: string;
  type: "course";
  title: string;
  slug: string;
  summary: string | null;
  coverImageUrl: string | null;
  category: string | null;
  tags: string[] | null;
  difficulty: string | null;
  estimatedMinutes: number | null;
  priceCents: number | null;
  issuesCertificate: boolean;
  enrollmentCount: number;
  averageRating: number | null;
  ratingCount: number;
  publishedAt: Date | string | null;
  author: { id: string; name: string | null; avatarUrl: string | null; slug: string };
}

type Candidate = Pick<RecommendCard, "id" | "title" | "summary" | "category" | "difficulty">;

export function goalTokens(goalText: string): string[] {
  return goalText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
    .slice(0, 8);
}

export async function recommendCoursesForText(goalText: string, limit = 6): Promise<RecommendCard[]> {
  const rows = await searchPublishedCoursesByTokens(getDb(), goalTokens(goalText), limit);
  return rows.map((r) => ({
    id: r.course.id,
    type: "course" as const,
    title: r.course.title,
    slug: r.course.slug,
    summary: r.course.summary,
    coverImageUrl: r.course.coverImageUrl,
    category: r.course.category,
    tags: r.course.tags,
    difficulty: r.course.difficulty,
    estimatedMinutes: r.course.estimatedMinutes,
    priceCents: r.course.priceVisible ? r.course.priceCents : null,
    issuesCertificate: r.course.issuesCertificate,
    enrollmentCount: r.course.enrollmentCount,
    averageRating: r.course.averageRating,
    ratingCount: r.course.ratingCount,
    publishedAt: r.course.publishedAt,
    author: {
      id: r.author.id,
      name: r.author.name,
      avatarUrl: r.authorProfile?.avatarUrl ?? null,
      slug: r.authorProfile?.customUrlSlug ?? r.author.id,
    },
  }));
}

/** Ask the LLM to assemble a coherent ordered path from the candidate courses. */
export async function llmPlanPath(
  llm: GoalLlm,
  goalText: string,
  candidates: Candidate[],
): Promise<{ title: string; summary: string; orderedCourseIds: string[] }> {
  const list = candidates
    .map(
      (c2, i) =>
        `${i + 1}. id=${c2.id} | ${c2.title}${c2.difficulty ? ` (${c2.difficulty})` : ""}${c2.summary ? ` — ${c2.summary.slice(0, 140)}` : ""}`,
    )
    .join("\n");
  const { data } = await llm.callJson(
    "course_recommend",
    {
      useCase: "course_recommend",
      systemPrompt:
        "You design a learning path: pick ONLY the candidate courses that build toward the learner's goal and order them from foundational to advanced. Give the path a short title and a one-sentence summary. Use ONLY the supplied course ids; never invent ids; drop irrelevant courses.",
      userMessage: `Learner goal: "${goalText}"\n\nCandidate courses:\n${list}\n\nReturn { title, summary, orderedCourseIds } — orderedCourseIds foundational-first.`,
      responseFormat: "json_object",
    },
    z.object({
      title: z.string(),
      summary: z.string(),
      orderedCourseIds: z.array(z.string()),
    }),
  );
  return data;
}

/** Re-rank keyword candidates by relevance to the goal. Returns an ordered list
 *  of course ids (best first) or throws → caller falls back to keyword order. */
export async function llmRerankCandidates(
  llm: GoalLlm,
  goalText: string,
  candidates: Candidate[],
): Promise<string[]> {
  const list = candidates
    .map(
      (c2, i) =>
        `${i + 1}. id=${c2.id} | ${c2.title}${c2.category ? ` [${c2.category}]` : ""}${c2.difficulty ? ` (${c2.difficulty})` : ""}${c2.summary ? ` — ${c2.summary.slice(0, 140)}` : ""}`,
    )
    .join("\n");
  const { data } = await llm.callJson(
    "course_recommend",
    {
      useCase: "course_recommend",
      systemPrompt:
        "You rank courses by how well they help a learner reach a stated goal. Return ONLY the ids of the genuinely relevant courses, best first (most directly on-goal). Drop irrelevant ones entirely. Never invent ids.",
      userMessage: `Learner goal: "${goalText}"\n\nCandidate courses:\n${list}\n\nReturn the relevant course ids, best first.`,
      responseFormat: "json_object",
    },
    z.object({ orderedIds: z.array(z.string()) }),
  );
  const validIds = new Set(candidates.map((c2) => c2.id));
  return data.orderedIds.filter((cid) => validIds.has(cid));
}
