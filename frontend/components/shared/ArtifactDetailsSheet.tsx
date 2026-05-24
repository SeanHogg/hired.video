/**
 * ArtifactDetailsSheet — the common adapter every "simple" entity uses
 * to mount the [🌐 Details] drawer. Wraps <EntityDetailsSheet> with the
 * canonical 2-tab body — Metrics (from <ArtifactAnalyticsDashboard>) +
 * Activity (created / updated / views) — so a page only specifies the
 * artifact kind, id, owner, title, and any kind-specific chips.
 *
 * Resume + Studio video have richer drawers and stay on their own
 * adapter files (scores, SEO autosave). Every other entity — Job,
 * Company, Profile, Article, Studio template, Service — should drop
 * this single component in. Per the DRY rule there's no "is this
 * entity X?" branch in the consumer.
 *
 * Permission gating is delegated to useEntityDetailsPermission; the
 * sheet self-hides when canView is false.
 */

import { Eye } from "lucide-react";
import type { ReactNode } from "react";

import EntityDetailsSheet, {
  type EntityDetailsSection,
} from "@/components/shared/EntityDetailsSheet";
import { ArtifactAnalyticsDashboard } from "@/components/analytics";
import {
  useEntityDetailsPermission,
  type EntityDetailsPermissionArgs,
} from "@/hooks/use-entity-details-permission";
import { formatDate } from "@/lib/utils";

interface Props {
  /** Permission delegate args — same shape consumed by the unified
   *  permission hook. The kind + entity row tell the drawer everything
   *  it needs to gate + fetch + label. */
  permission: EntityDetailsPermissionArgs;
  /** Display title shown in the drawer header. */
  title: string;
  subtitle?: ReactNode;
  /** Optional status chip row (visibility / state badges, etc.). */
  chips?: ReactNode;
  /** Activity counters — null/undefined entries are dropped silently. */
  activity?: {
    viewCount?: number | null;
    createdAt?: string | Date | null;
    updatedAt?: string | Date | null;
    /** Extra dt/dd rows the page wants in the Activity tab. */
    extra?: Array<{ label: string; value: ReactNode }>;
  };
  /** Optional additional sections to insert BEFORE the canonical
   *  Metrics + Activity pair (e.g. SEO meta for templates). */
  extraSectionsBefore?: EntityDetailsSection[];
  layout?: "flat" | "tabs";
}

export default function ArtifactDetailsSheet({
  permission,
  title,
  subtitle,
  chips,
  activity,
  extraSectionsBefore = [],
  layout = "tabs",
}: Props) {
  const perms = useEntityDetailsPermission(permission);

  const artifactId = (permission.entity as any)?.id ?? null;
  const sections: EntityDetailsSection[] = [
    ...extraSectionsBefore,
    {
      key: "metrics",
      label: "Metrics",
      render: () =>
        artifactId ? (
          <ArtifactAnalyticsDashboard
            kind={permission.kind}
            artifactId={artifactId}
          />
        ) : null,
    },
    {
      key: "activity",
      label: "Activity",
      render: () => (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {activity?.viewCount != null && (
            <>
              <dt className="text-muted-foreground flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" />
                Views
              </dt>
              <dd className="tabular-nums">{activity.viewCount}</dd>
            </>
          )}
          {activity?.createdAt && (
            <>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{formatDate(activity.createdAt)}</dd>
            </>
          )}
          {activity?.updatedAt && (
            <>
              <dt className="text-muted-foreground">Updated</dt>
              <dd>{formatDate(activity.updatedAt)}</dd>
            </>
          )}
          {activity?.extra?.map((row) => (
            <>
              <dt key={`${row.label}-k`} className="text-muted-foreground">
                {row.label}
              </dt>
              <dd key={`${row.label}-v`}>{row.value}</dd>
            </>
          ))}
        </dl>
      ),
    },
  ];

  return (
    <EntityDetailsSheet
      title={title}
      subtitle={subtitle}
      chips={chips}
      sections={sections}
      canView={perms.canViewStats}
      layout={layout}
    />
  );
}
