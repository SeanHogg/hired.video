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
import { createRolePermissions } from "@/lib/role-utils";
import type { PublicUser } from "@/lib/services/user-service";

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
      ) : people.length === 0 ? (
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
          {people.map((person) => {
            const personMetadata = {
              id: person.id,
              slug: person.slug,
              firstName:
                (person as any).firstName ||
                person.fullName?.split(" ")[0] ||
                "",
              lastName:
                (person as any).lastName ||
                person.fullName?.split(" ").slice(1).join(" ") ||
                "",
              fullName:
                person.fullName ||
                `${(person as any).firstName || ""} ${(person as any).lastName || ""}`.trim(),
              avatar:
                (person as any).profilePicture || person.avatar || "",
              headline: person.headline || "",
              bio: (person as any).bio || person.headline || "",
              location: person.location || "Location not specified",
              role: person.role,
              skills: person.skills,
              openToWork: person.openToWork,
              visibility: "public" as const,
              status: "active" as const,
              companyId: (person as any).companyId || "",
              companyName: person.currentCompany || "",
              createdAt: person.createdAt,
              updatedAt: person.updatedAt,
              lastActiveAt: person.updatedAt || "",
              profileViews: (person as any).profileViews || 0,
              connectionCount: 0,
              followerCount: 0,
              emailConfirmed: person.emailConfirmed || false,
              isPro: person.isPro || false,
              experienceLevel: "Mid Level",
              currentPosition: person.currentRole || "",
              currentCompany: person.currentCompany || "",
              ownership: "tracked" as const,
            };

            return (
              <PeopleCard
                key={person.id}
                person={personMetadata}
                connectionStatus="none"
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

      {!isLoading && !error && people.length > 0 && (
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
