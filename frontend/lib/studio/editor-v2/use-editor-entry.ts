/**
 * The editor's entry signals, read ONCE on mount from the URL (template seed,
 * creator template, subject deep-link, `?capture=`), the mount-time kind
 * defaults they imply, and the post-load re-application of those defaults
 * once the server's `mediaKind` is known. Lifted out of StudioEditorV2.
 */
import { useEffect, useMemo, useRef } from "react";
import { parseStudioSubject, type StudioSubject } from "@shared/studio-subject";
import type { MediaKind } from "@shared/media-kinds";
import type { StudioProject } from "@/lib/services/studio-service";
import { TEMPLATE_CATALOG } from "@/lib/studio/templates/catalog";
import { slugToBuiltinId } from "@/lib/templates/registry";
import type { WidgetsMode } from "@/lib/studio/use-focus-left-panel";
import {
  isRecordingMode,
  RECORDING_MODE_ACTION,
  type RecordingActionId,
} from "@/lib/studio/recording-modes";
import { deriveKindDefaults } from "./kind-defaults";

export function useEditorEntry(searchParams: URLSearchParams) {
  // `?contentTemplate=` matches the chooser's emit + classic editor convention.
  // `?template=` was the original v2 param; keep it as a fallback so any v2
  // bookmarks made during the beta still resolve to the right seed.
  const templateHint =
    searchParams.get("contentTemplate") ?? searchParams.get("template");
  // `?studioTemplate=<slug>` arrives from the marketplace "Use this template"
  // button (use-apply-template emits this for studio-creator kind). The hint
  // is resolved asynchronously below — initial state still hydrates from
  // built-in template seeds; the creator-template fetch then overrides it.
  const studioTemplateSlug = searchParams.get("studioTemplate");
  // `?subject=<kind>:<id>` arrives from every entity-card "Create"
  // deep-link (ResumeCard, JobActionsMenu, PeopleCard, CompanyCard,
  // EntityMedia). Parsed once on mount; carried as a pending attachment
  // that ships with the FIRST saveDraft call so the freshly-created
  // project is bound to the source entity. v1 already did this in
  // StudioLayout; this closes the v2-side gap so "Create video from
  // Resume / Job / Company / Profile" actually lands a linked project.
  const urlSubject = useMemo<StudioSubject | null>(
    () => parseStudioSubject(searchParams.get("subject")),
    // We deliberately read this ONCE — subsequent searchParam changes
    // (e.g. internal navigations) shouldn't re-arm the attach.
    [],
  );
  // `?capture=screen|webcam|screen+webcam` arrives from the chrome
  // extension side panels + any "Record promo" CTA. Read once on mount
  // so the ActionsPanel auto-opens the matching recorder sheet and the
  // left rail starts on the Actions tab. v1 wired this; v2 was the gap
  // (#651). The URL carries a RecordingMode; RECORDING_MODE_ACTION maps
  // it to the ActionsPanel ActionId (the single mode ↔ action mapping).
  const urlCapture = useMemo<RecordingActionId | null>(() => {
    const raw = searchParams.get("capture");
    return isRecordingMode(raw) ? RECORDING_MODE_ACTION[raw] : null;
  }, []);

  // Kind-aware editor defaults — landing tab + advanced-timeline open +
  // ActionsPanel auto-arm. Resolved via the shared `deriveKindDefaults`
  // helper in `kind-defaults.ts` (single SoT, DRY).
  //
  // We resolve TWICE because the useState initialisers below need a
  // synchronous mount-time value (can't await server-load), but the
  // ActionsPanel auto-arm needs the LIVE kind (otherwise an existing
  // podcast project opened via direct `/studio/:id` URL falls back to
  // video defaults at mount and never re-arms when the post-load
  // effect flips `leftTab` to "actions"):
  //
  //   - mountTimeTemplateKind: kind from URL `?contentTemplate=` if
  //     present, else `'video'`. Used for the useState initialisers
  //     so freshly-from-template flow lands on the right tab from
  //     first paint when the chooser forwards the template id.
  //   - currentMediaKind: the persisted project's kind once server-load
  //     completes, else the mount-time kind. ActionsPanel reads its
  //     `defaultOpenAction` from this so it auto-arms the correct
  //     sub-sheet for existing podcast / voice projects.
  const mountTimeTemplateKind = useMemo<MediaKind>(() => {
    if (!templateHint) return "video";
    // `templateHint` may be either the raw `ContentTemplate` id
    // (`podcast_episode`) or the URL-friendly kebab slug
    // (`podcast-episode`) depending on the caller. Normalise via
    // `slugToBuiltinId` (single SoT in `lib/templates/registry`)
    // so the editor accepts both forms identically.
    const resolvedId = slugToBuiltinId(templateHint) ?? templateHint;
    const tpl = TEMPLATE_CATALOG.find((t) => t.id === resolvedId);
    return tpl?.mediaKind ?? "video";
  }, []);
  const mountTimeDefaults = useMemo(
    () => deriveKindDefaults(mountTimeTemplateKind, urlCapture),
    // Mount-time only — `urlCapture` + templateHint are read once.
    [],
  );

  return {
    templateHint,
    studioTemplateSlug,
    urlSubject,
    urlCapture,
    mountTimeTemplateKind,
    mountTimeDefaults,
  };
}

export interface KindDefaultsOnLoadInput {
  persistedProject: StudioProject | null;
  mountTimeTemplateKind: MediaKind;
  urlCapture: RecordingActionId | null;
  setWidgetsMode: (mode: WidgetsMode) => void;
  showLeftWidgets: (mode: WidgetsMode) => void;
  raiseDepth: () => void;
}

export function useKindDefaultsOnLoad({
  persistedProject,
  mountTimeTemplateKind,
  urlCapture,
  setWidgetsMode,
  showLeftWidgets,
  raiseDepth,
}: KindDefaultsOnLoadInput) {
  // Tracks whether the kind-aware post-load defaults have been applied
  // yet — flipped on first server-load to avoid clobbering manual
  // tab/timeline toggles on subsequent project refreshes.
  const kindDefaultsAppliedRef = useRef(false);

  // Apply kind-aware defaults ONCE the server-loaded project arrives —
  // covers the case where the user opens a /studio/:id URL directly
  // (no templateHint at mount) for a podcast / voice project. The
  // mount-time defaults already handled the freshly-from-template case
  // via templateHint, so this effect only fires when the server's
  // `mediaKind` disagrees with the mount-time assumption. Guarded by a
  // ref so subsequent reloads / autosave round-trips don't clobber the
  // user's manual tab + timeline toggles.
  useEffect(() => {
    if (kindDefaultsAppliedRef.current) return;
    if (!persistedProject) return;
    kindDefaultsAppliedRef.current = true;
    const serverKind: MediaKind = persistedProject.mediaKind ?? "video";
    if (serverKind === mountTimeTemplateKind) return; // already applied
    const defaults = deriveKindDefaults(serverKind, urlCapture);
    setWidgetsMode(defaults.leftTab);
    if (defaults.defaultAction) showLeftWidgets("actions");
    if (defaults.advancedTimelineOpen || defaults.defaultAction) raiseDepth();
    // urlCapture is read-once on mount; mountTimeTemplateKind is also
    // mount-time only; both are stable for the effect's lifetime.
  }, [persistedProject]);
}
