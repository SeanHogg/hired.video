import type { ResumePrivacy } from "@/types/resume";

/**
 * Centralized privacy mapping between backend DisplayPrivacy (number)
 * and frontend ResumePrivacy (string union).
 */
export function mapDisplayPrivacyToResumePrivacy(value: number): ResumePrivacy {
  switch (value) {
    case 0:
      return "public";
    case 1:
      return "recruiter_only";
    case 10:
      return "private";
    default:
      return "private";
  }
}

export function mapResumePrivacyToDisplayPrivacy(priv: ResumePrivacy): number {
  switch (priv) {
    case "public":
      return 0;
    case "recruiter_only":
      return 1;
    case "private":
    case "draft":
    default:
      // Backend has no explicit draft; treat as private by default
      return 10;
  }
}

