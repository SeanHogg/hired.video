import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePagination } from "@/components/Pagination";
import type { SearchFilters } from "@/components/SearchBar";
import {
  userService,
  type UserFilters,
  type PublicUser,
} from "@/lib/services/user-service";
import { listsService } from "@/lib/services/lists-service";

/**
 * Discover (Browse) data for /people: the paginated public-users fetch, the
 * optional ?list_id membership filter, and the connection-request actions
 * that refresh the grid afterwards.
 */
export function usePeopleDirectory({
  searchFilters,
  listIdFromUrl,
  hasUser,
}: {
  searchFilters: SearchFilters;
  listIdFromUrl: string | null;
  hasUser: boolean;
}) {
  const { t } = useTranslation();
  const [people, setPeople] = useState<PublicUser[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // Lists filter: when ?list_id=X is on the URL, restrict displayed people to
  // members of that list. Null = no filter; Set = filter to these IDs.
  const [listMembership, setListMembership] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [totalPeople, setTotalPeople] = useState<number>(0);

  const {
    currentPage,
    itemsPerPage,
    setCurrentPage,
    handleItemsPerPageChange,
    handleTotalItemsChange,
  } = usePagination(totalPeople, 9);

  const fetchPeople = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const filters: UserFilters = {
        search: searchFilters.search || undefined,
        role: searchFilters.role || undefined,
        location: searchFilters.location || undefined,
        skills: searchFilters.skills
          ? searchFilters.skills.split(",").map((s) => s.trim())
          : undefined,
        openToWork: searchFilters.openToWork || undefined,
        page: currentPage,
        limit: itemsPerPage,
      };

      const result = await userService.getPublicUsers(filters);
      // Include all users (including current user's own profile)
      setPeople(result.items);
      setTotalPeople(result.total);
      handleTotalItemsChange(result.total);
    } catch (err) {
      console.error("Failed to fetch people:", err);
      setError(t("messages.failedLoadPeople"));
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch people when filters or page changes
  useEffect(() => {
    fetchPeople();
  }, [searchFilters, currentPage, itemsPerPage]);

  // Load list membership when ?list_id changes. Membership is a Set of user
  // ids that the displayed people array gets filtered against client-side.
  useEffect(() => {
    if (!listIdFromUrl) {
      setListMembership(null);
      return;
    }
    let cancelled = false;
    listsService
      .getItems(listIdFromUrl, "person")
      .then((res) => {
        if (cancelled) return;
        setListMembership(new Set(res.items.map((i) => i.entityId)));
      })
      .catch(() => {
        if (cancelled) return;
        // List unavailable / deleted — fall back to no filter rather than empty.
        setListMembership(null);
      });
    return () => {
      cancelled = true;
    };
  }, [listIdFromUrl]);

  // Apply the list filter to the displayed people array. We don't mutate
  // `people` itself so the underlying fetch + pagination stays clean.
  const displayedPeople = useMemo(
    () =>
      listMembership ? people.filter((p) => listMembership.has(p.id)) : people,
    [people, listMembership],
  );

  const handleConnect = async (personId: string, message?: string) => {
    if (hasUser) {
      try {
        await userService.sendConnectionRequest({ toUserId: personId, message });
        // Refresh people to show updated connection status
        await fetchPeople();
      } catch (error) {
        console.error("Failed to send connection request:", error);
      }
    }
  };

  const handleAcceptConnection = async (connectionId: string) => {
    if (hasUser) {
      try {
        await userService.acceptConnectionRequest(connectionId);
        // Refresh people to show updated connection status
        await fetchPeople();
      } catch (error) {
        console.error("Failed to accept connection request:", error);
      }
    }
  };

  const handleRejectConnection = async (connectionId: string) => {
    if (hasUser) {
      try {
        await userService.rejectConnectionRequest(connectionId);
        // Refresh people to show updated connection status
        await fetchPeople();
      } catch (error) {
        console.error("Failed to reject connection request:", error);
      }
    }
  };

  const handleMessage = (personId: string) => {
    // Navigate to messaging or open message modal
    console.log("Message person:", personId);
  };

  return {
    people,
    displayedPeople,
    isLoading,
    error,
    totalPeople,
    isFilteredByList: !!listMembership,
    currentPage,
    itemsPerPage,
    setCurrentPage,
    handleItemsPerPageChange,
    fetchPeople,
    handleConnect,
    handleAcceptConnection,
    handleRejectConnection,
    handleMessage,
  };
}
