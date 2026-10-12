/**
 * Where an interview practice session starts: from nothing (the coach asks for
 * a job description and generates questions), or from questions another
 * surface already has (Interview Questions, an interview assignment) — then
 * the coach opens straight on the question preview. Pure.
 */
import type { GeneratedQuestion, PracticeHandoff } from "@/lib/services/interview-assignments-service";
import type { InterviewType, Question } from "@/lib/interview-practice/types";

export interface PracticeStart {
  /** The job (or role brief) the answers are scored against. */
  jobDescription: string;
  type: InterviewType;
  questions: Question[];
}

const TYPE_BY_CATEGORY: Record<GeneratedQuestion["category"], InterviewType> = {
  behavioral: "behavioral",
  technical: "technical",
  "system-design": "system-design",
  situational: "behavioral",
  "role-fit": "general",
};

/** The API scores against a job description of at least this length. */
const MIN_BRIEF = 20;

/** A practice start from questions generated elsewhere. The brief the answers
 *  are scored against is built from the hand-off's context and questions. */
export function practiceStartFromHandoff(handoff: PracticeHandoff): PracticeStart {
  const questions: Question[] = handoff.questions.map((q) => ({
    id: q.id,
    question: q.text,
    category: q.category,
    timeLimit: q.maxDurationSec,
  }));
  const context = [
    handoff.targetRole && `Target role: ${handoff.targetRole}`,
    handoff.seniority && `Seniority: ${handoff.seniority}`,
    handoff.sourceDescription && `Context: ${handoff.sourceDescription}`,
    handoff.skills?.length ? `Skills: ${handoff.skills.slice(0, 10).map((s) => s.name).join(", ")}` : null,
    `Questions:\n${handoff.questions.map((q, i) => `${i + 1}. ${q.text}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");
  const first = handoff.questions[0]?.category;
  const type: InterviewType =
    handoff.style === "technical" ? "technical" : handoff.style === "behavioral" ? "behavioral" : first ? TYPE_BY_CATEGORY[first] : "general";
  return {
    jobDescription: context.length >= MIN_BRIEF ? context.slice(0, 5000) : `Interview practice. ${context}`.padEnd(MIN_BRIEF, "."),
    type,
    questions,
  };
}
