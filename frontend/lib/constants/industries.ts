/**
 * Industry list - centralized definition used across the application
 * Matches backend industry list from SalaryCalculatorService and ResumeOptimizerController
 */

export const INDUSTRIES = [
  "Technology",
  "Healthcare",
  "Finance",
  "Marketing",
  "Sales",
  "Human Resources",
  "Operations",
  "Consulting",
  "Education",
  "Manufacturing",
  "Retail",
  "Real Estate",
  "Legal",
  "Non-Profit",
  "Government",
  "Media & Communications",
  "Transportation",
  "Energy",
  "Construction",
  "Hospitality",
  "Aerospace",
  "Automotive",
  "Banking",
  "Biotechnology",
  "Chemical",
  "Entertainment",
  "Fashion",
  "Food & Beverage",
  "Insurance",
  "Mining",
  "Pharmaceutical",
  "Publishing",
  "Sports",
  "Telecommunications",
  "Tourism",
  "Utilities",
  "Agriculture",
  "Architecture",
  "Art & Design",
  "Cybersecurity",
] as const;

export type Industry = (typeof INDUSTRIES)[number];

/**
 * Get industry options for select dropdowns
 */
export function getIndustryOptions() {
  return INDUSTRIES.map((industry) => ({
    value: industry,
    label: industry,
  }));
}

/**
 * Education levels for salary calculator and other forms
 */
export const EDUCATION_LEVELS = [
  "High School",
  "Associate Degree",
  "Bachelor's Degree",
  "Master's Degree",
  "PhD/Doctorate",
  "Professional Certification",
] as const;

export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

/**
 * Get education level options for select dropdowns
 */
export function getEducationLevelOptions() {
  return EDUCATION_LEVELS.map((level) => ({
    value: level,
    label: level,
  }));
}

