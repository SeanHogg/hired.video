/**
 * Comprehensive validation schemas for domain types
 * Using Zod for runtime type validation and TypeScript inference
 */

import { z } from 'zod';

// ============================================================================
// COMMON VALIDATION SCHEMAS
// ============================================================================

/**
 * UUID Schema
 */
export const UuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Email Schema
 */
export const EmailSchema = z.string().email('Invalid email format');

/**
 * URL Schema
 */
export const UrlSchema = z.string().url('Invalid URL format');

/**
 * Date Schema (ISO string)
 */
export const DateSchema = z.string().datetime('Invalid date format');

/**
 * Non-empty string schema
 */
export const NonEmptyStringSchema = z.string().min(1, 'Field cannot be empty');

/**
 * Optional non-empty string schema
 */
export const OptionalNonEmptyStringSchema = z.string().min(1).optional();

// ============================================================================
// USER/PEOPLE VALIDATION SCHEMAS
// ============================================================================

/**
 * User Location Schema
 */
export const UserLocationSchema = z.object({
  city: NonEmptyStringSchema,
  state: NonEmptyStringSchema,
  country: NonEmptyStringSchema,
  remote: z.boolean(),
});

/**
 * User Contact Schema
 */
export const UserContactSchema = z.object({
  email: EmailSchema,
  phone: OptionalNonEmptyStringSchema,
  website: UrlSchema.optional(),
  linkedin: UrlSchema.optional(),
  github: UrlSchema.optional(),
  twitter: OptionalNonEmptyStringSchema,
});

/**
 * User Experience Schema
 */
export const UserExperienceSchema = z.object({
  id: UuidSchema,
  company: NonEmptyStringSchema,
  position: NonEmptyStringSchema,
  startDate: DateSchema,
  endDate: DateSchema.optional(),
  isCurrent: z.boolean(),
  description: OptionalNonEmptyStringSchema,
  location: OptionalNonEmptyStringSchema,
  skills: z.array(NonEmptyStringSchema).default([]),
});

/**
 * User Education Schema
 */
export const UserEducationSchema = z.object({
  id: UuidSchema,
  institution: NonEmptyStringSchema,
  degree: NonEmptyStringSchema,
  field: NonEmptyStringSchema,
  startDate: DateSchema,
  endDate: DateSchema.optional(),
  gpa: z.number().min(0).max(4).optional(),
  description: OptionalNonEmptyStringSchema,
});

/**
 * User Skill Schema
 */
export const UserSkillSchema = z.object({
  id: UuidSchema,
  name: NonEmptyStringSchema,
  level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  category: NonEmptyStringSchema,
  yearsOfExperience: z.number().min(0).optional(),
});

/**
 * User Project Schema
 */
export const UserProjectSchema = z.object({
  id: UuidSchema,
  name: NonEmptyStringSchema,
  description: NonEmptyStringSchema,
  url: UrlSchema.optional(),
  githubUrl: UrlSchema.optional(),
  startDate: DateSchema,
  endDate: DateSchema.optional(),
  technologies: z.array(NonEmptyStringSchema).default([]),
  role: OptionalNonEmptyStringSchema,
});

/**
 * User Data Schema
 */
export const UserDataSchema = z.object({
  firstName: NonEmptyStringSchema,
  lastName: NonEmptyStringSchema,
  avatar: UrlSchema.optional(),
  headline: NonEmptyStringSchema,
  summary: NonEmptyStringSchema,
  location: UserLocationSchema,
  contact: UserContactSchema,
  experience: z.array(UserExperienceSchema).default([]),
  education: z.array(UserEducationSchema).default([]),
  skills: z.array(UserSkillSchema).default([]),
  projects: z.array(UserProjectSchema).default([]),
  languages: z.array(NonEmptyStringSchema).default([]),
  interests: z.array(NonEmptyStringSchema).default([]),
  achievements: z.array(NonEmptyStringSchema).default([]),
  certifications: z.array(NonEmptyStringSchema).default([]),
  openToWork: z.boolean(),
  openToOpportunities: z.array(z.enum(['full-time', 'part-time', 'contract', 'freelance', 'internship'])).default([]),
  preferredRoles: z.array(NonEmptyStringSchema).default([]),
  salaryExpectation: z.object({
    min: z.number().min(0).optional(),
    max: z.number().min(0).optional(),
    currency: z.string().length(3, 'Currency must be 3 characters (e.g., USD)'),
  }).optional(),
});

// ============================================================================
// COMPANY VALIDATION SCHEMAS
// ============================================================================

/**
 * Company Data Schema
 */
export const CompanyDataSchema = z.object({
  name: NonEmptyStringSchema,
  description: NonEmptyStringSchema,
  website: UrlSchema.optional(),
  logo: UrlSchema.optional(),
  industry: NonEmptyStringSchema,
  size: z.enum(['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+']),
  founded: z.number().min(1800).max(new Date().getFullYear()),
  location: UserLocationSchema,
  contact: UserContactSchema,
  benefits: z.array(NonEmptyStringSchema).default([]),
  culture: z.array(NonEmptyStringSchema).default([]),
  techStack: z.array(NonEmptyStringSchema).default([]),
});

// ============================================================================
// JOB VALIDATION SCHEMAS
// ============================================================================

/**
 * Job Data Schema
 */
