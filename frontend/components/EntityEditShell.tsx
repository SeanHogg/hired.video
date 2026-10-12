import type { ComponentType, ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import PageHeader, { type PageHeaderTab } from "@/components/PageHeader";
import EntityHubTabStrip, { type EntityHubKind } from "@/components/EntityHubTabStrip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Singularize a small set of English plural forms used by entity parent
 * labels — "Resumes" → "Resume", "Companies" → "Company", "Activities"
 * → "Activity", "Boxes" → "Box", "Categories" → "Category".
 *
 * Intentionally narrow: handles the patterns the app actually uses today
 * and falls through to the input when nothing matches (e.g. "People",
 * "Media", "News"). Pass `parent.singular` explicitly for irregular
 * plurals that don't fit these rules.
 */
function singularize(plural: string): string {
  // -ies → -y (Companies, Activities, Categories)
  if (/ies$/i.test(plural)) return plural.slice(0, -3) + "y";
  // -ches / -shes / -xes / -zes / -sses → strip the trailing "es"
  if (/(ches|shes|xes|zes|sses)$/i.test(plural)) return plural.slice(0, -2);
  // -s (but not -ss, already handled above) → strip the trailing "s"
  if (/[^s]s$/i.test(plural)) return plural.slice(0, -1);
  return plural;
}

/**
 * EntityEditShell — shared chrome for every "/entity/edit/:id" surface
 * (Company, Job, Resume, …).
 *
 * Owns the layout (`AppShell` + max-width wrapper + `p-4 md:p-6`), the
 * breadcrumb header (`{Parent} / {Entity Name} / Edit`), the page title
 * (`Edit {entity}`), the back-to-entity action button, and the four
 * mutually-exclusive states (loading skeleton, access-denied, not-found,
 * ready). Consumers just declare the entity context and pass the editor
 * body — no more hand-rolled state cards in each page.
 *
 * One state is rendered at a time, in priority order:
 *   1. accessDenied  → "Access Denied" card
 *   2. loading       → animated skeleton block
 *   3. notFound      → "{Entity} Not Found" card with a back link
 *   4. otherwise     → children (the editor)
 *
 * The shell intentionally does NOT take a `canEdit` boolean — callers
 * derive access via their own permission hook and either pass
 * `accessDenied` or render their own gating UI inside `children`.
 */
export interface EntityEditShellProps {
  /** Parent surface (Companies, Jobs, Resumes, …). Drives breadcrumb. */
  parent: {
    label: string;
    to: string;
    icon?: ComponentType<{ className?: string }>;
    /** Singular form used in default titles + state-card copy. Defaults
     *  to a naive `s$` strip ("Resumes" → "Resume"), which mishandles
     *  "Companies" → "Company" — pass explicitly when the strip is
     *  wrong. */
    singular?: string;
  };
  /** The entity being edited. Drives breadcrumb middle segment + back action. */
  entity: {
    /** Display name. Falls back to "Edit" when no entity has loaded yet. */
    label?: string;
    /** Detail page URL. The back button + middle breadcrumb segment link to it. */
    to?: string;
  };
  /** Title rendered in the page heading. Defaults to `${leafLabel} {entity.label}`. */
  title?: ReactNode;
  description?: ReactNode;

  /** Breadcrumb leaf label + default title verb. Defaults to "Edit". Pass
   *  "Create" for /entity/create surfaces so the strip reads
   *  `Parent / Create` and the title defaults to `Create {Parent}`. */
  leafLabel?: string;

  /** Loading skeleton while the entity is being fetched. */
  loading?: boolean;

  /** Show "Access Denied" state. Higher priority than loading / notFound. */
  accessDenied?: boolean;
  accessDeniedMessage?: string;

  /** Show "Not Found" state. Inferred from `loading=false && !ready`. */
  notFound?: boolean;
  notFoundLabel?: string;
  notFoundMessage?: string;

  /** Optional extra page-header actions rendered alongside the back button. */
  extraActions?: ReactNode;

  /** Tailwind max-width class for the inner wrapper. Defaults to `max-w-4xl`. */
  maxWidthClass?: string;
  className?: string;

  /** Entity family this edit surface belongs to. When set, the hub-level
   *  tab strip (e.g. "My Resumes / Available / Sourced") renders above
   *  the breadcrumb header — same component the hub list page uses —
   *  with the user's last-visited tab highlighted (sessionStorage). */
  hubEntity?: EntityHubKind;

  /** Editor body (JobScreeningCard, …). */
  children: ReactNode;
}

export default function EntityEditShell({
  parent,
  entity,
  title,
  description,
  leafLabel = "Edit",
  loading,
  accessDenied,
  accessDeniedMessage,
  notFound,
  notFoundLabel,
  notFoundMessage,
  extraActions,
  maxWidthClass = "max-w-4xl",
  className,
  hubEntity,
  children,
}: EntityEditShellProps): JSX.Element {
  const parentSingular = parent.singular ?? singularize(parent.label);
  const backTo = entity.to ?? parent.to;
  const backLabel = entity.label ? `Back to ${entity.label}` : `Back to ${parent.label}`;

  const tabs: PageHeaderTab[] = [
    { key: "parent", label: parent.label, icon: parent.icon, to: parent.to },
    ...(entity.label
      ? [
          {
            key: "entity",
            label: entity.label,
            ...(entity.to ? { to: entity.to } : {}),
          } satisfies PageHeaderTab,
        ]
      : []),
    { key: "leaf", label: leafLabel },
  ];

  const headerTitle =
    title ?? (entity.label ? `${leafLabel} ${entity.label}` : `${leafLabel} ${parentSingular}`);

  const header = (
    <PageHeader
      tabs={tabs}
      activeTabKey="leaf"
      title={headerTitle}
      description={description}
      actions={
        <>
          <Button asChild variant="outline">
            <Link to={backTo}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {backLabel}
            </Link>
          </Button>
          {extraActions}
        </>
      }
    />
  );

  let body: ReactNode;
  if (accessDenied) {
    body = (
      <Card>
        <CardContent className="p-8 text-center">
          <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
          <p className="text-muted-foreground mb-6">
            {accessDeniedMessage ??
              `You don't have permission to edit this ${parentSingular.toLowerCase()}.`}
          </p>
          <Button asChild>
            <Link to={parent.to}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to {parent.label}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  } else if (loading) {
    body = (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  } else if (notFound) {
    body = (
      <Card>
        <CardContent className="p-8 text-center">
          <h3 className="text-lg font-semibold mb-2">
            {notFoundLabel ?? `${parentSingular} Not Found`}
          </h3>
          <p className="text-muted-foreground mb-6">
            {notFoundMessage ??
              `The ${parentSingular.toLowerCase()} you're trying to edit could not be found or you don't have permission to edit it.`}
          </p>
          <Button asChild>
            <Link to={parent.to}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to {parent.label}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  } else {
    body = children;
  }

  return (
    <AppShell bgClassName="bg-background">
      <div className={cn(maxWidthClass, "mx-auto p-4 md:p-6", className)}>
        {hubEntity && <EntityHubTabStrip entity={hubEntity} />}
        {header}
        {body}
      </div>
    </AppShell>
  );
}
