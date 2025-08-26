import { z } from "zod";
import { apiClient } from "../api-client";

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

export const ValuePropositionRequestSchema = z.object({
  jobId: z.string().optional(),
  jobContent: z.string().optional(),
  resumeId: z.string().optional(),
  resumeContent: z.string().optional(),
  companyName: z.string().optional(),
  companyMission: z.string().optional(),
  companyValues: z.string().optional(),
});

export const ValuePropositionResponseSchema = z.object({
  valueProposition: z.string(),
  executiveSummary: z.string(),
  keyStrengths: z.array(z.string()),
  alignmentPoints: z.array(z.string()),
  callToAction: z.string(),
  confidenceScore: z.number(),
});

export type ValuePropositionRequest = z.infer<typeof ValuePropositionRequestSchema>;
export type ValuePropositionResponse = z.infer<typeof ValuePropositionResponseSchema>;

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class ValuePropositionService {
  /**
   * Generate value proposition using job content and resume ID
   */
  async generateByJobContentResumeId(request: ValuePropositionRequest): Promise<ValuePropositionResponse> {
    const response = await apiClient.post<ValuePropositionResponse>(
      "/api/ValueProposition/generate/job-content-resume-id",
      request,
      ValuePropositionResponseSchema
    );
    return response.data;
  }

  /**
   * Generate value proposition using job ID and resume ID
   */
  async generateByJobIdResumeId(request: ValuePropositionRequest): Promise<ValuePropositionResponse> {
    const response = await apiClient.post<ValuePropositionResponse>(
      "/api/ValueProposition/generate/job-id-resume-id",
      request,
      ValuePropositionResponseSchema
    );
    return response.data;
  }

  /**
   * Generate value proposition using job content and resume content
   */
  async generateByContent(request: ValuePropositionRequest): Promise<ValuePropositionResponse> {
    const response = await apiClient.post<ValuePropositionResponse>(
      "/api/ValueProposition/generate/content",
      request,
      ValuePropositionResponseSchema
    );
    return response.data;
  }

  /**
   * Generate value proposition with file upload support
   */
  async generateWithFile(
    resumeFile: File,
    jobContent: string,
    companyInfo?: {
      name?: string;
      mission?: string;
      values?: string;
    }
  ): Promise<ValuePropositionResponse> {
    // First, extract text from the resume file
    const resumeContent = await this.extractTextFromFile(resumeFile);
    
    // Then generate the value proposition
    return this.generateByContent({
      jobContent,
      resumeContent,
      companyName: companyInfo?.name,
      companyMission: companyInfo?.mission,
      companyValues: companyInfo?.values,
    });
  }

  /**
   * Extract text from uploaded file (basic client-side extraction)
   */
  private async extractTextFromFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (event) => {
        const text = event.target?.result as string;
        resolve(text);
      };
      
      reader.onerror = () => {
        reject(new Error("Failed to read file"));
      };
      
      // For now, only handle text files
      // In a production app, you'd want to handle PDF, DOCX, etc.
      if (file.type.startsWith('text/')) {
        reader.readAsText(file);
      } else {
        reject(new Error("Unsupported file type. Please upload a text file or use the paste option."));
      }
    });
  }
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const valuePropositionService = new ValuePropositionService();
export default valuePropositionService;
