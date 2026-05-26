/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

import { z } from "zod";
import { UuidLikeSchema } from "./validation.js";
import { USER_ROLES } from "./user-roles.js";

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Base API Response Schema
 */
// Use a loose object so unmodeled properties (e.g., `data`, `error`) are preserved
export const ApiResponseSchema = z.looseObject({
  success: z.boolean(),
  data: z.unknown().optional(),
  // Some backends return null for message; accept undefined or null
  message: z.string().nullish(),
  // Accept broad RFC3339/ISO8601-like timestamps (some backends emit >3 fractional seconds)
  timestamp: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid datetime")
    .optional(),
});

/**
 * Error Response Schema
 */
export const ApiErrorResponseSchema = ApiResponseSchema.extend({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

/**
 * Success Response Schema
 */
export const ApiSuccessResponseSchema = <T extends z.ZodTypeAny>(
  dataSchema: T,
) =>
  ApiResponseSchema.extend({
    success: z.literal(true),
    data: dataSchema,
  });

/**
 * Demo Response Schema
 */
export const DemoResponseSchema = z.object({
  message: z.string(),
});

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Base API Response Type
 */
export type ApiResponse = z.infer<typeof ApiResponseSchema>;

/**
 * Error Response Type
 */
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

/**
 * Success Response Type
 */
export interface ApiSuccessResponse<T> {
  success: true;
  message?: string;
  timestamp?: string;
  data: T;
  /** Present on AI-metered endpoint responses. Consumers read this to keep
   *  the AI-tokens UI in sync without issuing a second /token-budget call. */
  tokenBudget?: import("./billing.js").TokenBudgetDTO;
}

/**
 * Demo Response Type
 */
export type DemoResponse = z.infer<typeof DemoResponseSchema>;

// ============================================================================
// API ENDPOINT SCHEMAS
// ============================================================================

/**
 * Authentication Endpoints
 */
export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const LoginResponseSchema = z.object({
  user: z.object({
    id: UuidLikeSchema,
    email: z.string().email(),
    name: z.string(),
    // Accept any backend role string; client maps/normalizes later
    role: z.string(),
  }),
  token: z.string(),
  // Accept any RFC3339/ISO8601-like string that Date.parse can read (some backends send >3 fractional seconds)
  expiresAt: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid datetime"),
});

// Two-factor challenge (step-up authentication)
export const TwoFactorChallengeSchema = z.object({
  requiresTwoFactor: z.literal(true),
  tempAuthToken: z.string().min(1),
  expiresAt: z.string(),
  email: z.string(),
  attemptsLeft: z.number().optional(),
});

// Registration result when email verification is required
export const EmailVerificationChallengeSchema = z.object({
  requiresEmailVerification: z.literal(true),
  email: z.string().email().optional(),
  sentAt: z.string().optional(),
});

export const SignupRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z
    .enum([
      USER_ROLES.JOB_SEEKER,
      USER_ROLES.RECRUITER,
      USER_ROLES.EMPLOYER,
      USER_ROLES.ADMIN,
    ])
    .optional(),
  enableAffiliate: z.boolean().optional(),
});

// Exported types for shared schemas
export type TwoFactorChallenge = z.infer<typeof TwoFactorChallengeSchema>;
export type EmailVerificationChallenge = z.infer<typeof EmailVerificationChallengeSchema>;

/**
 * User Profile Endpoints
 */
export const UserProfileResponseSchema = z.object({
  id: UuidLikeSchema,
  slug: z.string(),
  data: z.object({
    firstName: z.string(),
    lastName: z.string(),
    avatar: z.string().url().optional(),
    headline: z.string(),
    summary: z.string(),
    // Add more fields as needed
  }),
  role: z.enum([
    USER_ROLES.JOB_SEEKER,
    USER_ROLES.RECRUITER,
    USER_ROLES.EMPLOYER,
    USER_ROLES.ADMIN,
  ]),
  isVerified: z.boolean(),
  isPro: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const UpdateUserProfileRequestSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  headline: z.string().optional(),
  summary: z.string().optional(),
  // Add more fields as needed
});

/**
 * Resume Endpoints
 */
