import { apiClient } from "../api-client";
import { getResumeTextFromFile } from "./resume-text";
import type { Resume } from "@/types/resume";
import {
  SentimentResponseSchema as SentimentAnalysisResponseSchema,
  type SentimentResponse as SentimentAnalysisResponse,
} from "@shared/tool-schemas";

// Re-exports preserved for existing imports across the app.
export { SentimentAnalysisResponseSchema };
export type { SentimentAnalysisResponse };

// Schema for sentiment interpretation
export interface SentimentInterpretation {
  label: "Negative" | "Neutral" | "Positive";
  color: "red" | "yellow" | "green";
  description: string;
  recommendations: string[];
}

export class SentimentService {
  /**
   * Analyze sentiment of raw text using the Sentiment API controller.
   * Route: /sentiment/sentimentprediction
   *
   * Response shape: `{ success: true, data: { score: number } }`. The
   * server used to return a raw number as `data`, but the envelope
   * contract now guarantees `data` is always an object (roadmap #147).
   */
  async analyzeSentiment(text: string): Promise<number> {
    const response = await apiClient.post<SentimentAnalysisResponse>(
      "/sentiment/sentimentprediction",
      JSON.stringify(text),
      SentimentAnalysisResponseSchema,
    );
    return response.data.score;
  }

  /**
   * Analyze an uploaded file: read its text through the shared résumé reader
   * (client extraction, server extractor / OCR fallback for photos, scans and
   * files the browser can't read — #2229), then score it.
   */
  async analyzeFileSentiment(file: File): Promise<number> {
    const text = await getResumeTextFromFile(file);
    if (!text.trim()) throw new Error("No readable text in the uploaded file.");
    return this.analyzeSentiment(text);
  }

  /**
   * Analyze an existing resume using the dedicated resume sentiment endpoint.
   * Route: /api/Resume/SentimentPrediction
   *
   * Body: `{ resumeId }` — the server loads the resume by id and scores
   * its rendered content. Sending a bare string here used to make the
   * backend score the UUID itself, which was the 2026-05-04 regression.
   *
   * Response shape: `{ success: true, data: { score: number } }`.
   */
  async analyzeResumeSentiment(resumeId: string): Promise<number> {
    const response = await apiClient.post<SentimentAnalysisResponse>(
      "/api/Resume/SentimentPrediction",
      { resumeId },
      SentimentAnalysisResponseSchema,
    );
    return response.data.score;
  }

  /**
   * Analyze a saved job using the job sentiment endpoint.
   * Route: /api/jobs/sentimentprediction
   *
   * Body: `{ jobId }`. The server loads the job and scores its
   * rendered text via the same shared `scoreSentiment` function as the
   * resume path — so a job and a resume with identical text score
   * identically (cross-route contract, see api tests).
   *
   * Response shape: `{ success: true, data: { score: number } }`.
   */
  async analyzeJobSentiment(jobId: string): Promise<number> {
    const response = await apiClient.post<SentimentAnalysisResponse>(
      "/api/jobs/sentimentprediction",
      { jobId },
      SentimentAnalysisResponseSchema,
    );
    return response.data.score;
  }

  /**
   * Interpret sentiment score and provide recommendations
   */
  interpretSentiment(score: number): SentimentInterpretation {
    if (score >= 0 && score <= 30) {
      return {
        label: "Negative",
        color: "red",
        description:
          "Your resume has a negative tone that may discourage employers.",
        recommendations: [
          "Use more positive and action-oriented language",
          "Replace negative words with neutral or positive alternatives",
          "Focus on achievements and accomplishments rather than duties",
          "Add quantifiable results and metrics to showcase success",
          "Consider using power words that convey confidence and capability",
        ],
      };
    } else if (score >= 31 && score <= 60) {
      return {
        label: "Neutral",
        color: "yellow",
        description:
          "Your resume has a neutral tone. There's room for improvement to make it more engaging.",
        recommendations: [
          "Add more dynamic action verbs to describe your experiences",
          "Include specific achievements and quantifiable results",
          "Use more engaging language to describe your skills and accomplishments",
          "Consider adding testimonials or quotes from supervisors",
          "Highlight your unique value proposition more clearly",
        ],
      };
    } else {
      return {
        label: "Positive",
        color: "green",
        description:
          "Excellent! Your resume has a positive tone that will appeal to employers.",
        recommendations: [
          "Maintain this positive tone throughout your resume",
          "Continue to use strong action verbs and achievement-focused language",
          "Consider this resume as a template for future applications",
          "Share your approach with others who might benefit",
          "Keep updating with new achievements using the same positive tone",
        ],
      };
    }
  }
}

// Export singleton instance
export const sentimentService = new SentimentService();
