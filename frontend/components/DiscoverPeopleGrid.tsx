/**
 * DiscoverPeopleGrid — the "Discover People" surface used by both the
 * recruiter and non-recruiter branches of `/people`. Owns the
 * loading / error / empty / grid render switch, the PublicUser →
 * UserMetadata mapping, and the pagination footer. Self-gates the
 * AddToListMenu (hiring-side only) via `useAuth` rather than accepting
 * a prop-drilled boolean.
 */

import { Eye, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import Pagination from "@/components/Pagination";
import PeopleCard from "@/components/PeopleCard";
import { HorizontalScroller } from "@/components/HorizontalScroller";
import { Button } from "@/components/ui/button";
import AddToListMenu from "@/components/lists/AddToListMenu";
import type { ViewMode } from "@/components/ViewModeToggle";
import { useAuth } from "@/lib/auth";
import { useConnectionStatuses } from "@/lib/use-connection-statuses";
import { createRolePermissions } from "@/lib/role-utils";
import { getPersonRoleLabel } from "@/lib/person-display";
import type { PublicUser } from "@/lib/services/user-service";
import type { UserMetadata } from "@/types/people";

interface DiscoverPeopleGridProps {
  /** The displayed slice — already filtered/paged by the parent. */
  people: PublicUser[];
  isLoading: boolean;
  error: string | null;
  viewMode: ViewMode;
  /** When the parent has filtered by a list, the empty-state copy
   *  switches from "no people found" to "no people in this list". */
  isFilteredByList?: boolean;
  // Pagination
  currentPage: number;
  totalPeople: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (count: number) => void;
  // Handlers — passed straight through to PeopleCard
  onConnect: (id: string, message?: string) => void;
  onMessage: (id: string) => void;
  onAcceptConnection: (id: string) => void;
  onRejectConnection: (id: string) => void;
  onAddToTalentPool: (id: string) => void;
  onCardActions: (id: string) => void;
  onClearFilters: () => void;
  onRetry: () => void;
}

export default function DiscoverPeopleGrid({
  people,
  isLoading,
  error,
  viewMode,
  isFilteredByList = false,
  currentPage,
  totalPeople,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  onConnect,
  onMessage,
  onAcceptConnection,
  onRejectConnection,
  onAddToTalentPool,
  onCardActions,
  onClearFilters,
  onRetry,
}: DiscoverPeopleGridProps) {
  const { user } = useAuth();
  // Consolidated hiring-side check — folds admin / SA in via the
   // canonical canManageJobs permission (gap #360).
  const isRecruiterOrEmployer = user
    ? createRolePermissions(user.role).canManageJobs
    : false;

  // The /api/users/public endpoint excludes the viewer's own row server-side
  // (so pagination counts match the visible slice). No client-side filter
  // needed — passing `people` through directly.
  const visiblePeople = people;

  // Batch-fetch connection statuses for everyone in the visible slice so
  // each card renders its real button (Connect / Pending / Message / etc.)
  // instead of always showing "Connect". Hook self-excludes the viewer.
  const connectionStatuses = useConnectionStatuses(
    visiblePeople.map((p) => p.id),
  );

  // No inline display-name / initials / role derivation — PeopleCard routes
  // through lib/person-display.ts (#1657). The DTO from /api/users/people
  // already guarantees non-empty fullName + firstName + lastName (server-side
  // fallback in toPublicUserCardDto), so this mapper is now a thin shape
  // coercion only.
  const toMetadata = (person: PublicUser): UserMetadata => ({
    ...(person as unknown as UserMetadata),
    // Empty string flows through — PeopleCard guards the location chip on a
    // truthy value instead of rendering fabricated copy (#1659).
    location: person.location || "",
    visibility: "public",
    status: "active",
    lastActiveAt: person.updatedAt || person.createdAt || "",
    profileViews: (person as { profileViews?: number }).profileViews ?? 0,
    connectionCount: 0,
    followerCount: 0,
    emailConfirmed: person.emailConfirmed || false,
    isPro: person.isPro || false,
    companyName: person.currentCompany || "",
    currentPosition: person.currentRole || "",
  });

  // One card definition shared by the Scroll and Grid views so the full
  // handler wiring lives in a single place (Table renders its own dense
  // rows below).
  const renderPersonCard = (person: PublicUser) => (
    <PeopleCard
      key={person.id}
      person={toMetadata(person)}
      connectionStatus={connectionStatuses[person.id] ?? "none"}
      layout="vertical"
      onConnect={onConnect}
      onMessage={onMessage}
      onAcceptConnection={onAcceptConnection}
      onRejectConnection={onRejectConnection}
      onAddToTalentPool={onAddToTalentPool}
      onActions={() => onCardActions(person.id)}
      extraMenuItems={
        isRecruiterOrEmployer ? (
          <AddToListMenu
            entityType="person"
            entityId={person.id}
            entityLabel={person.fullName ?? "person"}
          />
        ) : undefined
      }
    />
  );

  return (
    <div>
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="animate-pulse">
              <div className="bg-muted rounded-lg h-48" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={onRetry}>Try Again</Button>
        </div>
      ) : visiblePeople.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            {isFilteredByList
              ? "No people in this list match your filters."
              : "No people found matching your criteria."}
          </p>
          <Button onClick={onClearFilters}>Clear Filters</Button>
        </div>
      ) : viewMode === "table" ? (
        <PeopleTable people={visiblePeople} />
      ) : viewMode === "scroll" ? (
        <HorizontalScroller itemCount={visiblePeople.length}>
          {visiblePeople.map((person) => (
            <div key={person.id} className="w-72 shrink-0 snap-start">
              {renderPersonCard(person)}
            </div>
          ))}
        </HorizontalScroller>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visiblePeople.map((person) => renderPersonCard(person))}
        </div>
      )}

      {!isLoading && !error && visiblePeople.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalItems={totalPeople}
          itemsPerPage={itemsPerPage}
          onPageChange={onPageChange}
          onItemsPerPageChange={onItemsPerPageChange}
        />
      )}
    </div>
  );
}

