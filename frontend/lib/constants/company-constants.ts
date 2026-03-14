/**
 * Company-related constants and enums
 * Centralized definitions for company data to avoid duplication
 */

/**
 * Company size ranges with labels for UI display
 */
export const COMPANY_SIZE_OPTIONS = [
  { value: "1-10", label: "1-10 employees" },
  { value: "11-50", label: "11-50 employees" },
  { value: "51-200", label: "51-200 employees" },
  { value: "201-500", label: "201-500 employees" },
  { value: "501-1000", label: "501-1000 employees" },
  { value: "1000+", label: "1000+ employees" },
] as const;

/**
 * Company size values for validation and filtering
 */
export const COMPANY_SIZE_VALUES = COMPANY_SIZE_OPTIONS.map((opt) => opt.value);

/**
 * Get the label for a company size value
 */
export function getCompanySizeLabel(value: string): string {
  const option = COMPANY_SIZE_OPTIONS.find((opt) => opt.value === value);
  return option?.label || value;
}

