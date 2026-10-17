/**
 * Tests for the frontend AI API registry compat shim.
 *
 * The authoritative registry lives in [shared/ai-tools/](../../../../shared/ai-tools/);
 * this file's `getAPIById` / `getAPIsByAction` / `getAPIsForContext`
 * adapt the shared `AIToolDef` to the legacy `AvailableAPI` shape the
 * orchestrator expects.
 *
 * This replaces the prior test which locked the broken legacy
 * endpoints (`/api/Resume/{id}`, `/api/SalaryAnalyzer/analyze`, ...)
 * that don't exist on the current Hono backend. Those endpoints were
 * corrected as part of gap #1623's partial close.
 */

import { describe, it, expect } from "vitest";
import {
  getAPIById,
  getAPIsByAction,
  getAPIsForContext,
} from "../ai-api-registry";

describe("frontend ai-api-registry (compat shim)", () => {
  describe("getAPIById", () => {
    it("returns the optimize tool", () => {
      const api = getAPIById("resume-optimize");
      expect(api).toBeDefined();
      expect(api?.id).toBe("resume-optimize");
      expect(api?.endpoint).toBe("/api/ai/tools/resume-optimize");
      expect(api?.method).toBe("POST");
    });

    it("returns undefined for unknown id (preserves legacy contract)", () => {
      expect(getAPIById("not-a-real-tool")).toBeUndefined();
    });

    it("returns the salary-analyze tool on the AI tool dispatcher", () => {
      const api = getAPIById("salary-analyze");
      expect(api?.endpoint).toBe("/api/ai/tools/salary-analyze");
    });

    it("returns the resume-get tool with :id placeholder", () => {
      const api = getAPIById("resume-get");
      expect(api?.endpoint).toBe("/api/resumes/:id");
      expect(api?.method).toBe("GET");
    });
  });

  describe("getAPIsForContext", () => {
    it("returns tools for the resume-edit context", () => {
      const apis = getAPIsForContext("resume-edit");
      expect(apis.length).toBeGreaterThan(0);
      const ids = apis.map((a) => a.id);
      expect(ids).toContain("resume-optimize");
    });

    it("returns tools for the job-list context", () => {
      const apis = getAPIsForContext("job-list");
      expect(apis.length).toBeGreaterThan(0);
      expect(apis.map((a) => a.id)).toContain("job-list-public");
    });

    it("returns [] for a context type no tool opts into", () => {
      const apis = getAPIsForContext("messaging");
      expect(apis).toEqual([]);
    });
  });

  describe("getAPIsByAction", () => {
    it("returns every tool that supports optimize-content", () => {
      const apis = getAPIsByAction("optimize-content");
      expect(apis.length).toBeGreaterThan(0);
      apis.forEach((api) => {
        expect(api.supportedActions).toContain("optimize-content");
      });
    });

    it("returns [] for an unknown action", () => {
      expect(getAPIsByAction("not-a-real-action")).toEqual([]);
    });
  });

  describe("endpoint hygiene", () => {
    it("every tool's endpoint starts with /api/ and matches backend casing", () => {
      // Spot-check across a few well-known tools rather than enumerate
      // — the shared registry's own test exhaustively asserts this.
      for (const id of [
        "resume-optimize",
        "resume-score",
        "resume-roast",
        "resume-get",
        "salary-analyze",
        "job-list-public",
        "task-list",
      ]) {
        const api = getAPIById(id);
        expect(api, `tool "${id}" should be present`).toBeDefined();
        expect(api!.endpoint).toMatch(/^\/api\//);
        // Path segments before `:param` placeholders must match the
        // backend route byte-for-byte — Hono is case-sensitive, apiClient
        // sends paths verbatim (no re-casing), and every route these tools
        // hit is registered lowercase (see api/src/app.ts mounts).
        const pathOnly = api!.endpoint.split(":")[0];
        expect(pathOnly).toBe(pathOnly.toLowerCase());
      }
    });
  });
});
