/**
 * Get the current year
 * @returns Current year as a number
 */
export const getCurrentYear = (): number => {
  return new Date().getFullYear();
};

/**
 * Format a copyright year range
 * @param startYear - The starting year
 * @param endYear - The ending year (defaults to current year)
 * @returns Formatted year range string (e.g., "2024" or "2024-2025")
 */
export const formatCopyrightYear = (startYear: number, endYear?: number): string => {
  const currentYear = getCurrentYear();
  const finalEndYear = endYear || currentYear;
  
  if (startYear === finalEndYear) {
    return startYear.toString();
  }
  
  return `${startYear}-${finalEndYear}`;
};

/**
 * Get a formatted copyright string
 * @param companyName - The company name
 * @param startYear - The starting year (defaults to 2024)
 * @returns Full copyright string
 */
export const getCopyrightString = (companyName: string, startYear: number = 2024): string => {
  const yearRange = formatCopyrightYear(startYear);
  return `© ${yearRange} ${companyName}. All rights reserved.`;
};