export const JobDataSchema = z.object({
  title: NonEmptyStringSchema,
  description: NonEmptyStringSchema,
  requirements: z.array(NonEmptyStringSchema).default([]),
  responsibilities: z.array(NonEmptyStringSchema).default([]),
  skills: z.array(NonEmptyStringSchema).default([]),
  experienceLevel: z.enum(['entry', 'mid', 'senior', 'lead', 'executive']),
  employmentType: z.enum(['full-time', 'part-time', 'contract', 'freelance', 'internship']),
  location: UserLocationSchema,
  remote: z.boolean(),
  salary: z.object({
    min: z.number().min(0).optional(),
    max: z.number().min(0).optional(),
    currency: z.string().length(3),
    period: z.enum(['hourly', 'daily', 'weekly', 'monthly', 'yearly']),
  }).optional(),
  benefits: z.array(NonEmptyStringSchema).default([]),
  applicationDeadline: DateSchema.optional(),
});

// ============================================================================
// RESUME VALIDATION SCHEMAS
// ============================================================================

/**
 * Resume Basics Schema
 */
export const ResumeBasicsSchema = z.object({
  Name: NonEmptyStringSchema,
  Label: NonEmptyStringSchema,
  Email: EmailSchema,
  Phone: OptionalNonEmptyStringSchema,
  Website: UrlSchema.optional(),
  Summary: NonEmptyStringSchema,
  Location: z.object({
    Address: OptionalNonEmptyStringSchema,
    City: NonEmptyStringSchema,
    Region: NonEmptyStringSchema,
    PostalCode: OptionalNonEmptyStringSchema,
    CountryCode: z.string().length(2),
  }),
  Profiles: z.array(z.object({
    Network: NonEmptyStringSchema,
    Username: NonEmptyStringSchema,
    Url: UrlSchema,
  })).default([]),
  Image: UrlSchema.optional(),
});

/**
 * Resume Work Experience Schema
 */
export const ResumeWorkSchema = z.object({
  Name: NonEmptyStringSchema,
  Position: NonEmptyStringSchema,
  StartDate: DateSchema,
  EndDate: DateSchema.optional(),
  Highlights: z.array(NonEmptyStringSchema).default([]),
  Summary: OptionalNonEmptyStringSchema,
  Url: UrlSchema.optional(),
  Location: OptionalNonEmptyStringSchema,
});

/**
 * Resume Education Schema
 */
export const ResumeEducationSchema = z.object({
  Institution: NonEmptyStringSchema,
  Area: NonEmptyStringSchema,
  StudyType: NonEmptyStringSchema,
  StartDate: DateSchema,
  EndDate: DateSchema.optional(),
  Score: OptionalNonEmptyStringSchema,
  Courses: z.array(NonEmptyStringSchema).default([]),
});

/**
 * Resume Skills Schema
 */
export const ResumeSkillsSchema = z.object({
  Name: NonEmptyStringSchema,
  Level: z.enum(['Beginner', 'Intermediate', 'Advanced', 'Expert']),
  Keywords: z.array(NonEmptyStringSchema).default([]),
});

/**
 * Resume Data Schema
 */
export const ResumeDataSchema = z.object({
  Basics: ResumeBasicsSchema,
  Work: z.array(ResumeWorkSchema).default([]),
  Education: z.array(ResumeEducationSchema).default([]),
  Skills: z.array(ResumeSkillsSchema).default([]),
  Projects: z.array(z.object({
    Name: NonEmptyStringSchema,
    Description: NonEmptyStringSchema,
    Highlights: z.array(NonEmptyStringSchema).default([]),
    Keywords: z.array(NonEmptyStringSchema).default([]),
    StartDate: DateSchema,
    EndDate: DateSchema.optional(),
    Url: UrlSchema.optional(),
    Roles: z.array(NonEmptyStringSchema).default([]),
    Entity: OptionalNonEmptyStringSchema,
    Type: OptionalNonEmptyStringSchema,
  })).default([]),
  Awards: z.array(z.object({
    Title: NonEmptyStringSchema,
    Date: DateSchema,
    Awarder: NonEmptyStringSchema,
    Summary: OptionalNonEmptyStringSchema,
  })).default([]),
  Certificates: z.array(z.object({
    Name: NonEmptyStringSchema,
    Date: DateSchema,
    Issuer: NonEmptyStringSchema,
    Url: UrlSchema.optional(),
  })).default([]),
  Publications: z.array(z.object({
    Name: NonEmptyStringSchema,
    Publisher: NonEmptyStringSchema,
    ReleaseDate: DateSchema,
    Url: UrlSchema.optional(),
    Summary: OptionalNonEmptyStringSchema,
  })).default([]),
  Languages: z.array(z.object({
    Language: NonEmptyStringSchema,
    Fluency: z.enum(['Native', 'Fluent', 'Conversational', 'Basic']),
  })).default([]),
  Interests: z.array(z.object({
    Name: NonEmptyStringSchema,
    Keywords: z.array(NonEmptyStringSchema).default([]),
  })).default([]),
  References: z.array(z.object({
    Name: NonEmptyStringSchema,
    Reference: NonEmptyStringSchema,
  })).default([]),
  Meta: z.object({
    Canonical: UrlSchema.optional(),
    Version: NonEmptyStringSchema.default('1.0.0'),
    LastModified: DateSchema.optional(),
  }).default({}),
});

// ============================================================================
// EXPORT INFERRED TYPES
// ============================================================================

export type UserLocationValidated = z.infer<typeof UserLocationSchema>;
export type UserContactValidated = z.infer<typeof UserContactSchema>;
export type UserExperienceValidated = z.infer<typeof UserExperienceSchema>;
export type UserEducationValidated = z.infer<typeof UserEducationSchema>;
export type UserSkillValidated = z.infer<typeof UserSkillSchema>;
export type UserProjectValidated = z.infer<typeof UserProjectSchema>;
export type UserDataValidated = z.infer<typeof UserDataSchema>;
export type CompanyDataValidated = z.infer<typeof CompanyDataSchema>;
export type JobDataValidated = z.infer<typeof JobDataSchema>;
export type ResumeDataValidated = z.infer<typeof ResumeDataSchema>;
