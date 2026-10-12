/**
 * The studio editor's readiness gates, read from the format-runtime
 * descriptor. Plain derivation (no state) so it can sit above the editor's
 * early returns. Lifted out of StudioEditorV2.
 */
import type { StudioProject } from "@/lib/services/studio-service";
import type { FormatRuntime } from "./format-runtime";
import type { StudioRuntimes } from "./use-history-runtimes";

export interface EditorReadinessInput {
  formatRuntime: FormatRuntime;
  runtimes: StudioRuntimes;
  /** The route id — "new" for an unsaved draft. */
  projectId: string;
  persistedProject: StudioProject | null;
  missingProject: boolean;
}

export interface EditorReadiness {
  /** The format's runtime has hydrated, so its canvas can mount. */
  runtimeHydrated: boolean;
  /** Edits may be autosaved to the server. */
  serverAutosaveReady: boolean;
  /** The editor can render the format (else the loading shell). */
  projectReady: boolean;
}

export function editorReadiness({
  formatRuntime,
  runtimes,
  projectId,
  persistedProject,
  missingProject,
}: EditorReadinessInput): EditorReadiness {
  const isNew = projectId === "new";
  // Per-kind runtime readiness — image / animation / game canvases mount null
  // until their state hydrates; Timeline kinds are seeded synchronously by
  // useState, so they are always hydrated.
  const runtimeHydrated = formatRuntime.hydrated(runtimes);

  // Server autosave — signed-in users' edits persist to the server on a
  // debounced cadence so a session expiry / logout never loses work. A project
  // that failed to load (`missingProject`) is excluded so a transient read
  // error can't silently fork a duplicate row (anon visitors are excluded by
  // the autosave itself). Undo/redo makes continuous save safe.
  const serverAutosaveReady =
    runtimeHydrated && !missingProject && (isNew || persistedProject !== null) && formatRuntime.saveReady(runtimes);

  // Project-ready gate — closes the "wrong-chrome flash" where opening an
  // existing image/game/animation project via direct URL mounted the video
  // chrome first (`currentMediaKind` falls back to the mount-time template
  // kind until `persistedProject` arrives), then repainted 300–800 ms later:
  //   • `"new"` short-circuits — `?contentTemplate=` already gave the kind
  //     synchronously, so there's no wait and no flash.
  //   • An existing project waits until it loads OR the load failed
  //     (`missingProject` — the empty editor with a "doesn't exist" banner
  //     instead of looping forever).
  // Plus the tick per-kind runtimes need to seed (`runtimeHydrated`).
  const projectReady = (isNew || persistedProject !== null || missingProject) && runtimeHydrated;

  return { runtimeHydrated, serverAutosaveReady, projectReady };
}
