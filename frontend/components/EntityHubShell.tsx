// EntityHubShell — shared shell for the four entity-list pages
// (/resumes, /jobs, /people, /companies).
//
// A page declares an array of `EntityHubTab` descriptors and the shell
// owns:
//   - PageHeader chrome (tabs, title, description, header actions)
//   - role gating via persona.ts (`visibleTo` SA-bypass) — descriptors
//     list the roles that should see them; SA gets the union for free
//   - URL ↔ active-tab resolution (`?tab=KEY`, falls back to first
//     visible tab when missing or invalid for the viewer's role)
//   - per-tab title / description / header actions / body render
//
// Per the standing DRY rule:
//   - tabs and header actions self-gate (return null when not entitled)
//     instead of receiving prop-drilled `canX` booleans
//   - the SA-bypass rule lives in ONE place (`visibleTo` in persona.ts);
//     each descriptor only names the positive role list

import { type ReactNode, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import type { UserRole } from "@shared/user-roles";
import { visibleTo } from "@/lib/persona";
import { AppShell } from "@/components/AppShell";
import { APP_PAGE_COLUMN } from "@/lib/ui/page-layout";
import PageHeader, { type PageHeaderTab } from "@/components/PageHeader";
import { usePermissions } from "@/hooks/use-permissions";
import { writeEntityHubActiveTab, type EntityHubKind } from "@/components/EntityHubTabStrip";

/** Either a node or a deferred render function. The shell only invokes
 *  the function for the *active* tab, so inactive tab bodies don't run. */
export type RenderableNode = ReactNode | (() => ReactNode);

function resolveNode(input: RenderableNode | undefined): ReactNode {
  if (input === undefined) return undefined;
  return typeof input === "function" ? (input as () => ReactNode)() : input;
}

export interface EntityHubTab {
  /** URL-safe key — matches `?tab=KEY` and the active-tab marker. */
  key: string;
  /** Tab label rendered in the PageHeader strip. */
  label: string;
  /** Lucide icon for the tab. */
  icon: LucideIcon;
  /**
   * Roles that should see this tab. SA is implicitly added by `visibleTo`
   * — never list it explicitly so we can't accidentally forget it on a
   * new tab. An empty list means "no one", which is rejected at runtime.
   */
  roles: readonly UserRole[];
  /** Header title shown above the body. */
  title: ReactNode;
  /** Header description (small text under the title). */
  description?: ReactNode;
  /** Inline search slot. When provided, PageHeader replaces the title/
   *  description block with this node. Used on hub tabs (e.g. Companies
   *  browse) that relocated the global HeaderSearch inline. */
  search?: ReactNode;
  /** Pin the header as the sticky, tonally-distinct action bar even without a
   *  `search` slot. A tab with `search` is sticky automatically; set this on
   *  title/description-only tabs (e.g. Companies connections / mine / team)
   *  so their tabs + actions follow the same pinned action-panel pattern. */
  sticky?: boolean;
  /** Optional badge value for the tab strip (count / status). */
  badge?: ReactNode;
  /** Right-side header buttons specific to this tab. */
  headerActions?: RenderableNode;
  /** Optional meta slot rendered under the title (e.g. "Active: …" badge). */
  meta?: RenderableNode;
  /** Body of the tab. Only the active tab's body renders / runs. */
  body: RenderableNode;
}

export interface EntityHubShellProps {
  /** Entity name — drives the URL prefix (`/resumes`, `/jobs`, …) and
   *  the sessionStorage slot that lets detail / edit / create pages
   *  restore the user's last-visited tab in the strip. */
  entity: EntityHubKind;
  /** Display-order tab descriptors. Filtered by role at render time. */
  tabs: EntityHubTab[];
  /** Default tab key when `?tab=` is missing or invalid for the viewer's
   *  role. Must match one of the descriptor keys. If the default isn't
   *  visible to the viewer, the first visible tab wins. */
  defaultTab: string;
  /** AppShell background override (matches existing page idioms). */
  bgClassName?: string;
  /** Optional content rendered between the header and the body — e.g. a
   *  shared SearchBar that several tabs read from. */
  sidecar?: RenderableNode;
}

const ENTITY_BASE_PATHS: Record<EntityHubShellProps["entity"], string> = {
  resume: "/resumes",
  job: "/jobs",
  person: "/people",
  company: "/companies",
};

export default function EntityHubShell({
  entity,
  tabs,
  defaultTab,
  bgClassName = "bg-background",
  sidecar,
}: EntityHubShellProps): JSX.Element {
  const { effectiveRole } = usePermissions();
  const [searchParams] = useSearchParams();

  const visibleTabs = useMemo(
    () => tabs.filter((t) => t.roles.length > 0 && visibleTo(t.roles, effectiveRole)),
    [tabs, effectiveRole],
  );

  const requestedKey = searchParams.get("tab");
  const activeTab = useMemo(() => {
    if (visibleTabs.length === 0) return null;
    if (requestedKey) {
      const match = visibleTabs.find((t) => t.key === requestedKey);
      if (match) return match;
    }
    const fallback = visibleTabs.find((t) => t.key === defaultTab);
    return fallback ?? visibleTabs[0];
  }, [visibleTabs, requestedKey, defaultTab]);

  const headerTabs = useMemo<PageHeaderTab[]>(
    () =>
      visibleTabs.map((t) => ({
        key: t.key,
        label: t.label,
        icon: t.icon,
        to: t.key === defaultTab ? ENTITY_BASE_PATHS[entity] : `${ENTITY_BASE_PATHS[entity]}?tab=${t.key}`,
        badge: t.badge,
      })),
    [visibleTabs, entity, defaultTab],
  );

  // Remember the user's active tab so EntityHubTabStrip on detail / edit
  // / create pages can keep the same tab highlighted as they navigate
  // deeper. Cleared only on session end — sessionStorage scope is fine.
  useEffect(() => {
    if (activeTab) writeEntityHubActiveTab(entity, activeTab.key);
  }, [entity, activeTab?.key]);

  return (
    <AppShell bgClassName={bgClassName}>
      <div className={APP_PAGE_COLUMN}>
        <div>
          <PageHeader
            tabs={headerTabs}
            activeTabKey={activeTab?.key}
            title={activeTab?.search ? undefined : activeTab?.title}
            description={activeTab?.search ? undefined : activeTab?.description}
            search={activeTab?.search}
            sticky={activeTab?.sticky}
            actions={resolveNode(activeTab?.headerActions)}
            meta={resolveNode(activeTab?.meta)}
          />
          {sidecar !== undefined && resolveNode(sidecar)}
          {activeTab && resolveNode(activeTab.body)}
        </div>
      </div>
    </AppShell>
  );
}
