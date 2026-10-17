import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { REREAD_ON_MOUNT, type ByIdQueryOptions } from "./use-viewer-id";
import { userService } from "@/lib/services/user-service";

/** One public user profile by id or slug, keyed `["user", id]`. Disabled
 *  without an id. 403/404 surface as the query error (no toast — the
 *  service suppresses the global error event). */
export function useUser(id: string | null | undefined, options: ByIdQueryOptions = {}) {
  return useQuery({
    queryKey: queryKeys.user.byId(id),
    queryFn: () => userService.getUserById(id as string),
    enabled: !!id && (options.enabled ?? true),
    staleTime: options.staleTime ?? REREAD_ON_MOUNT,
  });
}
