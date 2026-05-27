/**
 * DiscoverPeopleGrid — the "Discover People" surface used by both the
 * recruiter and non-recruiter branches of `/people`. Owns the
 * loading / error / empty / grid render switch, the PublicUser →
 * UserMetadata mapping, and the pagination footer. Self-gates the
 * AddToListMenu (hiring-side only) via `useAuth` rather than accepting
 * a prop-drilled boolean.
 */

import Pagination from "@/components/Pagination";
import PeopleCard from "@/components/PeopleCard";
import { Button } from "@/components/ui/button";
import AddToListMenu from "@/components/lists/AddToListMenu";
import { useAuth } from "@/lib/auth";
import { useConnectionStatuses } from "@/lib/use-connection-statuses";
import { createRolePermissions } from "@/lib/role-utils";
import type { PublicUser } from "@/lib/services/user-service";
import type { UserMetadata } from "@/types/people";

interface DiscoverPeopleGridProps {
  /** The displayed slice — already filtered/paged by the parent. */
  people: PublicUser[];
  isLoading: boolean;
  error: string | null;
  viewMode: "grid" | "list";
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

  return (
    <div>
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="animate-pulse">
              <div className="bg-gray-200 rounded-lg h-48" />
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
          <p className="text-gray-600 mb-4">
            {isFilteredByList
              ? "No people in this list match your filters."
              : "No people found matching your criteria."}
          </p>
          <Button onClick={onClearFilters}>Clear Filters</Button>
        </div>
      ) : (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              : "flex flex-col gap-4"
          }
        >
          {visiblePeople.map((person) => {
            // No inline display-name / initials / role derivation —
            // PeopleCard routes through lib/person-display.ts (#1657).
            // The DTO from /api/users/people already guarantees
            // non-empty fullName + firstName + lastName (server-side
            // fallback in toPublicUserCardDto), so this mapper is now
            // a thin shape coercion only.
            const personMetadata: UserMetadata = {
              ...(person as unknown as UserMetadata),
              location: person.location || "Location not specified",
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
            };

            return (
              <PeopleCard
                key={person.id}
                person={personMetadata}
                connectionStatus={connectionStatuses[person.id] ?? "none"}
                layout={viewMode === "list" ? "horizontal" : "vertical"}
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
          })}
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
