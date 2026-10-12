import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generate a unique resume ID
 */
export function generateResumeId(): string {
  return `resume_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Safely format a date string, handling invalid dates gracefully
 */
export function formatDate(
  dateString: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  },
  fallback = "No date",
): string {
  if (!dateString) return fallback;
  const dateObj = new Date(dateString);
  if (isNaN(dateObj.getTime())) return "Invalid date";
  return dateObj.toLocaleDateString("en-US", options);
}

/**
 * Check if a date string is valid
 */
export function isValidDate(dateString: string | null | undefined): boolean {
  if (!dateString) return false;
  const dateObj = new Date(dateString);
  return !isNaN(dateObj.getTime());
}

/**
 * Build full image URL from relative path
 * Handles both absolute URLs and relative paths from the API
 */
export function buildImageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;

  // If it's already an absolute URL (http/https), return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // If it's a relative path, prepend the API base URL
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ||
                     import.meta.env.VITE_API_URL ||
                     'http://localhost:5000';

  // Remove trailing slash from base URL and leading slash from path if present
  const baseUrl = apiBaseUrl.replace(/\/$/, '');
  const relativePath = path.startsWith('/') ? path : `/${path}`;

  return `${baseUrl}${relativePath}`;
}
