import { z } from "zod";
import { apiClient } from "../api-client";
import {
  ValuePropositionResponseSchema,
  type ValuePropositionResponse,
} from "@shared/tool-schemas";

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

export type ValuePropositionRequest = z.infer<
  typeof ValuePropositionRequestSchema
>;

// Response schema + type now live in shared/tool-schemas.ts so the
// backend and frontend share the same source of truth (roadmap #147).
export { ValuePropositionResponseSchema };
export type { ValuePropositionResponse };

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class ValuePropositionService {
  /**
   * Generate value proposition using job content and resume ID
   */
  async generateByJobContentResumeId(
    request: ValuePropositionRequest,
  ): Promise<ValuePropositionResponse> {
    const response = await apiClient.post<ValuePropositionResponse>(
      "/api/ValueProposition/generate/job-content-resume-id",
      request,
      ValuePropositionResponseSchema,
    );
    return response.data;
  }

  /**
   * Generate value proposition using job ID and resume ID
   */
  async generateByJobIdResumeId(
    request: ValuePropositionRequest,
  ): Promise<ValuePropositionResponse> {
    const response = await apiClient.post<ValuePropositionResponse>(
      "/api/ValueProposition/generate/job-id-resume-id",
      request,
      ValuePropositionResponseSchema,
    );
    return response.data;
  }

  /**
   * Generate value proposition using job content and resume content
   */
  async generateByContent(
    request: ValuePropositionRequest,
  ): Promise<ValuePropositionResponse> {
    const response = await apiClient.post<ValuePropositionResponse>(
      "/api/ValueProposition/generate/content",
      request,
      ValuePropositionResponseSchema,
    );
    return response.data;
  }

  /**
   * Helper method to determine which API endpoint to use based on input types
   */
  async generate(params: {
    jobId?: string;
    jobContent?: string;
    resumeId?: string;
    resumeContent?: string;
    companyName?: string;
    companyMission?: string;
    companyValues?: string;
  }): Promise<ValuePropositionResponse> {
    const { jobId, jobContent, resumeId, resumeContent, companyName, companyMission, companyValues } = params;

    // Validate inputs
    if (!jobId && !jobContent) {
      throw new Error("Either jobId or jobContent must be provided");
    }
    if (!resumeId && !resumeContent) {
      throw new Error("Either resumeId or resumeContent must be provided");
    }

    const companyInfo = { companyName, companyMission, companyValues };

    // Route to appropriate endpoint based on available data
    if (jobId && resumeId) {
      // Both IDs available - use job-id-resume-id endpoint
      return this.generateByJobIdResumeId({ jobId, resumeId, ...companyInfo });
    } else if (jobContent && resumeId) {
      // Job content + resume ID - use job-content-resume-id endpoint
      return this.generateByJobContentResumeId({ jobContent, resumeId, ...companyInfo });
    } else if (jobContent && resumeContent) {
      // Both content strings - use content endpoint
      return this.generateByContent({ jobContent, resumeContent, ...companyInfo });
    } else if (jobId && resumeContent) {
      // Job ID + resume content - use job-id-resume-content endpoint
      return this.generateByJobIdResumeContent({ jobId, resumeContent, ...companyInfo });
    } else {
      throw new Error("Invalid combination of parameters.");
    }
  }

  /**
   * Generate value proposition using job ID and resume content
   */
  async generateByJobIdResumeContent(
    request: ValuePropositionRequest,
  ): Promise<ValuePropositionResponse> {
    const response = await apiClient.post<ValuePropositionResponse>(
      "/api/ValueProposition/generate/job-id-resume-content",
      request,
      ValuePropositionResponseSchema,
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
    },
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
      if (file.type.startsWith("text/")) {
        reader.readAsText(file);
      } else {
        reject(
          new Error(
            "Unsupported file type. Please upload a text file or use the paste option.",
          ),
        );
      }
    });
  }
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const valuePropositionService = new ValuePropositionService();
export default valuePropositionService;
