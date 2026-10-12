/**
 * Studio features — interview question library + practice. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { getDb } from "../../db/index.js";
import { insertDefaultInterviewQuestions } from "../../repositories/studioFeaturesRepository.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../../services/adapters/llm-client.js";
import { ok, fail, studioInterviewQuestions, studioInterviewSessions } from "./shared.js";

export const interviewRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  7. INTERVIEW QUESTION LIBRARY + PRACTICE
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/studio/interview/questions — browse question library
interviewRoutes.get("/interview/questions", async (c) => {
  const category = c.req.query("category");
  const difficulty = c.req.query("difficulty");
  const industry = c.req.query("industry");

  const db = getDb();
  let query = db.select().from(studioInterviewQuestions).$dynamic();

  const conditions = [];
  if (category) conditions.push(eq(studioInterviewQuestions.category, category));
  if (difficulty) conditions.push(eq(studioInterviewQuestions.difficulty, difficulty));
  if (industry) conditions.push(eq(studioInterviewQuestions.industry, industry));

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const questions = await query.limit(50);
  return c.json(ok(questions));
});

// POST /api/studio/interview/questions/seed — seed default questions
interviewRoutes.post("/interview/questions/seed", async (c) => {
  const db = getDb();

  const defaultQuestions = [
    // Behavioral
    { category: "behavioral", difficulty: "medium", question: "Tell me about a time you had to deal with a difficult team member.", framework: "STAR", tips: ["Be specific about the situation", "Focus on your actions, not blame", "Show resolution and learning"], industry: "general" },
    { category: "behavioral", difficulty: "medium", question: "Describe a situation where you had to meet a tight deadline.", framework: "STAR", tips: ["Quantify the deadline pressure", "Show prioritization skills", "Highlight the outcome"], industry: "general" },
    { category: "behavioral", difficulty: "hard", question: "Tell me about your biggest professional failure and what you learned.", framework: "STAR", tips: ["Choose a genuine failure, not a humble-brag", "Focus 70% on the learning", "Show how you've applied the lesson since"], industry: "general" },
    { category: "behavioral", difficulty: "easy", question: "Why are you interested in this role?", framework: null, tips: ["Research the company thoroughly", "Connect your skills to their needs", "Show genuine enthusiasm"], industry: "general" },
    { category: "behavioral", difficulty: "medium", question: "Describe a time you went above and beyond for a project.", framework: "STAR", tips: ["Be specific about what 'above and beyond' meant", "Show the impact of your extra effort", "Connect it to your work ethic"], industry: "general" },
    { category: "behavioral", difficulty: "medium", question: "Tell me about a time you had to persuade someone to see things your way.", framework: "STAR", tips: ["Show empathy for the other perspective", "Describe your communication approach", "Focus on the collaborative outcome"], industry: "general" },
    { category: "behavioral", difficulty: "hard", question: "Describe a situation where you had to make a decision with incomplete information.", framework: "STAR", tips: ["Show your analytical framework", "Explain how you mitigated risk", "Share the outcome and what you'd do differently"], industry: "general" },
    // Technical
    { category: "technical", difficulty: "medium", question: "Walk me through a recent project you're proud of. What was the architecture?", framework: null, tips: ["Start with the problem being solved", "Explain your technical choices", "Discuss trade-offs you considered"], industry: "tech" },
    { category: "technical", difficulty: "hard", question: "How would you design a system to handle 10x your current traffic?", framework: null, tips: ["Think about horizontal scaling", "Discuss caching, CDNs, and database optimization", "Mention monitoring and fallback strategies"], industry: "tech" },
    { category: "technical", difficulty: "easy", question: "What programming languages and frameworks are you most comfortable with?", framework: null, tips: ["Rank by proficiency", "Give examples of what you've built with each", "Be honest about learning curves"], industry: "tech" },
    // Situational
    { category: "situational", difficulty: "medium", question: "Your manager assigns a project you disagree with. How do you handle it?", framework: null, tips: ["Show respect for authority while expressing your perspective", "Propose alternatives constructively", "Demonstrate adaptability"], industry: "general" },
    { category: "situational", difficulty: "hard", question: "You discover a colleague is taking credit for your work. What do you do?", framework: null, tips: ["Stay professional and calm", "Address it directly but diplomatically", "Document your contributions"], industry: "general" },
    { category: "situational", difficulty: "medium", question: "How would you onboard yourself into a new team within the first 90 days?", framework: null, tips: ["Show a structured approach", "Mention relationship building", "Balance learning with early contributions"], industry: "general" },
    // Company-specific
    { category: "company-specific", difficulty: "medium", question: "What do you know about our company's mission and how does it align with your values?", framework: null, tips: ["Do deep research beyond the About page", "Connect personally to their mission", "Be authentic"], industry: "general" },
    { category: "company-specific", difficulty: "medium", question: "Where do you see yourself contributing most in the first year?", framework: null, tips: ["Tie to the job description", "Show ambition tempered with realism", "Demonstrate understanding of their challenges"], industry: "general" },
  ];

  await insertDefaultInterviewQuestions(db, defaultQuestions);

  return c.json(ok({ seeded: defaultQuestions.length }));
});

// POST /api/studio/interview/session — start a practice session
interviewRoutes.post("/interview/session", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    questionId: UuidLikeSchema,
    resumeText: z.string().optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request"), 400);

  // Generate AI talking points from resume
  let talkingPoints: string[] = [];

  if (hasAnyLLMProviderKey(c.env) && parsed.data.resumeText) {
    const db = getDb();
    const [question] = await db.select().from(studioInterviewQuestions)
      .where(eq(studioInterviewQuestions.id, parsed.data.questionId)).limit(1);

    if (question) {
      try {
        const llm = createLLMClient(c.env, c.var.user);
        const { content } = await llm.callText("studio_interview_talking_points", {
          useCase: "interview_questions",
          systemPrompt: `You are an interview coach. Generate 3-5 bullet-point talking points that the candidate should mention when answering this question, based on their resume. Return JSON: {"points": ["...", "..."]}`,
          userMessage: `Question: ${question.question}\n\nResume:\n${parsed.data.resumeText.slice(0, 3000)}`,
        });
        const result = JSON.parse(content.replace(/```json?\s*/g, "").replace(/```/g, ""));
        talkingPoints = result.points ?? [];
      } catch { /* fallback to empty */ }
    }
  }

  const db = getDb();
  const [session] = await db.insert(studioInterviewSessions).values({
    userId: user.sub,
    questionId: parsed.data.questionId,
    talkingPoints,
  } as any).returning();

  return c.json(ok({
    id: session.id,
    questionId: parsed.data.questionId,
    talkingPoints,
  }), 201);
});

// PATCH /api/studio/interview/session/:id — update session with recording + score
interviewRoutes.patch("/interview/session/:id", async (c) => {
  const user = c.var.user;
  const sessionId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    recordingId: UuidLikeSchema.optional(),
    coachingId: UuidLikeSchema.optional(),
    answer: z.string().optional(),
    isPublic: z.boolean().optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request"), 400);

  const db = getDb();
  const [updated] = await db.update(studioInterviewSessions).set({
    ...parsed.data,
  } as any)
    .where(and(eq(studioInterviewSessions.id, sessionId), eq(studioInterviewSessions.userId, user.sub)))
    .returning();

  if (!updated) return c.json(fail("NOT_FOUND", "Session not found"), 404);

  // If answer is provided, generate AI feedback
  if (parsed.data.answer && updated.questionId) {
    if (hasAnyLLMProviderKey(c.env)) {
      const [question] = await db.select().from(studioInterviewQuestions)
        .where(eq(studioInterviewQuestions.id, updated.questionId)).limit(1);

      if (question) {
        try {
          const llm = createLLMClient(c.env, c.var.user);
          const { content } = await llm.callText("studio_interview_score", {
            useCase: "interview_analyze",
            systemPrompt: `You are an interview coach. Score the candidate's answer to this interview question.
Return JSON: {"score": 0-100, "feedback": {"content": "...", "delivery": "...", "structure": "..."}}
Score 80+ is excellent, 60-79 is good, 40-59 needs work, below 40 is poor.`,
            userMessage: `Question: ${question.question}\n\nCandidate's answer:\n${parsed.data.answer.slice(0, 3000)}`,
          });
          const result = JSON.parse(content.replace(/```json?\s*/g, "").replace(/```/g, ""));
          await db.update(studioInterviewSessions).set({
            aiScore: result.score,
            aiFeedback: result.feedback,
          } as any).where(eq(studioInterviewSessions.id, sessionId));
        } catch { /* ignore */ }
      }
    }
  }

  return c.json(ok(updated));
});

// GET /api/studio/interview/sessions — list user's practice sessions
interviewRoutes.get("/interview/sessions", async (c) => {
  const user = c.var.user;
  const db = getDb();
  const sessions = await db.select().from(studioInterviewSessions)
    .where(eq(studioInterviewSessions.userId, user.sub))
    .orderBy(desc(studioInterviewSessions.createdAt))
    .limit(50);

  return c.json(ok(sessions));
});
