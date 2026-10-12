// useWishlist — react-query-backed access to the caller's wishlist for one
// entity type. All hearts of the same `entityType` share a single cached id
// set (query dedup), so a page full of cards costs one round-trip and a
// toggle anywhere updates every heart + the My-Wishlist page at once.

import { useCallback } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  listsService,
  type ListEntityType,
} from "@/lib/services/lists-service";

export function wishlistIdsKey(entityType: ListEntityType) {
  return ["wishlist", "ids", entityType] as const;
}

export function useWishlist(entityType: ListEntityType) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const { data: ids = [] } = useQuery({
    queryKey: wishlistIdsKey(entityType),
    queryFn: () => listsService.wishlistIds(entityType),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  const idSet = new Set(ids);

  const mutation = useMutation({
    mutationFn: (entityId: string) =>
      listsService.toggleWishlist(entityType, entityId),
    // Optimistic flip of the shared id set so every heart updates instantly.
    onMutate: async (entityId: string) => {
      await queryClient.cancelQueries({ queryKey: wishlistIdsKey(entityType) });
      const previous =
        queryClient.getQueryData<string[]>(wishlistIdsKey(entityType)) ?? [];
      const next = previous.includes(entityId)
        ? previous.filter((id) => id !== entityId)
        : [...previous, entityId];
      queryClient.setQueryData(wishlistIdsKey(entityType), next);
      return { previous };
    },
    onError: (_err, _entityId, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(wishlistIdsKey(entityType), ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: wishlistIdsKey(entityType) });
      // The enriched My-Wishlist card list (per type) derives from the same
      // membership — refresh it so the page reflects the toggle.
      queryClient.invalidateQueries({ queryKey: ["wishlist", "enriched", entityType] });
    },
  });

  const isWishlisted = useCallback(
    (entityId: string) => idSet.has(entityId),
    [idSet],
  );

  return {
    isAuthenticated,
    ids,
    isWishlisted,
    toggle: (entityId: string) => mutation.mutate(entityId),
    isToggling: mutation.isPending,
  };
}