/**
 * Structural minimum a Table row needs — kept narrow so both the browse
 * feed's `PublicUser` and the Connections tab's `UserWithOwnership` satisfy
 * it without a cast.
 */
export interface PersonTableRow {
  id?: string | null;
  slug?: string | null;
  fullName?: string | null;
  headline?: string | null;
  role?: string | number | null;
  location?: string | null;
  currentCompany?: string | null;
}

/**
 * Dense Table view of the people feed — the third browse layout alongside
 * Scroll and Grid. One row per person with name, headline, role, location
 * and company, plus a View-profile action. Pagination is owned by the
 * parent, so this renders exactly the rows it's handed. Exported so the
 * People page's Connections tab can reuse the identical layout.
 */
export function PeopleTable({ people }: { people: PersonTableRow[] }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">{t("labels.name", "Name")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.headline", "Headline")}</th>
            <th className="px-3 py-2 font-medium">{t("fields.industry.label", "Role")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.location", "Location")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.company", "Company")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("labels.actions", "Actions")}</th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => {
            const profileHref = `/people/${person.slug || person.id || ""}`;
            return (
              <tr
                key={person.id}
                className="border-b border-border last:border-0 hover:bg-muted/30"
              >
                <td className="px-3 py-2">
                  <Link
                    to={profileHref}
                    className="font-medium hover:text-brand-purple"
                  >
                    {person.fullName || t("labels.unnamed", "Unnamed")}
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {person.headline || "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {person.role != null && person.role !== ""
                    ? getPersonRoleLabel(person.role, t)
                    : "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {person.location ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {person.location}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {person.currentCompany || "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <Button asChild variant="ghost" size="sm">
                      <Link to={profileHref}>
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        {t("actions.view", "View")}
                      </Link>
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
