import type { ComponentType } from "react";
import type { PageHeaderTab } from "@/components/PageHeader";

/**
 * Build the canonical 2-segment "parent / current" breadcrumb tab strip
 * used by every entity detail page (Companies, People, Jobs, …).
 *
 * Pure function (no React state) — kept named without the `use` prefix
 * so the rules-of-hooks lint doesn't fire when callers invoke it after
 * an early return in a render path. Detail pages with additional
 * in-page section tabs can spread the array and append:
 *
 *   const tabs = [
 *     ...entityBreadcrumb({ label: "Jobs", to: "/jobs", icon: Briefcase }, job.title),
 *     { key: "candidates", … },
 *   ];
 *
 * The leaf segment renders as a non-navigating `<span>` (no `to`) so it
 * reads as the active breadcrumb tip rather than a link to itself.
 */
export interface EntityBreadcrumbParent {
  label: string;
  to: string;
  icon?: ComponentType<{ className?: string }>;
}

export function entityBreadcrumb(
  parent: EntityBreadcrumbParent,
  currentLabel: string,
  options?: { currentKey?: string; parentKey?: string },
): PageHeaderTab[] {
  return [
    {
      key: options?.parentKey ?? "parent",
      label: parent.label,
      icon: parent.icon,
      to: parent.to,
    },
    {
      key: options?.currentKey ?? "current",
      label: currentLabel,
    },
  ];
}
