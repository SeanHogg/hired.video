// openapi.ts — Machine-readable API specification (#2)
// Serves a hand-maintained OpenAPI 3.1 document that describes the key endpoints.
// In the future this can be generated from @hono/zod-openapi schemas.

import { Hono } from "hono";
import type { Variables, AppEnv } from "../types/index.js";

export const openapiRoutes = new Hono<AppEnv>();

const SPEC = {
  openapi: "3.1.0",
  info: {
    title: "hired.video API",
    version: "1.0.0",
    description: "AI-powered hiring platform API — job seekers, recruiters, and employers.",
    contact: { email: "api@hired.video", url: "https://hired.video" },
    license: { name: "Proprietary" },
  },
  servers: [
    { url: "https://api.hired.video", description: "Production" },
    { url: "http://localhost:8787", description: "Local development" },
  ],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      ApiResponse: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          data: {},
          message: { type: "string" },
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
  },
  paths: {
    // ── Authentication ──────────────────────────────────────────────────────
    "/api/auth/register": {
      post: {
        tags: ["Authentication"],
        summary: "Register a new user",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email", "password"], properties: { email: { type: "string", format: "email" }, password: { type: "string", minLength: 8 }, name: { type: "string" }, role: { type: "string", enum: ["job_seeker", "recruiter", "employer"] } } } } } },
        responses: { "201": { description: "User created" }, "409": { description: "Email already exists" } },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Authentication"],
        summary: "Log in with email + password",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email", "password"], properties: { email: { type: "string" }, password: { type: "string" } } } } } },
        responses: { "200": { description: "Returns JWT token" }, "401": { description: "Invalid credentials" } },
        security: [],
      },
    },
    "/api/auth/passkey/register/begin": {
      post: { tags: ["Authentication", "Passkeys"], summary: "Begin passkey registration (FIDO2)", security: [], responses: { "200": { description: "PublicKeyCredentialCreationOptions" } } },
    },
    "/api/auth/passkey/login/begin": {
      post: { tags: ["Authentication", "Passkeys"], summary: "Begin passkey login (FIDO2)", security: [], responses: { "200": { description: "PublicKeyCredentialRequestOptions" } } },
    },
    // ── Users & Profiles ────────────────────────────────────────────────────
    "/api/users/me": {
      get: { tags: ["Users"], summary: "Get current user profile", responses: { "200": { description: "User profile" } } },
      patch: { tags: ["Users"], summary: "Update current user profile", responses: { "200": { description: "Updated profile" } } },
    },
    "/api/users/{userId}": {
      get: { tags: ["Users"], summary: "Get user profile by ID (public)", security: [], parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Public profile" }, "404": { description: "Not found" } } },
    },
    // ── Jobs ────────────────────────────────────────────────────────────────
    "/api/jobs/public": {
      get: {
        tags: ["Jobs"],
        summary: "Browse public job listings",
        security: [],
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "Full-text search" },
          { name: "location", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
        ],
        responses: { "200": { description: "Paginated job list" } },
      },
    },
    "/api/jobs": {
      post: { tags: ["Jobs"], summary: "Create a job listing", responses: { "201": { description: "Job created" } } },
    },
    // ── Resumes ─────────────────────────────────────────────────────────────
    "/api/resumes": {
      get: { tags: ["Resumes"], summary: "List user resumes", responses: { "200": { description: "Resume list" } } },
      post: { tags: ["Resumes"], summary: "Create or import a resume", responses: { "201": { description: "Resume created" } } },
    },
    "/api/resume/roast": {
      post: { tags: ["Resumes", "AI"], summary: "AI resume roast (public preview)", security: [], responses: { "200": { description: "Roast results" } } },
    },
    // ── Recruiter ───────────────────────────────────────────────────────────
    "/api/recruiter/talent-pool": {
      get: { tags: ["Recruiter"], summary: "List talent pools", responses: { "200": { description: "Talent pools" } } },
      post: { tags: ["Recruiter"], summary: "Create talent pool", responses: { "201": { description: "Pool created" } } },
    },
    "/api/recruiter/agent/source": {
      post: { tags: ["Recruiter", "AI"], summary: "Run AI sourcing agent", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["jobTitle"], properties: { jobTitle: { type: "string" }, skills: { type: "array", items: { type: "string" } }, location: { type: "string" }, maxCandidates: { type: "integer", default: 20 } } } } } }, responses: { "200": { description: "Sourcing results with AI scores and outreach drafts" } } },
    },
    "/api/search/recruiter": {
      post: { tags: ["Recruiter", "Search"], summary: "Boolean candidate search", requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { query: { type: "string", description: "Boolean expression: Java AND (Spring OR Quarkus) NOT Junior" }, skills: { type: "array", items: { type: "string" } }, location: { type: "string" } } } } } }, responses: { "200": { description: "Matching candidates" } } },
    },
    // ── ATS Integrations ────────────────────────────────────────────────────
    "/api/ats/connections": {
      get: { tags: ["ATS"], summary: "List ATS connections", parameters: [{ name: "companyId", in: "query", required: true, schema: { type: "string" } }], responses: { "200": { description: "ATS connection list" } } },
      post: { tags: ["ATS"], summary: "Connect an ATS", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["provider", "apiKey", "companyId"], properties: { provider: { type: "string", enum: ["greenhouse", "lever", "workday"] }, apiKey: { type: "string" }, companyId: { type: "string" } } } } } }, responses: { "201": { description: "Connection created" } } },
    },
    "/api/ats/webhook/{provider}": {
      post: { tags: ["ATS"], summary: "Receive ATS webhook events", security: [], parameters: [{ name: "provider", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Event received" } } },
    },
    // ── Billing ─────────────────────────────────────────────────────────────
    "/api/billing/subscription": {
      get: { tags: ["Billing"], summary: "Get current subscription", responses: { "200": { description: "Subscription details" } } },
    },
    "/api/billing/subscribe": {
      post: { tags: ["Billing"], summary: "Subscribe to a plan", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["planSlug"], properties: { planSlug: { type: "string" }, interval: { type: "string", enum: ["monthly", "yearly"] } } } } } }, responses: { "201": { description: "Subscription created" } } },
    },
    "/api/billing/company/{companyId}/seats": {
      patch: { tags: ["Billing", "Employer"], summary: "Update company seat count", parameters: [{ name: "companyId", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["seatCount"], properties: { seatCount: { type: "integer", minimum: 1 }, planTier: { type: "string", enum: ["starter", "team", "enterprise"] } } } } } }, responses: { "200": { description: "Updated seat subscription" } } },
    },
    // ── Assessments ─────────────────────────────────────────────────────────
    "/api/assessments": {
      get: { tags: ["Assessments"], summary: "Browse skill assessments", security: [], parameters: [{ name: "skill", in: "query", schema: { type: "string" } }], responses: { "200": { description: "Assessment list" } } },
    },
    "/api/assessments/{slug}/start": {
      post: { tags: ["Assessments"], summary: "Start an assessment attempt", parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }], responses: { "201": { description: "Attempt started with questions" } } },
    },
    // ── Auto-Apply ──────────────────────────────────────────────────────────
    "/api/auto-apply/start": {
      post: { tags: ["Auto-Apply", "AI"], summary: "AI auto-apply to multiple jobs", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["jobIds"], properties: { jobIds: { type: "array", items: { type: "string" }, maxItems: 20 }, submitNow: { type: "boolean", default: false } } } } } }, responses: { "200": { description: "Application results with tailored cover letters" } } },
    },
    "/api/auto-apply/matches": {
      get: { tags: ["Auto-Apply", "AI"], summary: "Get AI-ranked job matches", parameters: [{ name: "limit", in: "query", schema: { type: "integer", default: 10 } }], responses: { "200": { description: "Ranked job list" } } },
    },
    // ── Discovery ───────────────────────────────────────────────────────────
    "/api/discovery/talent-feed": {
      get: { tags: ["Discovery"], summary: "TikTok-style talent discovery feed", security: [], parameters: [{ name: "skills", in: "query", schema: { type: "string" } }, { name: "location", in: "query", schema: { type: "string" } }, { name: "limit", in: "query", schema: { type: "integer", default: 20 } }], responses: { "200": { description: "Ranked candidate video cards" } } },
    },
    "/api/discovery/jobs": {
      get: { tags: ["Discovery", "Jobs"], summary: "AI-ranked smart job board", security: [], parameters: [{ name: "q", in: "query", schema: { type: "string" } }, { name: "remote", in: "query", schema: { type: "boolean" } }], responses: { "200": { description: "Ranked job listings" } } },
    },
    "/api/discovery/seo/resume-guide/{jobSlug}": {
      get: { tags: ["Discovery", "SEO"], summary: "AI-generated resume guide", security: [], parameters: [{ name: "jobSlug", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Career guide with skills, tips, salary range" } } },
    },
    // ── Passkeys ────────────────────────────────────────────────────────────
    "/api/auth/passkey/credentials": {
      get: { tags: ["Passkeys"], summary: "List registered passkeys", responses: { "200": { description: "Passkey list" } } },
    },
    "/api/auth/passkey/credentials/{id}": {
      delete: { tags: ["Passkeys"], summary: "Remove a passkey", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Passkey removed" } } },
    },
    // ── White-label ─────────────────────────────────────────────────────────
    "/api/whitelabel/portal/{subdomain}": {
      get: { tags: ["Whitelabel"], summary: "Get portal branding by subdomain", security: [], parameters: [{ name: "subdomain", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Portal branding" }, "404": { description: "Not found" } } },
    },
    "/api/whitelabel/demo-request": {
      post: { tags: ["Whitelabel"], summary: "Request a platform demo", security: [], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string" }, company: { type: "string" }, useCase: { type: "string" } } } } } }, responses: { "201": { description: "Request received" } } },
    },
    "/api/whitelabel/roi-calculator": {
      get: { tags: ["Whitelabel"], summary: "Calculate agency ROI", security: [], parameters: [{ name: "recruiters", in: "query", schema: { type: "integer" } }, { name: "placementsPerMonth", in: "query", schema: { type: "integer" } }, { name: "avgFeeUsd", in: "query", schema: { type: "number" } }], responses: { "200": { description: "ROI analysis" } } },
    },
  },
  tags: [
    { name: "Authentication" }, { name: "Passkeys" }, { name: "Users" },
    { name: "Jobs" }, { name: "Resumes" }, { name: "Recruiter" },
    { name: "ATS" }, { name: "Billing" }, { name: "Employer" },
    { name: "Assessments" }, { name: "Auto-Apply" }, { name: "AI" },
    { name: "Discovery" }, { name: "SEO" }, { name: "Whitelabel" }, { name: "Search" },
  ],
};

/** GET /api/openapi.json — machine-readable OpenAPI 3.1 specification */
openapiRoutes.get("/openapi.json", (c) => {
  c.header("Content-Type", "application/json");
  c.header("Cache-Control", "public, max-age=3600");
  return c.json(SPEC, 200);
});

/** GET /api/docs — redirect to Swagger UI (external renderer) */
openapiRoutes.get("/docs", (c) => {
  const specUrl = encodeURIComponent(`${process.env.API_URL ?? "https://api.hired.video"}/api/openapi.json`);
  return c.redirect(`https://petstore.swagger.io/?url=${specUrl}`, 302);
});
