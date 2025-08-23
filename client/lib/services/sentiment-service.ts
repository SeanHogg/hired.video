import { z } from "zod";
import { apiClient } from "../api-client";
import { resumeService } from "./resume-service";
import type { Resume } from "@/types/resume";


// Schema for sentiment analysis response
export const SentimentAnalysisResponseSchema = z.object({
  score: z.number().min(0).max(100),
});

export type SentimentAnalysisResponse = z.infer<typeof SentimentAnalysisResponseSchema>;

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
   * Route (as required): /api/sentiment/sentimentprediction
   */
  async analyzeSentiment(text: string): Promise<number> {
    const response = await apiClient.post<number>(
      "/api/sentiment/sentimentprediction",
      text,
      z.number()
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
   * Analyze an existing resume by first fetching it and sending its summary text.
   * If the backend exposes a direct resume sentiment route, we can switch to it.
   */
  async analyzeResumeSentiment(resumeId: string): Promise<number> {
    // Fetch the resume and derive text content to send to the sentiment endpoint
    const resume = await resumeService.getResumeById(resumeId);
    const r: any = resume as any;

    // Prefer server-provided serialized text if available
    if (r?.resumeSerialized && typeof r.resumeSerialized === "string") {
      return this.analyzeSentiment(r.resumeSerialized);
    }

    const parts: string[] = [];

    // New metaResume shape
    const basics = r?.metaResume?.basics;
    if (basics?.label) parts.push(String(basics.label));
    if (basics?.summary) parts.push(String(basics.summary));

    const work = r?.metaResume?.work as any[] | undefined;
    if (Array.isArray(work)) {
      for (const w of work) {
        if (w?.position) parts.push(String(w.position));
        if (w?.summary) parts.push(String(w.summary));
        if (Array.isArray(w?.highlights)) parts.push(...w.highlights.map((h: any) => String(h)));
      }
    }

    // Legacy data shape (capitalized keys)
    const legacyBasics = r?.data?.Basics;
    if (legacyBasics?.Label) parts.push(String(legacyBasics.Label));
    if (legacyBasics?.Summary) parts.push(String(legacyBasics.Summary));
    const legacyWork = r?.data?.Work as any[] | undefined;
    if (Array.isArray(legacyWork)) {
      for (const w of legacyWork) {
        if (w?.Position) parts.push(String(w.Position));
        if (w?.Summary) parts.push(String(w.Summary));
        if (Array.isArray(w?.Highlights)) parts.push(...w.Highlights.map((h: any) => String(h)));
      }
    }

    const text = parts.filter(Boolean).join("\n").trim();
    if (!text) {
      // As a last resort, send the name to avoid empty body; backend should handle
      const fallback = basics?.name || legacyBasics?.Name || "";
      return this.analyzeSentiment(String(fallback));
    }

    return this.analyzeSentiment(text);
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
        description: "Your resume has a negative tone that may discourage employers.",
        recommendations: [
          "Use more positive and action-oriented language",
          "Replace negative words with neutral or positive alternatives",
          "Focus on achievements and accomplishments rather than duties",
          "Add quantifiable results and metrics to showcase success",
          "Consider using power words that convey confidence and capability"
        ]
      };
    } else if (score >= 31 && score <= 60) {
      return {
        label: "Neutral",
        color: "yellow",
        description: "Your resume has a neutral tone. There's room for improvement to make it more engaging.",
        recommendations: [
          "Add more dynamic action verbs to describe your experiences",
          "Include specific achievements and quantifiable results",
          "Use more engaging language to describe your skills and accomplishments",
          "Consider adding testimonials or quotes from supervisors",
          "Highlight your unique value proposition more clearly"
        ]
      };
    } else {
      return {
        label: "Positive",
        color: "green",
        description: "Excellent! Your resume has a positive tone that will appeal to employers.",
        recommendations: [
          "Maintain this positive tone throughout your resume",
          "Continue to use strong action verbs and achievement-focused language",
          "Consider this resume as a template for future applications",
          "Share your approach with others who might benefit",
          "Keep updating with new achievements using the same positive tone"
        ]
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
