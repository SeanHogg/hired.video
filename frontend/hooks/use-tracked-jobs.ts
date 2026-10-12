/**
 * useTrackedJobs — single source of truth for "is this job saved by the
 * current viewer?" across every surface that renders job cards.
 *
 * The list of saved-job IDs lives in a module-level store with a
 * subscriber pattern so every mounted card stays in sync without each
 * one fetching its own copy. The cache:
 *
 *   • Lazy-loads via `jobService.getSavedJobs()` the first time anyone
 *     subscribes while authenticated (zero requests when no card mounts).
 *   • Clears itself on logout / viewer swap (impersonation included).
 *   • Refreshes whenever the Chrome extension fires
 *     `tracked-job-changed`, so saving a job from the side panel light
 *     up the "Saved" pill on every open card in the same tab.
 *   • Exposes optimistic `markTracked` / `markUntracked` mutators so a
 *     card's click-handler can flip its own pill before the network
 *     round-trip and roll back on failure.
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { useAuth } from "@/lib/auth";
import { jobService } from "@/lib/services/job-service";

type Status = "idle" | "loading" | "loaded" | "error";

interface StoreState {
  ids: ReadonlySet<string>;
  status: Status;
  viewerId: string | null;
}

let state: StoreState = { ids: new Set(), status: "idle", viewerId: null };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setState(next: StoreState) {
  state = next;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

async function loadFor(viewerId: string) {
  setState({ ...state, viewerId, status: "loading" });
  try {
    const jobs = await jobService.getSavedJobs();
    if (state.viewerId !== viewerId) return; // viewer changed mid-flight
    setState({ ids: new Set(jobs.map((j) => j.id)), status: "loaded", viewerId });
  } catch {
    if (state.viewerId !== viewerId) return;
    setState({ ...state, status: "error", viewerId });
  }
}

function refreshForCurrentViewer() {
  if (state.viewerId) void loadFor(state.viewerId);
}

// Listen once for extension-side bookmark changes so every subscriber
// re-renders without each one wiring its own listener. Attached at
// module load — auth-bridge.js dispatches the event whether or not any
// card is mounted, but the handler is a no-op when the cache is empty.
if (typeof window !== "undefined") {
  window.addEventListener("hired.video:extension-event", (e) => {
    const detail = (e as CustomEvent<{ type?: string }>).detail;
    if (detail?.type === "tracked-job-changed") refreshForCurrentViewer();
  });
}

export interface TrackedJobsApi {
  /** True when the viewer has saved/tracked this job. False for
   *  anonymous viewers and while the cache is still loading. */
  isTracked: (jobId: string) => boolean;
  /** Optimistic add — call right after `jobService.saveJob()` resolves. */
  markTracked: (jobId: string) => void;
  /** Optimistic remove — call right after `jobService.unsaveJob()` resolves. */
  markUntracked: (jobId: string) => void;
  /** Force a refetch (e.g. after restoring from an error toast). */
  refresh: () => void;
}

export function useTrackedJobs(): TrackedJobsApi {
  const { user, isAuthenticated } = useAuth();
  const viewerId = isAuthenticated ? user?.id ?? null : null;
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!viewerId) {
      if (state.viewerId !== null || state.ids.size > 0) {
        setState({ ids: new Set(), status: "idle", viewerId: null });
      }
      return;
    }
    // Already loaded for this viewer, or a load is in flight — leave it.
    if (state.viewerId === viewerId && state.status !== "idle") return;
    void loadFor(viewerId);
  }, [viewerId]);

  const isTracked = useCallback(
    (jobId: string) => (viewerId ? snap.ids.has(jobId) : false),
    [snap.ids, viewerId],
  );

  const markTracked = useCallback((jobId: string) => {
    if (state.ids.has(jobId)) return;
    const next = new Set(state.ids);
    next.add(jobId);
    setState({ ...state, ids: next });
  }, []);

  const markUntracked = useCallback((jobId: string) => {
    if (!state.ids.has(jobId)) return;
    const next = new Set(state.ids);
    next.delete(jobId);
    setState({ ...state, ids: next });
  }, []);

  const refresh = useCallback(() => refreshForCurrentViewer(), []);

  return { isTracked, markTracked, markUntracked, refresh };
}
