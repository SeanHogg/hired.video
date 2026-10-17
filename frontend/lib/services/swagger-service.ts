/**
 * Swagger/OpenAPI Service
 * 
 * Fetches and parses the OpenAPI schema from the backend to dynamically
 * discover available APIs for AI orchestration.
 */

import type { AvailableAPI } from "@/lib/types/ai-context";
import { buildApiUrl } from "@/lib/api/base-url";

// ============================================================================
// TYPES
// ============================================================================

interface OpenAPISchema {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers: Array<{
    url: string;
    description?: string;
  }>;
  paths: Record<string, OpenAPIPath>;
  components?: {
    schemas?: Record<string, any>;
    securitySchemes?: Record<string, any>;
  };
}

interface OpenAPIPath {
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  put?: OpenAPIOperation;
  delete?: OpenAPIOperation;
  patch?: OpenAPIOperation;
}

interface OpenAPIOperation {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: Array<{
    name: string;
    in: "query" | "path" | "header" | "cookie";
    required?: boolean;
    schema: any;
  }>;
  requestBody?: {
    required?: boolean;
    content: Record<string, { schema: any }>;
  };
  responses: Record<string, any>;
  security?: Array<Record<string, string[]>>;
}

// ============================================================================
// SWAGGER SERVICE
// ============================================================================

class SwaggerService {
  private schema: OpenAPISchema | null = null;
  private schemaPromise: Promise<OpenAPISchema> | null = null;

  /**
   * Fetch the OpenAPI schema from the backend
   */
  async fetchSchema(): Promise<OpenAPISchema> {
    // Return cached schema if available
    if (this.schema) {
      return this.schema;
    }

    // Return in-flight request if already fetching
    if (this.schemaPromise) {
      return this.schemaPromise;
    }

    // Fetch the schema
    this.schemaPromise = this.fetchSchemaInternal();
    this.schema = await this.schemaPromise;
    this.schemaPromise = null;

    return this.schema;
  }

  private async fetchSchemaInternal(): Promise<OpenAPISchema> {
    const response = await fetch(buildApiUrl("/swagger/v1/swagger.json"));

    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI schema: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Convert OpenAPI schema to AvailableAPI format
   */
  async getAvailableAPIs(): Promise<AvailableAPI[]> {
    const schema = await this.fetchSchema();
    const apis: AvailableAPI[] = [];

    for (const [path, pathItem] of Object.entries(schema.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!operation || typeof operation !== "object") continue;

        const op = operation as OpenAPIOperation;
        const requiresAuth = this.requiresAuthentication(op);

        // Determine supported actions based on tags and operation
        const supportedActions = this.inferSupportedActions(
          path,
          method,
          op.tags || [],
          op.summary || "",
        );

        // Skip if no supported actions (not relevant for AI)
        if (supportedActions.length === 0) continue;

        const api: AvailableAPI = {
          id: op.operationId || `${method}_${path.replace(/\//g, "_")}`,
          endpoint: path,
          method: method.toUpperCase() as AvailableAPI["method"],
          description: op.summary || op.description || `${method.toUpperCase()} ${path}`,
          supportedActions,
          requiresAuth,
          requestSchema: this.extractRequestSchema(op),
          responseSchema: this.extractResponseSchema(op),
        };

        apis.push(api);
      }
    }

    return apis;
  }

  /**
   * Check if operation requires authentication
   */
  private requiresAuthentication(operation: OpenAPIOperation): boolean {
    return (
      operation.security !== undefined &&
      operation.security.length > 0 &&
      operation.security.some((sec) => "Bearer" in sec)
    );
  }

