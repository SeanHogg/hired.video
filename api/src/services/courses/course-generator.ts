/**
 * AI Course Lesson Generator — gap #162.
 *
 * Reuses the storyboard generator's `purpose: "course_lesson"` branch +
 * the four course-shaped scene types (`concept`, `worked-example`,
 * `knowledge-check`, `summary`) plus the shared `intro` scene shape. The
 * generator emits a course tree (modules + lessons) where each lesson
 * carries an embeddable storyboard JSON the studio editor can hydrate
 * via the existing `sourceType: "studio_video"` lesson kind.
 *
 * One LLM call per generation; ~1 week of work in the gap-register spec
 * collapses to this file + the route + the dialog because the heavy
 * lifting (system prompt builder, scene type registry, JSON validator)
 * is already shipped for the storyboard generator.
 */

import { z } from "zod";
import { STUDIO_PURPOSES } from "../../../../shared/studio-purposes.js";
import { SCENE_TYPES } from "../../../../shared/scene-types.js";
import type { LLMClient } from "../adapters/llm-client.js";

export const CourseGenInputSchema = z.object({
  topic: z.string().min(4).max(280),
  /** Optional outline. When provided, the LLM uses it as the module skeleton
   *  instead of generating one from scratch. One item per module. */
  outline: z.array(z.string().min(2).max(160)).max(20).optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  /** Number of modules to generate when no outline is supplied. */
  moduleCount: z.number().int().min(1).max(12).default(4),
  /** Lessons per module. */
  lessonsPerModule: z.number().int().min(1).max(8).default(3),
  /** When true, every leaf lesson also generates a knowledge-check scene
   *  with a 2-option answer key (#201). */
  includeKnowledgeChecks: z.boolean().default(true),
});

export type CourseGenInput = z.infer<typeof CourseGenInputSchema>;

const GeneratedSceneSchema = z.object({
  type: z.enum(["intro", ...SCENE_TYPES.filter((t) => t !== "intro")] as [string, ...string[]]),
  title: z.string(),
  body: z.string(),
  /** When type === "knowledge-check", these populate the answer key. */
  question: z.string().optional(),
  options: z.array(z.object({ id: z.string(), text: z.string(), isCorrect: z.boolean() })).optional(),
});

const GeneratedLessonSchema = z.object({
  title: z.string(),
  summary: z.string(),
  estimatedMinutes: z.number().int().min(1).max(120),
  scenes: z.array(GeneratedSceneSchema).min(1).max(8),
});

const GeneratedModuleSchema = z.object({
  title: z.string(),
  summary: z.string(),
  lessons: z.array(GeneratedLessonSchema).min(1).max(8),
});

export const GeneratedCourseSchema = z.object({
  title: z.string(),
  description: z.string(),
  estimatedMinutes: z.number().int(),
  modules: z.array(GeneratedModuleSchema).min(1),
});

export type GeneratedCourse = z.infer<typeof GeneratedCourseSchema>;

function buildSystemPrompt(input: CourseGenInput): string {
  return `You are a course-design assistant. Generate a complete e-learning course tree
that maps cleanly onto the hired.video course schema:
  courses → courseModules → courseLessons → scenes (storyboard JSON).

Scene types you may use are exactly: ${SCENE_TYPES.filter((t) => ["intro", "concept", "worked-example", "knowledge-check", "summary"].includes(t)).join(", ")}.
Pedagogy expectations per lesson:
  • Start with an \`intro\` (or \`concept\`) scene framing the learning objective.
  • Follow with \`concept\` or \`worked-example\` body scenes.
  ${input.includeKnowledgeChecks ? "• End with a `knowledge-check` scene; emit { question, options[] } with one correct answer." : ""}
  • Close with a \`summary\` scene recapping takeaways.

Difficulty for this course: ${input.difficulty}.
Target ${input.moduleCount} modules, ${input.lessonsPerModule} lessons per module.
Each lesson should be 3-6 minutes long unless the topic demands otherwise.

Return ONLY JSON conforming to the GeneratedCourse schema. Do not include markdown fences.`;
}

function buildUserMessage(input: CourseGenInput): string {
  if (input.outline && input.outline.length > 0) {
    return `Topic: ${input.topic}\n\nModule outline (one module per line):\n${input.outline.map((m, i) => `${i + 1}. ${m}`).join("\n")}`;
  }
  return `Topic: ${input.topic}\nDesign the module + lesson tree.`;
}

export async function generateCourse(args: {
  llm: LLMClient;
  input: CourseGenInput;
}): Promise<{ data: GeneratedCourse; usage: { promptTokens?: number; completionTokens?: number } }> {
  if (!STUDIO_PURPOSES.includes("course_lesson")) {
    // Defensive: if someone removes the purpose enum entry without
    // updating this file, the storyboard generator won't have a system-
    // prompt branch for us. We fail loudly rather than silently scoring
    // poorly.
    throw new Error("`course_lesson` purpose missing from STUDIO_PURPOSES — generator cannot run");
  }
  const validated = CourseGenInputSchema.parse(args.input);
  const result = await args.llm.callJson<GeneratedCourse>(
    "course_generation",
    {
      useCase: "course_generation",
      systemPrompt: buildSystemPrompt(validated),
      userMessage: buildUserMessage(validated),
      responseFormat: "json_object",
    },
    GeneratedCourseSchema,
  );
  return { data: result.data, usage: result.usage };
}
