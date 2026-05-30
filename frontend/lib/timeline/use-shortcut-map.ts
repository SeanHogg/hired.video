/**
 * useShortcutMap — single source of truth for NLE keyboard shortcuts (#348).
 *
 * The NLETimeline historically shipped fixed keys (S=split, M=merge,
 * D=duplicate, Delete=cut). Power users coming from Premiere / FCP /
 * Resolve expected to remap, and the editor offered no surface to do
 * so. This hook centralises the binding map so:
 *
 *   (a) the timeline reads bindings through one resolver — `bindingFor(action)`;
 *   (b) a settings panel can edit them via `setBinding(action, key)`;
 *   (c) per-user preferences persist in localStorage;
 *   (d) industry-standard profiles ("hired.video", "Premiere", "FCP",
 *       "Resolve") pre-load via `loadProfile(name)`.
 *
 * Bindings are stored as a single key string (e.g. "s", "Delete",
 * "Cmd+Shift+S") so the hook stays serialisable and the settings panel
 * can show / clear / re-record without juggling modifier flags.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

/** Action ids the timeline + studio recognise. Add new actions here as
 *  the keyboard surface grows; the resolver is the only consumer. */
export type NleShortcutAction =
  | "split-at-playhead"
  | "merge-with-next"
  | "duplicate-scene"
  | "delete-scene"
  | "zoom-in"
  | "zoom-out"
  | "toggle-play"
  | "nudge-left"
  | "nudge-right";

export type NleShortcutMap = Partial<Record<NleShortcutAction, string>>;

export interface NleShortcutProfile {
  id: string;
  label: string;
  /** Visible in the panel; shown next to the profile name to set
   *  user expectations ("Match Adobe Premiere Pro defaults"). */
  description: string;
  bindings: Record<NleShortcutAction, string>;
}

/** Built-in profiles. The first entry is the default. Profiles use the
 *  same KeyboardEvent.key serialisation as `normaliseKeyEvent` below so
 *  comparisons stay symmetric. */
export const NLE_SHORTCUT_PROFILES: ReadonlyArray<NleShortcutProfile> = [
  {
    id: "hired",
    label: "hired.video defaults",
    description:
      "What ships out of the box — S split / M merge / D duplicate / Delete cut.",
    bindings: {
      "split-at-playhead": "s",
      "merge-with-next": "m",
      "duplicate-scene": "d",
      "delete-scene": "Delete",
      "zoom-in": "=",
      "zoom-out": "-",
      "toggle-play": " ",
      "nudge-left": "ArrowLeft",
      "nudge-right": "ArrowRight",
    },
  },
  {
    id: "premiere",
    label: "Adobe Premiere Pro",
    description: "Cmd+K cut / Q in-trim / W out-trim — matches Premiere muscle memory.",
    bindings: {
      "split-at-playhead": "Cmd+K",
      "merge-with-next": "Cmd+Shift+M",
      "duplicate-scene": "Cmd+D",
      "delete-scene": "Delete",
      "zoom-in": "=",
      "zoom-out": "-",
      "toggle-play": " ",
      "nudge-left": "ArrowLeft",
      "nudge-right": "ArrowRight",
    },
  },
  {
    id: "fcp",
    label: "Final Cut Pro",
    description: "B blade / Shift+B blade-all / Cmd+J merge — FCP's tool-led shortcuts.",
    bindings: {
      "split-at-playhead": "b",
      "merge-with-next": "Cmd+J",
      "duplicate-scene": "Opt+Cmd+D",
      "delete-scene": "Delete",
      "zoom-in": "Cmd+=",
      "zoom-out": "Cmd+-",
      "toggle-play": " ",
      "nudge-left": ",",
      "nudge-right": ".",
    },
  },
  {
    id: "resolve",
    label: "DaVinci Resolve",
    description: "Cmd+B blade / Cmd+\\ trim-in — Resolve's editing-page bindings.",
    bindings: {
      "split-at-playhead": "Cmd+B",
      "merge-with-next": "Cmd+Shift+J",
      "duplicate-scene": "Cmd+D",
      "delete-scene": "Delete",
      "zoom-in": "Cmd+=",
      "zoom-out": "Cmd+-",
      "toggle-play": " ",
      "nudge-left": "j",
      "nudge-right": "l",
    },
  },
];