  /**
   * Infer supported AI actions based on endpoint metadata
   */
  private inferSupportedActions(
    path: string,
    method: string,
    tags: string[],
    summary: string,
  ): string[] {
    const actions: string[] = [];
    const lowerPath = path.toLowerCase();
    const lowerSummary = summary.toLowerCase();
    const lowerTags = tags.map((t) => t.toLowerCase());

    // Resume-related actions
    if (
      lowerTags.includes("resume") ||
      lowerPath.includes("resume") ||
      lowerPath.includes("resumeoptimizer") ||
      lowerPath.includes("resumescorer")
    ) {
      if (lowerPath.includes("optimize") || lowerSummary.includes("optimize")) {
        actions.push("optimize-content", "improve-summary", "keyword-optimization");
      }
      if (lowerPath.includes("ats") || lowerSummary.includes("ats")) {
        actions.push("ats-score");
      }
      if (lowerPath.includes("score") || lowerSummary.includes("score")) {
        actions.push("ats-score", "optimize-content");
      }
      if (lowerPath.includes("keyword") || lowerSummary.includes("keyword")) {
        actions.push("suggest-skills", "keyword-optimization");
      }
      if (lowerPath.includes("recommendation") || lowerSummary.includes("recommendation")) {
        actions.push("optimize-content", "improve-summary", "enhance-experience");
      }
      if (method === "get" && !lowerPath.includes("optimize") && !lowerPath.includes("score")) {
        actions.push("optimize-content", "ats-score", "improve-summary");
      }
      if (method === "post" && lowerPath.includes("save")) {
        actions.push("optimize-content", "improve-summary", "enhance-experience");
      }
    }

    // Job-related actions
    if (lowerTags.includes("job") || lowerPath.includes("job")) {
      if (lowerPath.includes("salary") || lowerSummary.includes("salary")) {
        actions.push("salary-insights");
      }
      if (method === "get" && lowerPath.includes("public")) {
        actions.push("match-candidates", "refine-search", "analyze-results");
      }
      if (method === "get" && !lowerPath.includes("public")) {
        actions.push("match-candidates", "optimize-posting", "generate-description");
      }
      if (method === "post" && lowerPath.includes("save")) {
        actions.push("generate-description", "optimize-posting", "suggest-requirements");
      }
    }

    // Profile-related actions
    if (lowerTags.includes("user") || lowerPath.includes("user") || lowerPath.includes("profile")) {
      if (method === "get") {
        actions.push("optimize-headline", "improve-summary", "enhance-profile");
      }
    }

    // Salary-related actions
    if (lowerTags.includes("salary") || lowerPath.includes("salary")) {
      actions.push("salary-insights");
    }

    return [...new Set(actions)]; // Remove duplicates
  }

  /**
   * Extract request schema from operation
   */
  private extractRequestSchema(operation: OpenAPIOperation): Record<string, any> | undefined {
    if (!operation.requestBody) return undefined;

    const content = operation.requestBody.content;
    const jsonContent = content["application/json"];

    if (!jsonContent || !jsonContent.schema) return undefined;

    return this.simplifySchema(jsonContent.schema);
  }

  /**
   * Extract response schema from operation
   */
  private extractResponseSchema(operation: OpenAPIOperation): Record<string, any> | undefined {
    const successResponse = operation.responses["200"] || operation.responses["201"];
    if (!successResponse) return undefined;

    const content = successResponse.content;
    if (!content) return undefined;

    const jsonContent = content["application/json"];
    if (!jsonContent || !jsonContent.schema) return undefined;

    return this.simplifySchema(jsonContent.schema);
  }

  /**
   * Simplify OpenAPI schema to a more readable format
   */
  private simplifySchema(schema: any): Record<string, any> {
    if (!schema) return {};

    if (schema.$ref) {
      return { $ref: schema.$ref };
    }

    if (schema.type === "object" && schema.properties) {
      const simplified: Record<string, any> = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        simplified[key] = this.getSchemaType(value as any);
      }
      return simplified;
    }

    if (schema.type === "array" && schema.items) {
      return { type: "array", items: this.getSchemaType(schema.items) };
    }

    return { type: schema.type || "unknown" };
  }

  /**
   * Get simplified type from schema
   */
  private getSchemaType(schema: any): string {
    if (!schema) return "unknown";
    if (schema.$ref) return schema.$ref.split("/").pop() || "object";
    if (schema.type === "array") return `array<${this.getSchemaType(schema.items)}>`;
    return schema.type || "unknown";
  }

  /**
   * Get APIs filtered by tag
   */
  async getAPIsByTag(tag: string): Promise<AvailableAPI[]> {
    const allAPIs = await this.getAvailableAPIs();
    const schema = await this.fetchSchema();

    return allAPIs.filter((api) => {
      const pathItem = schema.paths[api.endpoint];
      if (!pathItem) return false;

      const operation = pathItem[api.method.toLowerCase() as keyof OpenAPIPath] as OpenAPIOperation;
      if (!operation) return false;

      return operation.tags?.some((t) => t.toLowerCase() === tag.toLowerCase());
    });
  }

  /**
   * Clear cached schema (useful for development/testing)
   */
  clearCache(): void {
    this.schema = null;
    this.schemaPromise = null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const swaggerService = new SwaggerService();

export type { OpenAPISchema, OpenAPIPath, OpenAPIOperation };

