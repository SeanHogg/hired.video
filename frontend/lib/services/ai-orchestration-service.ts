/**
 * AI Orchestration Service
 * 
 * Orchestrates multiple API calls based on AI context to provide intelligent,
 * context-aware responses. Acts as the "brain" that decides which APIs to call
 * and how to aggregate their results.
 */

import type { AIContext, AIAction, AvailableAPI } from "@/lib/types/ai-context";
import { apiClient } from "@/lib/api-client";
import { getAPIById, getAPIsByAction } from "@/lib/config/ai-api-registry";
import { buildEndpointUrl } from "@shared/ai-tools";

// ============================================================================
// TYPES
// ============================================================================

export interface OrchestrationRequest {
  context: AIContext;
  userMessage: string;
  action?: AIAction;
  specificAPIs?: string[]; // Optional: specify which APIs to call
}

export interface OrchestrationResult {
  success: boolean;
  message: string;
  data?: Record<string, any>;
  apiCalls: Array<{
    apiId: string;
    endpoint: string;
    success: boolean;
    data?: any;
    error?: string;
  }>;
  suggestions?: string[];
}

interface APICallPlan {
  api: AvailableAPI;
  payload: any;
  priority: number; // Lower number = higher priority
}

// ============================================================================
// AI ORCHESTRATION SERVICE
// ============================================================================

class AIOrchestrationService {
  /**
   * Orchestrate API calls based on context and user intent
   */
  async orchestrate(request: OrchestrationRequest): Promise<OrchestrationResult> {
    const { context, userMessage, action, specificAPIs } = request;

    // Step 1: Determine which APIs to call
    const apiCallPlan = this.planAPICalls(context, userMessage, action, specificAPIs);

    if (apiCallPlan.length === 0) {
      return {
        success: false,
        message: "No relevant APIs found for this request.",
        apiCalls: [],
      };
    }

    // Step 2: Execute API calls in priority order
    const apiResults = await this.executeAPICalls(apiCallPlan, context);

    // Step 3: Aggregate results and generate response
    const aggregatedResult = this.aggregateResults(apiResults, context, userMessage);

    return aggregatedResult;
  }