const STORAGE_KEY = "hv.nle.shortcuts.v1";

interface PersistedShape {
  profileId: string;
  /** Per-action overrides ON TOP of the chosen profile. Empty when the
   *  user hasn't touched a binding. */
  overrides: NleShortcutMap;
}

function readPersisted(): PersistedShape {
  try {
    if (typeof localStorage === "undefined") return { profileId: "hired", overrides: {} };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { profileId: "hired", overrides: {} };
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;
    return {
      profileId:
        NLE_SHORTCUT_PROFILES.find((p) => p.id === parsed?.profileId)?.id ?? "hired",
      overrides: parsed?.overrides ?? {},
    };
  } catch {
    return { profileId: "hired", overrides: {} };
  }
}

function writePersisted(next: PersistedShape) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota / private-mode failures are fine — the runtime map still
    // works for this session.
  }
}

/**
 * Serialise a KeyboardEvent into the stored "Mod+Mod+Key" shape so
 * comparisons against the binding map are symmetric with what the
 * settings panel writes. Order of modifiers is fixed (Cmd → Ctrl →
 * Alt/Opt → Shift) so two equivalent chords always serialise the same.
 */
export function normaliseKeyEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey) parts.push("Cmd");
  if (e.ctrlKey && !e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Opt");
  if (e.shiftKey) parts.push("Shift");
  // Normalise the key portion: single letters lowercased (so "S" and
  // "s" match), everything else as-is.
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  parts.push(key);
  return parts.join("+");
}

export interface UseShortcutMap {
  /** Effective binding for the action — profile default + user override. */
  bindingFor: (action: NleShortcutAction) => string | undefined;
  /** Test whether a keyboard event matches the given action. */
  matches: (e: KeyboardEvent, action: NleShortcutAction) => boolean;
  /** Override a single binding. Pass null/empty to clear the override. */
  setBinding: (action: NleShortcutAction, key: string | null) => void;
  /** Switch profile. Clears overrides since the new profile defines its
   *  own canonical bindings. */
  loadProfile: (id: string) => void;
  /** Currently active profile id. */
  profileId: string;
  /** Effective map (profile + overrides) for the settings panel. */
  effectiveMap: Record<NleShortcutAction, string | undefined>;
  /** The user-set overrides — handy for "Reset to defaults" UI. */
  overrides: NleShortcutMap;
}

export function useShortcutMap(): UseShortcutMap {
  const [persisted, setPersisted] = useState<PersistedShape>(() => readPersisted());

  useEffect(() => {
    writePersisted(persisted);
  }, [persisted]);

  const profile = useMemo(
    () =>
      NLE_SHORTCUT_PROFILES.find((p) => p.id === persisted.profileId) ??
      NLE_SHORTCUT_PROFILES[0],
    [persisted.profileId],
  );

  const effectiveMap = useMemo(() => {
    const merged: Record<NleShortcutAction, string | undefined> = {
      ...profile.bindings,
    };
    for (const [k, v] of Object.entries(persisted.overrides)) {
      if (v) merged[k as NleShortcutAction] = v;
    }
    return merged;
  }, [profile, persisted.overrides]);

  const bindingFor = useCallback(
    (action: NleShortcutAction) => effectiveMap[action],
    [effectiveMap],
  );

  const matches = useCallback(
    (e: KeyboardEvent, action: NleShortcutAction) => {
      const binding = effectiveMap[action];
      if (!binding) return false;
      return normaliseKeyEvent(e) === binding;
    },
    [effectiveMap],
  );

  const setBinding = useCallback(
    (action: NleShortcutAction, key: string | null) => {
      setPersisted((prev) => {
        const next = { ...prev.overrides };
        if (!key) delete next[action];
        else next[action] = key;
        return { ...prev, overrides: next };
      });
    },
    [],
  );

  const loadProfile = useCallback((id: string) => {
    setPersisted({ profileId: id, overrides: {} });
  }, []);

  return {
    bindingFor,
    matches,
    setBinding,
    loadProfile,
    profileId: profile.id,
    effectiveMap,
    overrides: persisted.overrides,
  };
}
