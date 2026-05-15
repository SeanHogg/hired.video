/**
 * Studio editor preference — frozen.
 *
 * V2 is the only editor now. The opt-in toggle was removed once V1 stopped
 * being routed to (see [Studio.tsx](hired.video/frontend/pages/studio/Studio.tsx)).
 * The hook + imperative reader stay because the shared components
 * (NewVideoSplitButton, WizardLauncher) consult `isV2` when deciding
 * project `kind` — single source of truth so every caller agrees the
 * answer is V2 today AND in the future when this hook is finally
 * deleted alongside the last v1 reference.
 *
 * Why keep the hook at all instead of inlining `true`? So when V1 is
 * fully retired, removing the editor concept is a one-file change —
 * not a sweep through every consumer. This is the same DRY rationale
 * that put the hook here in the first place.
 */

// Type kept wider than what the runtime returns so the v1
// EditorVersionToggle (which still tries to set "classic") typechecks
// without being modified — V1 code is unmaintained per the user's
// direction. Once the toggle component is deleted alongside V1, narrow
// to `"v2"`.
export type StudioEditorVersion = "v2" | "classic";

/** Reactive read. The setter is a no-op kept for back-compat with the
 *  EditorVersionToggle component (v1 still mounts it inside StudioSidebar).
 *  Once that mount is gone, this hook + the toggle file can both go away. */
export function useEditorPreference(): {
  version: StudioEditorVersion;
  setVersion: (next: StudioEditorVersion) => void;
  isV2: boolean;
} {
  return {
    version: "v2",
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    setVersion: (_next) => {
      // No-op — V2 is the only editor; the toggle UI has been removed
      // from every V2 surface. The v1 sidebar's still-mounted toggle
      // calls this but the result is the same regardless.
    },
    isV2: true,
  };
}

/** Imperative read for non-React callers. Always V2. */
export function getEditorVersion(): StudioEditorVersion {
  return "v2";
}
