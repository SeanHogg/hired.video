/**
 * Typed client for AI interview practice (/api/interview): generate
 * questions, open a session, save an answer (optionally with its video),
 * score it (STAR feedback), close the session. The ONE place the practice
 * flow talks to the API — the coach hook (useInterviewPractice) never builds
 * a request itself.
 */
import { apiClient } from "@/lib/api-client";
import type { InterviewType, Question } from "@/lib/interview-practice/types";

export interface AnalyzedAnswer {
  score?: string;
  feedback?: unknown;
}

export const interviewPracticeService = {
  async generateQuestions(args: {
    jobDescription: string;
    type: InterviewType;
    resumeText?: string;
    count?: number;
  }): Promise<Question[]> {
    const res = await apiClient.post<{ questions: Question[] }>("/api/interview/questions", {
      jobDescription: args.jobDescription,
      type: args.type,
      count: args.count ?? 5,
      ...(args.resumeText ? { resumeText: args.resumeText.slice(0, 5000) } : {}),
    });
    return res.data.questions;
  },

  async createSession(args: { jobDescription: string; interviewType: InterviewType; questions: Question[] }): Promise<string> {
    const res = await apiClient.post<{ id: string }>("/api/interview/sessions", args);
    return res.data.id;
  },

  /** Save an answer; `video` rides as multipart when given. Returns its id. */
  async saveAnswer(
    sessionId: string,
    answer: { questionId: string; question: string; transcript: string; video?: Blob },
  ): Promise<string> {
    const { video, ...fields } = answer;
    const body: FormData | typeof fields = video
      ? (() => {
          const form = new FormData();
          form.append("questionId", fields.questionId);
          form.append("question", fields.question);
          form.append("transcript", fields.transcript);
          form.append("video", video, "answer.webm");
          return form;
        })()
      : fields;
    const res = await apiClient.request<{ id: string }>(`/api/interview/sessions/${sessionId}/answers`, {
      method: "POST",
      body,
    });
    return res.data.id;
  },

  async analyzeAnswer(answerId: string, jobDescription: string): Promise<AnalyzedAnswer> {
    const res = await apiClient.post<AnalyzedAnswer>(`/api/interview/answers/${answerId}/analyze`, { jobDescription });
    return res.data;
  },

  async completeSession(sessionId: string): Promise<void> {
    await apiClient.patch(`/api/interview/sessions/${sessionId}/complete`);
  },
};
