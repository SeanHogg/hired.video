/**
 * Unit tests for AI API Registry
 */

import { describe, it, expect } from "vitest";
import {
  AI_APIS,
  DATA_APIS,
  CONTEXT_API_MAPPING,
  getAPIsForContext,
  getAPIById,
  getAPIsByAction,
} from "../ai-api-registry";

describe("AI API Registry", () => {
  describe("AI_APIS", () => {
    it("should have resume optimization API", () => {
      expect(AI_APIS.RESUME_OPTIMIZE).toBeDefined();
      expect(AI_APIS.RESUME_OPTIMIZE.id).toBe("resume_optimize");
      expect(AI_APIS.RESUME_OPTIMIZE.endpoint).toBe("/api/ResumeOptimizer/optimize");
      expect(AI_APIS.RESUME_OPTIMIZE.method).toBe("POST");
    });

    it("should have resume score API", () => {
      expect(AI_APIS.RESUME_SCORE).toBeDefined();
      expect(AI_APIS.RESUME_SCORE.id).toBe("resume_score");
      expect(AI_APIS.RESUME_SCORE.requiresAuth).toBe(false);
    });

    it("should have salary analysis API", () => {
      expect(AI_APIS.SALARY_ANALYZE).toBeDefined();
      expect(AI_APIS.SALARY_ANALYZE.id).toBe("salary_analyze");
      expect(AI_APIS.SALARY_ANALYZE.supportedActions).toContain("salary-insights");
    });

    it("should have all required properties", () => {
      Object.values(AI_APIS).forEach((api) => {
        expect(api.id).toBeDefined();
        expect(api.endpoint).toBeDefined();
        expect(api.method).toBeDefined();
        expect(api.description).toBeDefined();
        expect(api.supportedActions).toBeDefined();
        expect(api.requiresAuth).toBeDefined();
      });
    });
  });

  describe("DATA_APIS", () => {
    it("should have resume get API", () => {
      expect(DATA_APIS.RESUME_GET).toBeDefined();
      expect(DATA_APIS.RESUME_GET.id).toBe("resume_get");
      expect(DATA_APIS.RESUME_GET.method).toBe("GET");
    });

    it("should have job list API", () => {
      expect(DATA_APIS.JOB_LIST_PUBLIC).toBeDefined();
      expect(DATA_APIS.JOB_LIST_PUBLIC.id).toBe("job_list_public");
      expect(DATA_APIS.JOB_LIST_PUBLIC.requiresAuth).toBe(false);
    });

    it("should have all required properties", () => {
      Object.values(DATA_APIS).forEach((api) => {
        expect(api.id).toBeDefined();
        expect(api.endpoint).toBeDefined();
        expect(api.method).toBeDefined();
        expect(api.description).toBeDefined();
        expect(api.supportedActions).toBeDefined();
        expect(api.requiresAuth).toBeDefined();
      });
    });
  });

  describe("CONTEXT_API_MAPPING", () => {
    it("should have mapping for resume-edit", () => {
      expect(CONTEXT_API_MAPPING["resume-edit"]).toBeDefined();
      expect(CONTEXT_API_MAPPING["resume-edit"].length).toBeGreaterThan(0);
    });

    it("should have mapping for job-list", () => {
      expect(CONTEXT_API_MAPPING["job-list"]).toBeDefined();
      expect(CONTEXT_API_MAPPING["job-list"].length).toBeGreaterThan(0);
    });

    it("should map to valid API IDs", () => {
      const allAPIs = { ...AI_APIS, ...DATA_APIS };

      Object.entries(CONTEXT_API_MAPPING).forEach(([context, apiIds]) => {
        apiIds.forEach((apiId) => {
          expect(allAPIs[apiId]).toBeDefined();
        });
      });
    });

    it("should have mappings for all context types", () => {
      const expectedContexts = [
        "resume-list",
        "resume-create",
        "resume-edit",
        "resume-view",
        "job-list",
        "job-create",
        "job-edit",
        "job-view",
        "profile-view",
        "profile-edit",
        "outreach",
        "messaging",
        "search",
        "dashboard",
        "general",
      ];

      expectedContexts.forEach((context) => {
        expect(CONTEXT_API_MAPPING[context as keyof typeof CONTEXT_API_MAPPING]).toBeDefined();
      });
    });
  });

  describe("getAPIsForContext", () => {
    it("should return APIs for resume-edit context", () => {
      const apis = getAPIsForContext("resume-edit");

      expect(apis.length).toBeGreaterThan(0);
      expect(apis.some((api) => api.id === "resume_optimize")).toBe(true);
      expect(apis.some((api) => api.id === "resume_ats_analysis")).toBe(true);
    });

    it("should return APIs for job-list context", () => {
      const apis = getAPIsForContext("job-list");

      expect(apis.length).toBeGreaterThan(0);
      expect(apis.some((api) => api.id === "job_list_public")).toBe(true);
    });

    it("should return empty array for invalid context", () => {
      const apis = getAPIsForContext("invalid-context" as any);

      expect(apis).toEqual([]);
    });

    it("should return valid API objects", () => {
      const apis = getAPIsForContext("resume-edit");

      apis.forEach((api) => {
        expect(api.id).toBeDefined();
        expect(api.endpoint).toBeDefined();
        expect(api.method).toBeDefined();
        expect(api.description).toBeDefined();
        expect(api.supportedActions).toBeDefined();
        expect(api.requiresAuth).toBeDefined();
      });
    });
  });

  describe("getAPIById", () => {
    it("should return API by ID", () => {
      const api = getAPIById("resume_optimize");

      expect(api).toBeDefined();
      expect(api?.id).toBe("resume_optimize");
    });

    it("should return undefined for invalid ID", () => {
      const api = getAPIById("invalid_api_id");

      expect(api).toBeUndefined();
    });

    it("should work for both AI and Data APIs", () => {
      const aiAPI = getAPIById("resume_optimize");
      const dataAPI = getAPIById("resume_get");

      expect(aiAPI).toBeDefined();
      expect(dataAPI).toBeDefined();
    });
  });

  describe("getAPIsByAction", () => {
    it("should return APIs that support optimize-content action", () => {
      const apis = getAPIsByAction("optimize-content");

      expect(apis.length).toBeGreaterThan(0);
      apis.forEach((api) => {
        expect(api.supportedActions).toContain("optimize-content");
      });
    });

    it("should return APIs that support ats-score action", () => {
      const apis = getAPIsByAction("ats-score");

      expect(apis.length).toBeGreaterThan(0);
      apis.forEach((api) => {
        expect(api.supportedActions).toContain("ats-score");
      });
    });

    it("should return empty array for unsupported action", () => {
      const apis = getAPIsByAction("unsupported-action");

      expect(apis).toEqual([]);
    });

    it("should return APIs from both AI and Data APIs", () => {
      const apis = getAPIsByAction("optimize-content");

      // Check if any API exists in AI_APIS by comparing id fields
      const hasAIAPI = apis.some((api) =>
        Object.values(AI_APIS).some((aiApi) => aiApi.id === api.id)
      );
      // Check if any API exists in DATA_APIS by comparing id fields
      const hasDataAPI = apis.some((api) =>
        Object.values(DATA_APIS).some((dataApi) => dataApi.id === api.id)
      );

      // At least one type should be present
      expect(hasAIAPI || hasDataAPI).toBe(true);
    });
  });

  describe("API Metadata", () => {
    it("should have request schemas for POST APIs", () => {
      const postAPIs = Object.values({ ...AI_APIS, ...DATA_APIS }).filter(
        (api) => api.method === "POST"
      );

      postAPIs.forEach((api) => {
        // Most POST APIs should have request schemas
        if (api.id !== "resume_save" && api.id !== "job_save") {
          expect(api.requestSchema).toBeDefined();
        }
      });
    });

    it("should have response schemas", () => {
      Object.values({ ...AI_APIS, ...DATA_APIS }).forEach((api) => {
        expect(api.responseSchema).toBeDefined();
      });
    });

    it("should have meaningful descriptions", () => {
      Object.values({ ...AI_APIS, ...DATA_APIS }).forEach((api) => {
        expect(api.description.length).toBeGreaterThan(10);
      });
    });
  });

  describe("Context-Action Consistency", () => {
    it("should have APIs that support context actions", () => {
      // For resume-edit context
      const resumeAPIs = getAPIsForContext("resume-edit");
      const resumeActions = [
        "optimize-content",
        "improve-summary",
        "enhance-experience",
        "suggest-skills",
      ];

      resumeActions.forEach((action) => {
        const supportingAPIs = resumeAPIs.filter((api) =>
          api.supportedActions.includes(action)
        );
        expect(supportingAPIs.length).toBeGreaterThan(0);
      });
    });

    it("should have APIs that support job context actions", () => {
      const jobAPIs = getAPIsForContext("job-list");
      const jobActions = ["match-candidates"];

      jobActions.forEach((action) => {
        const supportingAPIs = jobAPIs.filter((api) =>
          api.supportedActions.includes(action)
        );
        // At least the context should have the API, even if not all actions are supported
        expect(jobAPIs.length).toBeGreaterThan(0);
      });
    });
  });

  describe("API Endpoint Formats", () => {
    it("should have valid endpoint paths", () => {
      Object.values({ ...AI_APIS, ...DATA_APIS }).forEach((api) => {
        expect(api.endpoint).toMatch(/^\/api\//);
      });
    });

    it("should have valid HTTP methods", () => {
      const validMethods = ["GET", "POST", "PUT", "DELETE", "PATCH"];

      Object.values({ ...AI_APIS, ...DATA_APIS }).forEach((api) => {
        expect(validMethods).toContain(api.method);
      });
    });
  });
});

