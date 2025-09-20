/**
 * Company validation utilities
 */

/**
 * List of invalid/placeholder company names that should be filtered out
 */
const INVALID_COMPANY_NAMES = [
  "unnamed company",
  "untitled company", 
  "new company",
  "company name",
  "your company",
  "test company",
  "sample company",
  "example company",
  "demo company",
  "placeholder company"
];

/**
 * Check if a company name is valid (not empty, null, or a placeholder)
 * @param name - The company name to validate
 * @returns true if the name is valid, false otherwise
 */
export function isValidCompanyName(name: string | null | undefined): boolean {
  if (!name) return false;
  
  const trimmedName = name.trim();
  if (!trimmedName) return false;
  
  // Check against invalid names (case insensitive)
  return !INVALID_COMPANY_NAMES.includes(trimmedName.toLowerCase());
}

/**
 * Filter an array of companies to only include those with valid names and exclude demo companies
 * @param companies - Array of companies to filter
 * @param nameProperty - Property name that contains the company name (default: 'name')
 * @param excludeDemo - Whether to exclude demo companies (default: true)
 * @returns Filtered array of companies with valid names
 */
export function filterValidCompanies<T extends Record<string, any>>(
  companies: T[], 
  nameProperty: string = 'name',
  excludeDemo: boolean = true
): T[] {
  return companies.filter(company => {
    const hasValidName = isValidCompanyName(company[nameProperty]);
    const isNotDemo = !excludeDemo || !company.isDemo;
    return hasValidName && isNotDemo;
  });
}

/**
 * Validate company data for creation/update
 * @param companyData - Company data to validate
 * @returns Object with isValid boolean and error message if invalid
 */
export function validateCompanyData(companyData: {
  name?: string;
  description?: string;
  industry?: string;
  size?: string;
}): { isValid: boolean; error?: string } {
  if (!isValidCompanyName(companyData.name)) {
    return {
      isValid: false,
      error: "Please provide a valid company name"
    };
  }

  if (!companyData.description?.trim()) {
    return {
      isValid: false,
      error: "Company description is required"
    };
  }

  if (!companyData.industry?.trim()) {
    return {
      isValid: false,
      error: "Company industry is required"
    };
  }

  if (!companyData.size?.trim()) {
    return {
      isValid: false,
      error: "Company size is required"
    };
  }

  return { isValid: true };
}