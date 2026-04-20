/**
 * Shared contract for the Companies endpoints.
 *
 * Request schemas live here so the React admin, the Chrome extension's
 * employer flow, and the backend handlers all validate against the same
 * Zod source. Moving these out of routes/companies-handlers.ts closed
 * 2026-04-20 drift between frontend forms and backend parsers.
 */

import { z } from "zod";

export const CreateCompanySchema = z.object({
  name: z.string().min(1, "Company name is required"),
  description: z.string().optional().nullable(),
  website: z.string().url().optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
  industry: z.string().max(100).optional().nullable(),
  size: z.string().max(50).optional().nullable(),
  foundedYear: z.number().int().min(1800).max(2100).optional().nullable(),
  headquarters: z.string().max(255).optional().nullable(),
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
  headquarters: z.string().max(255).optional().nullable(),
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
  userId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(255),
  title: z.string().max(255).optional().nullable(),
  bio: z.string().max(2000).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  linkedinUrl: z.string().url().optional().nullable(),
  displayOrder: z.number().int().min(0).optional(),
});
export type CompanyTeamMemberInput = z.infer<typeof CompanyTeamMemberSchema>;
