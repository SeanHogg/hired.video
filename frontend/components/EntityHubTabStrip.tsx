// EntityHubTabStrip — renders the hub-level tab strip (e.g.
// "My Resumes / Available / Sourced") above any non-hub surface in the
// same entity family (detail / edit / create pages). The strip itself
// is identical to the one EntityHubShell renders on the hub list page,
// so users keep the "where am I" context as they navigate deeper.
//
// Sticky-tab logic: the hub list page writes the current active tab key
// to `sessionStorage["entity-hub-tab:<entity>"]` whenever it changes
// (see `writeEntityHubActiveTab`). This component reads it on mount so
// the user's last-visited tab stays highlighted on the detail surface.
// On a direct load (no prior hub visit, no sessionStorage), nothing is
// highlighted — the strip still renders as plain navigation.

import { useMemo } from "react";
import PageHeader, { type PageHeaderTab } from "@/components/PageHeader";
import { useResumesTabs } from "@/hooks/use-resumes-tabs";
import { useJobsTabs } from "@/hooks/use-jobs-tabs";
import { useCompaniesTabs } from "@/hooks/use-companies-tabs";
import { usePeopleTabs } from "@/hooks/use-people-tabs";

export type EntityHubKind = "resume" | "job" | "person" | "company";

const STORAGE_KEY_PREFIX = "entity-hub-tab:";

function storageKey(entity: EntityHubKind): string {
  return `${STORAGE_KEY_PREFIX}${entity}`;
}

/** Hub list pages call this whenever the active tab changes so detail
 *  / edit / create surfaces in the same entity family can restore the
 *  context. Safe to call from SSR — guards on `typeof window`. */
export function writeEntityHubActiveTab(entity: EntityHubKind, tabKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(entity), tabKey);
  } catch {
    // sessionStorage can throw in private browsing / quota-exceeded —
    // the strip just falls back to "no highlight", which is fine.
  }
}

function readEntityHubActiveTab(entity: EntityHubKind): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(storageKey(entity));
  } catch {
    return null;
  }
}

function useTabsForEntity(entity: EntityHubKind): PageHeaderTab[] {
  // Each per-entity hook is its own SSoT (see use-*-tabs.ts). We pick the
  // right one at call time — these hooks accept no required args, so the
  // strip surface doesn't need to know about per-page badge counts.
  const resumesTabs = useResumesTabs();
  const jobsTabs = useJobsTabs();
  const companiesTabs = useCompaniesTabs();
  const peopleTabs = usePeopleTabs();
  switch (entity) {
    case "resume":  return resumesTabs;
    case "job":     return jobsTabs;
    case "company": return companiesTabs;
    case "person":  return peopleTabs;
  }
}

export interface EntityHubTabStripProps {
  entity: EntityHubKind;
  /** Override the active key — useful for surfaces that know which tab
   *  they belong to without leaning on sessionStorage. */
  activeKey?: string;
  className?: string;
}

export default function EntityHubTabStrip({
  entity,
  activeKey,
  className,
}: EntityHubTabStripProps): JSX.Element | null {
  const tabs = useTabsForEntity(entity);
  // Reading sessionStorage in render is fine — the user can't change it
  // without a navigation, which already triggers a re-render. We do
  // re-evaluate every render so a tab change in a still-mounted hub
  // page reflects without an extra effect.
  const stored = readEntityHubActiveTab(entity);
  const effectiveActive = useMemo(() => {
    if (activeKey) return activeKey;
    if (stored && tabs.some((t) => t.key === stored)) return stored;
    return undefined;
  }, [activeKey, stored, tabs]);

  if (tabs.length === 0) return null;
  return <PageHeader tabs={tabs} activeTabKey={effectiveActive} className={className} />;
}
