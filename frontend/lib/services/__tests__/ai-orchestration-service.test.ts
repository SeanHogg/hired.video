/**
 * Unit tests for AI Orchestration Service
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { aiOrchestrationService } from "../ai-orchestration-service";
import type { AIContext } from "@/lib/types/ai-context";
import { createJobContext, createResumeContext } from "@/lib/utils/ai-context-helpers";

// Mock the API client
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("AIOrchestrationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Intent Analysis", () => {
    it("should detect resume data needs", () => {
      const service = aiOrchestrationService as any;
      const intent = service.analyzeIntent("Show me my resume", {} as AIContext);

      expect(intent.needsResumeData).toBe(true);
    });

    it("should detect optimization needs", () => {
      const service = aiOrchestrationService as any;
      const intent = service.analyzeIntent("How can I improve my resume?", {} as AIContext);

      expect(intent.needsOptimization).toBe(true);
    });

    it("should detect ATS score needs", () => {
      const service = aiOrchestrationService as any;
      const intent = service.analyzeIntent("What's my ATS score?", {} as AIContext);

      expect(intent.needsATSScore).toBe(true);
    });

    it("should detect job data needs", () => {
      const service = aiOrchestrationService as any;
      const intent = service.analyzeIntent("Show me available jobs", {} as AIContext);

      expect(intent.needsJobData).toBe(true);
    });

    it("should detect salary data needs", () => {
      const service = aiOrchestrationService as any;
      const intent = service.analyzeIntent("What's the salary for this position?", {} as AIContext);

      expect(intent.needsSalaryData).toBe(true);
    });

    it("should detect multiple intents", () => {
      const service = aiOrchestrationService as any;
      const intent = service.analyzeIntent(
        "Optimize my resume and check the ATS score",
        {} as AIContext
      );

      expect(intent.needsOptimization).toBe(true);
      expect(intent.needsATSScore).toBe(true);
    });
  });

  describe("API Planning", () => {
    it("should plan APIs based on action", () => {
      const context = createResumeContext("resume-edit");
      const service = aiOrchestrationService as any;

      const plans = service.planAPICalls(
        context,
        "Optimize my resume",
        "optimize-content"
      );

      expect(plans.length).toBeGreaterThan(0);
      expect(plans.some((p: any) => p.api.id === "resume_optimize")).toBe(true);
    });

    it("should plan APIs based on intent", () => {
      const context = createResumeContext("resume-edit");
      const service = aiOrchestrationService as any;

      const plans = service.planAPICalls(
        context,
        "What's my ATS score?",
        undefined
      );

      expect(plans.length).toBeGreaterThan(0);
      expect(plans.some((p: any) => p.api.id === "resume_score")).toBe(true);
    });

    it("should prioritize APIs correctly", () => {
      const context = createResumeContext("resume-edit");
      const service = aiOrchestrationService as any;

      const plans = service.planAPICalls(
        context,
        "Get my resume and optimize it",
        undefined
      );

      // Resume get should have higher priority (lower number) than optimize
      const getIndex = plans.findIndex((p: any) => p.api.id === "resume_get");
      const optimizeIndex = plans.findIndex((p: any) => p.api.id === "resume_optimize");

      if (getIndex !== -1 && optimizeIndex !== -1) {
        expect(plans[getIndex].priority).toBeLessThan(plans[optimizeIndex].priority);
      }
    });

    it("should only include APIs available in context", () => {
      const context = createJobContext("job-list");
      const service = aiOrchestrationService as any;

      const plans = service.planAPICalls(
        context,
        "Show me jobs",
        undefined
      );

      // All planned APIs should be in the context's availableAPIs
      plans.forEach((plan: any) => {
        expect(
          context.availableAPIs.some((api) => api.id === plan.api.id)
        ).toBe(true);
      });
    });
  });

  describe("Payload Building", () => {
    it("should build resume optimization payload", () => {
      const context = createResumeContext("resume-edit", {
        id: "123",
        title: "Software Engineer",
        summary: "Experienced developer",
        experience: [
          {
            title: "Senior Developer",
            company: "TechCorp",
            description: "Built amazing things",
            startDate: "2020-01-01",
            endDate: "2023-12-31",
          },
        ],
        skills: ["JavaScript", "TypeScript", "React"],
      });

      const service = aiOrchestrationService as any;
      const api = context.availableAPIs.find((a) => a.id === "resume_optimize");

      if (api) {
        const payload = service.buildPayload(api, context);
        expect(payload.resumeText).toBeDefined();
        expect(payload.resumeText).toContain("Software Engineer");
        expect(payload.resumeText).toContain("JavaScript");
      }
    });

    it("should build job list payload", () => {
      const context = createJobContext("job-list");
      const service = aiOrchestrationService as any;
      const api = context.availableAPIs.find((a) => a.id === "job_list_public");

      if (api) {
        const payload = service.buildPayload(api, context);
        expect(payload.page).toBe(1);
        expect(payload.limit).toBe(20);
      }
    });

    it("should extract resume text correctly", () => {
      const service = aiOrchestrationService as any;
      const resume = {
        title: "Software Engineer",
        summary: "Experienced developer",
        experience: [
          {
            title: "Senior Developer",
            company: "TechCorp",
            description: "Built amazing things",
          },
        ],
        skills: ["JavaScript", "TypeScript"],
      };

      const text = service.extractResumeText(resume);

      expect(text).toContain("Software Engineer");
      expect(text).toContain("Experienced developer");
      expect(text).toContain("Senior Developer");
      expect(text).toContain("TechCorp");
      expect(text).toContain("JavaScript");
    });
  });

  describe("Result Aggregation", () => {
    it("should aggregate successful results", () => {
      const context = createResumeContext("resume-edit");
      const service = aiOrchestrationService as any;

      const apiResults = [
        {
          api: { id: "resume_optimize", endpoint: "/api/ResumeOptimizer/optimize" },
          success: true,
          data: {
            result: {
              overallScore: 85,
              atsScore: 90,
            },
          },
        },
      ];

      const result = service.aggregateResults(apiResults, context, "Optimize my resume");

      expect(result.success).toBe(true);
      expect(result.message).toContain("85");
      expect(result.message).toContain("90");
      expect(result.apiCalls.length).toBe(1);
    });

    it("should handle failed API calls", () => {
      const context = createResumeContext("resume-edit");
      const service = aiOrchestrationService as any;

      const apiResults = [
        {
          api: { id: "resume_optimize", endpoint: "/api/ResumeOptimizer/optimize" },
          success: false,
          error: "API error",
        },
      ];

      const result = service.aggregateResults(apiResults, context, "Optimize my resume");

      expect(result.success).toBe(false);
      expect(result.message).toContain("failed");
    });

    it("should generate suggestions", () => {
      const context = createResumeContext("resume-edit");
      const service = aiOrchestrationService as any;

      const apiResults = [
        {
          api: { id: "resume_optimize", endpoint: "/api/ResumeOptimizer/optimize" },
          success: true,
          data: {
            result: {
              overallScore: 70,
              atsScore: 65,
            },
          },
        },
      ];

      const result = service.aggregateResults(apiResults, context, "Optimize my resume");

      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBeGreaterThan(0);
    });
  });

  describe("Context-Specific Behavior", () => {
    it("should handle resume context", () => {
      const context = createResumeContext("resume-edit");

      expect(context.contextType).toBe("resume-edit");
      expect(context.availableAPIs.length).toBeGreaterThan(0);
      expect(context.availableActions.length).toBeGreaterThan(0);
    });

    it("should handle job context", () => {
      const context = createJobContext("job-list");

      expect(context.contextType).toBe("job-list");
      expect(context.availableAPIs.length).toBeGreaterThan(0);
      expect(context.availableActions.length).toBeGreaterThan(0);
    });

    it("should have different APIs for different contexts", () => {
      const resumeContext = createResumeContext("resume-edit");
      const jobContext = createJobContext("job-list");

      const resumeAPIIds = resumeContext.availableAPIs.map((a) => a.id);
      const jobAPIIds = jobContext.availableAPIs.map((a) => a.id);

      // Should have some different APIs
      const allSame = resumeAPIIds.every((id) => jobAPIIds.includes(id));
      expect(allSame).toBe(false);
    });
  });

  describe("Error Handling", () => {
    it("should handle empty context gracefully", () => {
      const service = aiOrchestrationService as any;
      const context = createResumeContext("resume-edit");
      context.availableAPIs = [];

      const plans = service.planAPICalls(context, "Optimize my resume", undefined);

      expect(plans).toEqual([]);
    });

    it("should handle invalid resume data", () => {
      const service = aiOrchestrationService as any;
      const text = service.extractResumeText(null);

      expect(text).toBe("");
    });

    it("should handle missing API in context", () => {
      const context = createResumeContext("resume-edit");
      const service = aiOrchestrationService as any;

      const plans = service.planAPICalls(
        context,
        "Test message",
        undefined,
        ["non_existent_api"]
      );

      expect(plans.length).toBe(0);
    });
  });
});

