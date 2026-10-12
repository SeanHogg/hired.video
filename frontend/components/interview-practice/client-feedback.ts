// Client-side fallback feedback for an interview answer, used when the
// analyze endpoint is unavailable. Pure (aside from the injected `t`).

import type { TFunction } from "i18next";
import type { AnswerResult } from "@/lib/interview-practice/types";

export function canUploadVideo(): boolean {
  return false; // Disable video upload for now — transcripts only
}

export function buildClientFeedback(t: TFunction, question: string, transcript: string, questionId: string): AnswerResult {
  const wordCount = transcript.split(/\s+/).filter(Boolean).length;
  const hasNumbers = /\d/.test(transcript);
  const hasExample = /example|when i|i led|i built|i managed|project|result/i.test(transcript);
  const hasStar = /situation|task|action|result/i.test(transcript);
  const hasFillers = (transcript.match(/\b(um|uh|like|you know)\b/gi) ?? []).length;

  const clarity = Math.min(9.5, 5 + (wordCount > 60 ? 1.5 : 0) + (wordCount < 250 ? 0.5 : 0) - (hasFillers > 5 ? 1 : 0));
  const confidence = Math.min(9.5, 5.5 + (wordCount > 40 ? 0.8 : 0) - (hasFillers > 3 ? 0.5 : 0));
  const structure = Math.min(9.5, 5 + (hasStar ? 2 : hasExample ? 1 : 0));
  const relevance = Math.min(9.5, 5.5 + (hasExample ? 1.5 : 0));
  const impact = Math.min(9.5, 5 + (hasNumbers ? 2 : 0));

  const round = (n: number) => Math.round(n * 10) / 10;
  const score = round((clarity + confidence + structure + relevance + impact) / 5);

  return {
    answerId: "",
    questionId,
    score,
    scoreBreakdown: {
      clarity: round(clarity),
      confidence: round(confidence),
      structure: round(structure),
      relevance: round(relevance),
      impact: round(impact),
    },
    feedback: {
      strengths: [
        wordCount > 60 ? t("messages.interview.fbStrengthDetail") : t("messages.interview.fbStrengthDirect"),
        hasExample ? t("messages.interview.fbStrengthExample") : t("messages.interview.fbStrengthCore"),
        hasNumbers ? t("messages.interview.fbStrengthMetrics") : t("messages.interview.fbStrengthKnowledge"),
      ].slice(0, 2),
      improvements: [
        !hasStar ? t("messages.interview.fbImproveStar") : t("messages.interview.fbImproveStarGood"),
        !hasNumbers ? t("messages.interview.fbImproveNumbers") : t("messages.interview.fbImproveMoreMetrics"),
        hasFillers > 3 ? t("messages.interview.fbImproveFillers", { count: hasFillers }) : t("messages.interview.fbImprovePace"),
      ].filter(Boolean).slice(0, 3),
      suggestedAnswer: t("messages.interview.fbSuggestedAnswer"),
    },
    transcript,
  };
}
