// Domain types for the /interview practice flow (setup → preview →
// recording → analyzing → results). Shared by the page orchestrator and
// every step component.

export interface Question {
  id: string;
  question: string;
  category: string;
  timeLimit: number;
}

export interface ScoreBreakdown {
  clarity: number;
  confidence: number;
  structure: number;
  relevance: number;
  impact: number;
}

export interface Feedback {
  strengths: string[];
  improvements: string[];
  suggestedAnswer: string;
}

export interface AnswerResult {
  answerId: string;
  questionId: string;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  feedback: Feedback;
  transcript: string;
}

export type InterviewType = "behavioral" | "technical" | "system-design" | "product" | "general";

export type InterviewStep = "setup" | "preview" | "recording" | "analyzing" | "results";
