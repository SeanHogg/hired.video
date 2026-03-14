import { z } from "zod";
import { apiClient } from "../api-client";
import { resumeService } from "./resume-service";
import type { Resume } from "@/types/resume";

// Schema for sentiment analysis response
export const SentimentAnalysisResponseSchema = z.object({
  score: z.number().min(0).max(100),
});

export type SentimentAnalysisResponse = z.infer<
  typeof SentimentAnalysisResponseSchema
>;

// Schema for sentiment interpretation
export interface SentimentInterpretation {
  label: "Negative" | "Neutral" | "Positive";
  color: "red" | "yellow" | "green";
  description: string;
  recommendations: string[];
}

export class SentimentService {
  /**
   * Analyze sentiment of raw text using the Sentiment API controller
   * Route: /sentiment/sentimentprediction
   * Note: The endpoint expects a JSON-encoded string body (e.g., "text" with quotes)
   */
  async analyzeSentiment(text: string): Promise<number> {
    // The backend expects [FromBody] string, which requires a JSON-encoded string
    // Since apiClient passes strings as-is, we need to JSON.stringify the string
    // The API returns { success: true, data: float } and apiClient unwraps it
    const response = await apiClient.post<number>(
      "/sentiment/sentimentprediction",
      JSON.stringify(text), // This produces "text" with quotes for proper JSON
      z.number(),
    );
    return response.data;
  }

  /**
   * Analyze an uploaded file by extracting its text client-side (basic) and sending it
   * to the sentiment endpoint. If you’d prefer server-side extraction, we can switch this
   * to upload the file first and use a server endpoint to extract and score.
   */
  async analyzeFileSentiment(file: File): Promise<number> {
    const text = await this.extractTextFromFile(file);
    return this.analyzeSentiment(text);
  }

  /**
   * Analyze an existing resume using the dedicated resume sentiment endpoint
   * Route: /api/Resume/SentimentPrediction
   * Note: The endpoint expects a JSON-encoded string body (e.g., "resumeId" with quotes)
   */
  async analyzeResumeSentiment(resumeId: string): Promise<number> {
    // The backend expects [FromBody] string id, which requires a JSON-encoded string
    // Since apiClient passes strings as-is, we need to JSON.stringify the string
    // The API returns { success: true, data: float } and apiClient unwraps it
    const response = await apiClient.post<number>(
      "/api/Resume/SentimentPrediction",
      JSON.stringify(resumeId), // This produces "resumeId" with quotes
      z.number(),
    );
    return response.data;
  }

  /**
   * Extract text from file (basic implementation)
   */
  private async extractTextFromFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        resolve(text || "");
      };
      reader.onerror = () => reject(new Error("Failed to read file"));

      if (file.type === "text/plain") {
        reader.readAsText(file);
      } else {
        // For non-plain text, return empty (backend expects text input)
        resolve("");
      }
    });
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

  /**
   * Get color class for sentiment score
   */
  getScoreColorClass(score: number): string {
    const interpretation = this.interpretSentiment(score);
    switch (interpretation.color) {
      case "red":
        return "text-red-600 bg-red-50 border-red-200";
      case "yellow":
        return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "green":
        return "text-green-600 bg-green-50 border-green-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  }

  /**
   * Get progress bar color for sentiment score
   */
  getProgressBarColor(score: number): string {
    const interpretation = this.interpretSentiment(score);
    switch (interpretation.color) {
      case "red":
        return "bg-red-500";
      case "yellow":
        return "bg-yellow-500";
      case "green":
        return "bg-green-500";
      default:
        return "bg-gray-500";
    }
  }
}

// Export singleton instance
export const sentimentService = new SentimentService();
