/**
 * The app's single React Query client. Lives in a module (not App.tsx) so
 * non-React seams — the /api/bootstrap seeder — can prime query caches with
 * `queryClient.setQueryData` before the consuming hooks mount.
 */

import { QueryClient } from "@tanstack/react-query";
import { logger } from "./logger";
import { reportError, reportMessage } from "./error-tracking";

/** Retry a failed query only when no HTTP response came back (offline, DNS,
 *  timeout — the client stamps `context.transport`), and at most twice. A
 *  4xx/5xx is the server's answer; hammering it amplifies an overload. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  const context = (error as { context?: { transport?: unknown; httpStatus?: unknown } } | null)?.context;
  return context?.transport === true && typeof context.httpStatus !== "number";
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
      staleTime: 10 * 60 * 1000, // 10 minutes
      gcTime: 15 * 60 * 1000, // 15 minutes
      // Tab-switch refetch was firing every active query on focus return
      // and was the single biggest source of avoidable API traffic.
      // Hooks that need fresh data on focus opt in per-query.
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Writes are not idempotent — never replay one automatically.
      retry: 0,
      onError: (error) => {
        logger.error("Mutation error", {
          error: error instanceof Error ? error.message : String(error),
        });
        if (error instanceof Error) {
          reportError(error, { type: "mutation" });
        } else {
          reportMessage(`Mutation error: ${String(error)}`, "error", { type: "mutation" });
        }
      },
    },
  },
});
