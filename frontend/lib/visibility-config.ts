import { Globe, Users, Lock, Edit, UserCheck, EyeOff, Building2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ContentVisibility =
  | "public"
  | "recruiter"
  | "recruiter_only"
  | "company_only"
  | "connections"
  | "private"
  | "draft"
  | "unlisted";

export interface VisibilityConfig {
  icon: LucideIcon;
  label: string;
  className: string;
}

export function getVisibilityConfig(
  visibility: ContentVisibility | string | undefined | null,
): VisibilityConfig {
  switch (visibility) {
    case "public":
      return { icon: Globe, label: "Public", className: "bg-green-100 text-green-800" };
    case "recruiter":
    case "recruiter_only":
      return { icon: UserCheck, label: "Recruiters", className: "bg-blue-100 text-blue-800" };
    case "company_only":
      return { icon: Building2, label: "Company only", className: "bg-teal-100 text-teal-800" };
    case "connections":
      return { icon: Users, label: "Connections", className: "bg-indigo-100 text-indigo-800" };
    case "private":
      return { icon: Lock, label: "Private", className: "bg-gray-100 text-gray-800" };
    case "draft":
      return { icon: Edit, label: "Draft", className: "bg-orange-100 text-orange-800" };
    case "unlisted":
      return { icon: EyeOff, label: "Unlisted", className: "bg-amber-100 text-amber-800" };
    default:
      return { icon: Lock, label: "Private", className: "bg-gray-100 text-gray-800" };
  }
}

export interface HeaderBadgeConfig {
  text: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  className: string;
  icon: LucideIcon;
}

/**
 * Returns a badge config shaped for CardHeaderWithAvatar's `badges` prop.
 * Use this instead of hand-rolling per-card privacy badge logic so every
 * content type renders the same icon + label + color for a given visibility.
 */
export function visibilityHeaderBadge(
  visibility: ContentVisibility | string | undefined | null,
): HeaderBadgeConfig {
  const config = getVisibilityConfig(visibility);
  return {
    text: config.label,
    variant: "secondary",
    className: `text-xs ${config.className}`,
    icon: config.icon,
  };
}
