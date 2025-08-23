import { z } from "zod";
import { apiClient } from "../api-client";

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
   * Analyze sentiment of raw text
   */
  async analyzeSentiment(text: string): Promise<number> {
    // SentimentController now returns ApiResponse<float> format
    const response = await apiClient.post<number>(
      "/sentiment/sentimentprediction",
      text,
      z.number()
    );

    return response.data;
  }

  /**
   * Analyze sentiment of existing resume by ID
   */
  async analyzeResumeSentiment(resumeId: string): Promise<number> {
    // The backend expects ApiResponse<float> format
    const response = await apiClient.post<{ data: number }>(
      "/api/Resume/SentimentPrediction",
      resumeId,
      z.object({ data: z.number() })
    );

    return response.data.data;
  }

  /**
   * Extract text from uploaded file and analyze sentiment
   */
  async analyzeFileSentiment(file: File): Promise<number> {
    // First, we need to extract text from the file
    // This would typically involve uploading the file and getting text back
    // For now, we'll simulate this process
    const formData = new FormData();
    formData.append("file", file);

    // Note: This endpoint would need to be created to handle file upload and text extraction
    // For now, we'll use a placeholder approach
    const text = await this.extractTextFromFile(file);
    return this.analyzeSentiment(text);
  }

  /**
   * Extract text from file (placeholder implementation)
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
        // For PDF and Word files, we'd need a proper text extraction service
        // For now, return a placeholder
        resolve("Sample resume text for demonstration purposes.");
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
