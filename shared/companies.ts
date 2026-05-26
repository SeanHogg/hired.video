/**
 * Shared contract for the Companies endpoints.
 *
 * Request schemas live here so the React admin, the Chrome extension's
 * employer flow, and the backend handlers all validate against the same
 * Zod source. Moving these out of routes/companies-handlers.ts closed
 * 2026-04-20 drift between frontend forms and backend parsers.
 */

import { z } from "zod";

import { UuidLikeSchema } from "./validation.js";
// Structured headquarters address — promoted from varchar to jsonb in
// migration 0074 (#294). Free-text legacy values were rewritten to
// `{ address }` so reads stay backwards-compatible.
export const HeadquartersSchema = z.object({
  address: z.string().max(255).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  timezone: z.string().max(64).optional().nullable(),
  remote: z.boolean().optional(),
});
export type HeadquartersInput = z.infer<typeof HeadquartersSchema>;

// External contact channels — column added by migration 0074 (#295).
export const CompanyContactInputSchema = z.object({
  email: z.string().email().optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  website: z.string().url().optional().nullable(),
  linkedin: z.string().url().optional().nullable(),
  twitter: z.string().max(80).optional().nullable(),
  facebook: z.string().max(120).optional().nullable(),
});
export type CompanyContactInput = z.infer<typeof CompanyContactInputSchema>;

export const CreateCompanySchema = z.object({
  name: z.string().min(1, "Company name is required"),
  description: z.string().optional().nullable(),
  website: z.string().url().optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
  industry: z.string().max(100).optional().nullable(),
  size: z.string().max(50).optional().nullable(),
  foundedYear: z.number().int().min(1800).max(2100).optional().nullable(),
  headquarters: HeadquartersSchema.optional().nullable(),
  contact: CompanyContactInputSchema.optional(),
});
export type CreateCompanyInput = z.infer<typeof CreateCompanySchema>;

export const UpdateCompanySchema = z.object({
  // Basic profile
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  website: z.string().url().optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
  industry: z.string().max(100).optional().nullable(),
  size: z.string().max(50).optional().nullable(),
  foundedYear: z.number().int().min(1800).max(2100).optional().nullable(),
  headquarters: HeadquartersSchema.optional().nullable(),
  contact: CompanyContactInputSchema.optional(),
  // Rich profile fields (migration 0023)
  tagline: z.string().max(255).optional().nullable(),
  mission: z.string().optional().nullable(),
  vision: z.string().optional().nullable(),
  technologies: z.array(z.string()).optional(),
  perks: z.array(z.string()).optional(),
  culture: z.array(z.string()).optional(),
  values: z.array(z.string()).optional(),
  benefits: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateCompanyInput = z.infer<typeof UpdateCompanySchema>;

export const CompanyLocationSchema = z.object({
  label: z.string().max(100).optional().nullable(),
  address: z.string().max(255).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  region: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  countryCode: z.string().max(8).optional().nullable(),
  isPrimary: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
});
export type CompanyLocationInput = z.infer<typeof CompanyLocationSchema>;

export const CompanyTeamMemberSchema = z.object({
  userId: UuidLikeSchema.optional().nullable(),
  name: z.string().min(1).max(255),
  title: z.string().max(255).optional().nullable(),
  bio: z.string().max(2000).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  linkedinUrl: z.string().url().optional().nullable(),
  displayOrder: z.number().int().min(0).optional(),
});
export type CompanyTeamMemberInput = z.infer<typeof CompanyTeamMemberSchema>;