  /**
   * Plan which APIs to call based on context and intent
   */
  private planAPICalls(
    context: AIContext,
    userMessage: string,
    action?: AIAction,
    specificAPIs?: string[],
  ): APICallPlan[] {
    const plans: APICallPlan[] = [];

    // If specific APIs are requested, use those
    if (specificAPIs && specificAPIs.length > 0) {
      specificAPIs.forEach((apiId, index) => {
        const api = getAPIById(apiId);
        if (api) {
          plans.push({
            api,
            payload: this.buildPayload(api, context),
            priority: index,
          });
        }
      });
      return plans;
    }

    // If action is specified, find APIs that support it
    if (action) {
      const apis = getAPIsByAction(action);
      apis.forEach((api, index) => {
        // Only include APIs available in this context
        if (context.availableAPIs.some((a) => a.id === api.id)) {
          plans.push({
            api,
            payload: this.buildPayload(api, context),
            priority: index,
          });
        }
      });
    }

    // Analyze user message to determine intent
    const intent = this.analyzeIntent(userMessage, context);

    // Add APIs based on intent
    if (intent.needsResumeData && context.contextType.startsWith("resume")) {
      const resumeGetAPI = context.availableAPIs.find((api) => api.id === "resume-get");
      if (resumeGetAPI && !plans.some((p) => p.api.id === resumeGetAPI.id)) {
        plans.push({
          api: resumeGetAPI,
          payload: this.buildPayload(resumeGetAPI, context),
          priority: 0,
        });
      }
    }

    if (intent.needsOptimization && context.contextType.startsWith("resume")) {
      const optimizeAPI = context.availableAPIs.find((api) => api.id === "resume-optimize");
      if (optimizeAPI && !plans.some((p) => p.api.id === optimizeAPI.id)) {
        plans.push({
          api: optimizeAPI,
          payload: this.buildPayload(optimizeAPI, context),
          priority: 1,
        });
      }
    }

    if (intent.needsATSScore && context.contextType.startsWith("resume")) {
      // The score endpoint returns ATS + content + keyword + format +
      // impact subscores in one call (ats-analysis got merged into it).
      const scoreAPI = context.availableAPIs.find((api) => api.id === "resume-score");
      if (scoreAPI && !plans.some((p) => p.api.id === scoreAPI.id)) {
        plans.push({
          api: scoreAPI,
          payload: this.buildPayload(scoreAPI, context),
          priority: 1,
        });
      }
    }

    if (intent.needsJobData && context.contextType.startsWith("job")) {
      const jobListAPI = context.availableAPIs.find((api) => api.id === "job-list-public");
      if (jobListAPI && !plans.some((p) => p.api.id === jobListAPI.id)) {
        plans.push({
          api: jobListAPI,
          payload: this.buildPayload(jobListAPI, context),
          priority: 0,
        });
      }
    }

    if (intent.needsSalaryData) {
      const salaryAPI = context.availableAPIs.find((api) => api.id === "salary-analyze");
      if (salaryAPI && !plans.some((p) => p.api.id === salaryAPI.id)) {
        plans.push({
          api: salaryAPI,
          payload: this.buildPayload(salaryAPI, context),
          priority: 2,
        });
      }
    }

    // Sort by priority
    return plans.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Analyze user message to determine intent
   */
  private analyzeIntent(message: string, context: AIContext) {
    const lowerMessage = message.toLowerCase();

    return {
      needsResumeData:
        lowerMessage.includes("resume") ||
        lowerMessage.includes("my experience") ||
        lowerMessage.includes("my skills"),
      needsOptimization:
        lowerMessage.includes("optimize") ||
        lowerMessage.includes("improve") ||
        lowerMessage.includes("enhance") ||
        lowerMessage.includes("better"),
      needsATSScore:
        lowerMessage.includes("ats") ||
        lowerMessage.includes("score") ||
        lowerMessage.includes("rating") ||
        lowerMessage.includes("applicant tracking"),
      needsJobData:
        lowerMessage.includes("job") ||
        lowerMessage.includes("position") ||
        lowerMessage.includes("opening") ||
        lowerMessage.includes("match"),
      needsSalaryData:
        lowerMessage.includes("salary") ||
        lowerMessage.includes("compensation") ||
        lowerMessage.includes("pay") ||
        lowerMessage.includes("wage"),
    };
  }

  /**
   * Build API payload based on context
   */
  private buildPayload(api: AvailableAPI, context: AIContext): any {
    const payload: any = {};

    // Resume-related payloads — every resume_* API takes resumeText
    // (merged endpoint, see services/resume/analyze.ts).
    if (api.id.startsWith("resume-") && "resume" in context) {
      payload.resumeText = this.extractResumeText(context.resume);
    }

    // Job-related payloads
    if (api.id.startsWith("job-") && "job" in context) {
      if (api.id === "job-list-public") {
        payload.page = 1;
        payload.limit = 20;
      }
    }

    // Salary-related payloads
    if (api.id.startsWith("salary-") && "job" in context) {
      if (api.id === "salary-analyze") {
        payload.jobTitle = context.job?.title || "";
        payload.location = context.job?.location || "";
        payload.experienceYears = 5; // Default, should be extracted from context
      }
    }

    return payload;
  }

  /**
   * Extract resume text from resume object
   */
  private extractResumeText(resume: any): string {
    if (!resume) return "";

    const parts: string[] = [];

    if (resume.title) parts.push(resume.title);
    if (resume.summary) parts.push(resume.summary);
    if (resume.experience) {
      resume.experience.forEach((exp: any) => {
        if (exp.title) parts.push(exp.title);
        if (exp.company) parts.push(exp.company);
        if (exp.description) parts.push(exp.description);
      });
    }
    if (resume.skills) {
      parts.push(resume.skills.join(", "));
    }

    return parts.join("\n\n");
  }

  /**
   * Execute API calls
   */
  private async executeAPICalls(
    plans: APICallPlan[],
    context: AIContext,
  ): Promise<Array<{ api: AvailableAPI; success: boolean; data?: any; error?: string }>> {
    const results = [];

    for (const plan of plans) {
      try {
        const response = await this.callAPI(plan.api, plan.payload, context);
        results.push({
          api: plan.api,
          success: true,
          data: response,
        });
      } catch (error) {
        results.push({
          api: plan.api,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return results;
  }

  /** Resolve `:id` placeholders in a tool endpoint from the current
   *  page context. Falls back to whatever id the context exposes
   *  (resume / job / task / user) — the planner only schedules an
   *  entity-bound tool when the matching entity is loaded, so this
   *  cannot leak the wrong id across kinds. */
  private resolvePathParams(context: AIContext): Record<string, string | number> {
    const params: Record<string, string | number> = {};
    const ctx = context as Record<string, any>;
    if (ctx.resume?.id) params.id = ctx.resume.id;
    else if (ctx.job?.id) params.id = ctx.job.id;
    else if (ctx.task?.id) params.id = ctx.task.id;
    return params;
  }

  /**
   * Call a single API
   */
  private async callAPI(api: AvailableAPI, payload: any, context: AIContext): Promise<any> {
    const method = api.method.toLowerCase();
    // Substitute `:param` placeholders from the page context. Plain
    // paths (no placeholders) pass through buildEndpointUrl unchanged.
    const url = buildEndpointUrl(api.endpoint, this.resolvePathParams(context));

    if (method === "get") {
      const response = await apiClient.get(url);
      return response.data;
    } else if (method === "post") {
      const response = await apiClient.post(url, payload);
      return response.data;
    } else if (method === "put") {
      const response = await apiClient.put(url, payload);
      return response.data;
    } else if (method === "delete") {
      const response = await apiClient.delete(url);
      return response.data;
    }

    throw new Error(`Unsupported HTTP method: ${api.method}`);
  }

  /**
   * Aggregate results from multiple API calls
   */
  private aggregateResults(
    apiResults: Array<{ api: AvailableAPI; success: boolean; data?: any; error?: string }>,
    context: AIContext,
    userMessage: string,
  ): OrchestrationResult {
    const successfulCalls = apiResults.filter((r) => r.success);
    const failedCalls = apiResults.filter((r) => !r.success);

    if (successfulCalls.length === 0) {
      return {
        success: false,
        message: "All API calls failed. Please try again.",
        apiCalls: apiResults.map((r) => ({
          apiId: r.api.id,
          endpoint: r.api.endpoint,
          success: r.success,
          data: r.data,
          error: r.error,
        })),
      };
    }

    // Build aggregated response message
    let message = "";
    const aggregatedData: Record<string, any> = {};

    successfulCalls.forEach((result) => {
      aggregatedData[result.api.id] = result.data;
    });

    // Generate contextual message based on results
    const successfulCallsWithData: Array<{ api: AvailableAPI; data: any }> = successfulCalls
      .filter(r => r.success && r.data !== undefined)
      .map(r => ({ api: r.api, data: r.data! }));
    message = this.generateResponseMessage(successfulCallsWithData, context, userMessage);

    return {
      success: true,
      message,
      data: aggregatedData,
      apiCalls: apiResults.map((r) => ({
        apiId: r.api.id,
        endpoint: r.api.endpoint,
        success: r.success,
        data: r.data,
        error: r.error,
      })),
      suggestions: this.generateSuggestions(successfulCallsWithData, context),
    };
  }

  /**
   * Generate response message based on API results
   */
  private generateResponseMessage(
    results: Array<{ api: AvailableAPI; data: any }>,
    context: AIContext,
    userMessage: string,
  ): string {
    // This is a simplified version - in production, this would use AI to generate natural language
    const messages: string[] = [];

    results.forEach((result) => {
      if (
        (result.api.id === "resume-optimize" || result.api.id === "resume-score") &&
        result.data?.result
      ) {
        messages.push(
          `Your resume has an overall score of ${result.data.result.overallScore}/100 with an ATS score of ${result.data.result.atsScore}/100.`,
        );
      }

      if (result.api.id === "job-list-public" && result.data?.result) {
        messages.push(`Found ${result.data.result.total} job openings that might interest you.`);
      }

      if (result.api.id === "salary-analyze" && result.data?.result) {
        messages.push(
          `Salary Analysis: The median salary for this position is $${result.data.result.medianSalary}.`,
        );
      }
    });

    return messages.join(" ");
  }

  /**
   * Generate suggestions for next actions
   */
  private generateSuggestions(
    results: Array<{ api: AvailableAPI; data: any }>,
    context: AIContext,
  ): string[] {
    const suggestions: string[] = [];

    results.forEach((result) => {
      if (result.api.id === "resume-optimize" && result.data?.result?.overallScore < 80) {
        suggestions.push("Consider improving your resume to increase your ATS score");
      }

      if (result.api.id === "job-list-public") {
        suggestions.push("Would you like me to match these jobs with your resume?");
      }
    });

    return suggestions;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const aiOrchestrationService = new AIOrchestrationService();

export type { APICallPlan };