export const ResumeListResponseSchema = z.object({
  resumes: z.array(
    z.object({
      id: UuidLikeSchema,
      slug: z.string(),
      name: z.string(),
      privacy: z.enum(["public", "private", "unlisted"]),
      isMaster: z.boolean(),
      isActive: z.boolean(),
      createdAt: z.iso.datetime(),
      updatedAt: z.iso.datetime(),
      views: z.number(),
    }),
  ),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export const CreateResumeRequestSchema = z.object({
  name: z.string().min(1),
  privacy: z.enum(["public", "private", "unlisted"]).default("private"),
  templateId: UuidLikeSchema.optional(),
});

/**
 * Job Endpoints
 */
export const JobListResponseSchema = z.object({
  jobs: z.array(
    z.object({
      id: UuidLikeSchema,
      slug: z.string(),
      data: z.object({
        title: z.string(),
        description: z.string(),
        company: z.string(),
        location: z.object({
          city: z.string(),
          state: z.string(),
          country: z.string(),
          remote: z.boolean(),
        }),
        employmentType: z.enum([
          "full-time",
          "part-time",
          "contract",
          "freelance",
          "internship",
        ]),
        experienceLevel: z.enum([
          "entry",
          "mid",
          "senior",
          "lead",
          "executive",
        ]),
      }),
      status: z.enum(["draft", "active", "paused", "closed"]),
      createdAt: z.iso.datetime(),
      updatedAt: z.iso.datetime(),
      views: z.number(),
      applications: z.number(),
    }),
  ),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export const CreateJobRequestSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  requirements: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  experienceLevel: z.enum(["entry", "mid", "senior", "lead", "executive"]),
  employmentType: z.enum([
    "full-time",
    "part-time",
    "contract",
    "freelance",
    "internship",
  ]),
  location: z.object({
    city: z.string(),
    state: z.string(),
    country: z.string(),
    remote: z.boolean(),
  }),
  salary: z
    .object({
      min: z.number().min(0).optional(),
      max: z.number().min(0).optional(),
      currency: z.string().length(3),
      period: z.enum(["hourly", "daily", "weekly", "monthly", "yearly"]),
    })
    .optional(),
});

// ============================================================================
// API ENDPOINT TYPES
// ============================================================================

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type SignupRequest = z.infer<typeof SignupRequestSchema>;
export type UserProfileResponse = z.infer<typeof UserProfileResponseSchema>;
export type UpdateUserProfileRequest = z.infer<
  typeof UpdateUserProfileRequestSchema
>;
export type ResumeListResponse = z.infer<typeof ResumeListResponseSchema>;
export type CreateResumeRequest = z.infer<typeof CreateResumeRequestSchema>;
export type JobListResponse = z.infer<typeof JobListResponseSchema>;
export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>;

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Recursively converts null values to undefined in an object
 */
function nullToUndefined(obj: any): any {
  if (obj === null) {
    return undefined;
  }
  if (Array.isArray(obj)) {
    return obj.map(nullToUndefined);
  }
  if (typeof obj === "object" && obj !== null) {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = nullToUndefined(value);
    }
    return result;
  }
  return obj;
}

/**
 * Helper to create a nullable string schema that converts null to undefined
 */
export const nullableString = () =>
  z
    .string()
    .nullable()
    .transform((val) => (val === null ? undefined : val))
    .optional();

/**
 * Helper to create a nullable number schema that converts null to undefined
 */
export const nullableNumber = () =>
  z
    .number()
    .nullable()
    .transform((val) => (val === null ? undefined : val))
    .optional();

/**
 * Helper to create a nullable boolean schema that converts null to undefined
 */
export const nullableBoolean = () =>
  z
    .boolean()
    .nullable()
    .transform((val) => (val === null ? undefined : val))
    .optional();

/**
 * Validates API response data against a schema.
 *
 * Historical footgun removed 2026-04-20: this used to `nullToUndefined(data)`
 * before calling `schema.parse`. That was fine for legacy schemas that
 * used `.optional()` (which accepts undefined), but it's actively hostile
 * to the canonical shared schemas that use `.nullable()` (which accepts
 * `T | null`, NOT `undefined`). The backend sends `null` for fields like
 * `slug`, `parentId`, `templateId`, `metaResumeId`, `diffPercent`,
 * `sentimentScore` — exactly the 6 fields that produced the
 * "Invalid input: expected string/number, received undefined" upload
 * error. The nullToUndefined pass converted the backend's legal nulls
 * into illegal undefineds before the schema saw them.
 *
 * Our legacy `nullableString()`/`nullableNumber()`/`nullableBoolean()`
 * helpers use `.nullable()` directly, so they still accept null
 * without the preprocessing.
 */
export function validateApiResponse<T>(
  data: unknown,
  schema: z.ZodType<T>,
): { success: true; data: T } | { success: false; error: string } {
  try {
    const validatedData = schema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues ?? [];
      const details = issues.length
        ? issues.map((i) => i.message).join(", ")
        : (error as Error).message || "Invalid data";
      return {
        success: false,
        error: `Validation failed: ${details}`,
      };
    }
    return {
      success: false,
      error: "Unknown validation error",
    };
  }
}

// Export nullToUndefined so raw API calls can normalize backend nulls to undefined
export { nullToUndefined };

/**
 * Creates a typed API error response
 */
export function createApiError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Creates a typed API success response
 */
export function createApiSuccess<T>(
  data: T,
  message?: string,
): ApiSuccessResponse<T> {
  return {
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
  };
}
