/**
 * Studio editor preference — A/B opt-in between the classic Studio shell
 * and the v2 canvas/widget editor.
 *
 * Single source of truth: every consumer (StudioLayout dispatch, the toggle
 * UI, route guards on /studio/:id) reads from `useEditorPreference()`. No
 * caller stores its own flag, no consumer prop-drills a `useV2` boolean.
 *
 * Storage: localStorage only. No schema change, no API call. Tradeoff is
 * the preference doesn't sync across devices and we can't measure
 * conversion server-side yet — acceptable for a beta opt-in.
 */
import { useCallback, useEffect, useState } from "react";

export type StudioEditorVersion = "classic" | "v2";

const STORAGE_KEY = "studio.editorVersion";
const DEFAULT_VERSION: StudioEditorVersion = "classic";
const EVENT_NAME = "studio:editor-version-changed";

function readVersion(): StudioEditorVersion {
  if (typeof window === "undefined") return DEFAULT_VERSION;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "v2" ? "v2" : DEFAULT_VERSION;
  } catch {
    return DEFAULT_VERSION;
  }
}

function writeVersion(version: StudioEditorVersion): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, version);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: version }));
  } catch {
    // localStorage unavailable (private mode quota / disabled) — silently
    // fall through; the user simply stays on the in-memory default.
  }
}

/**
 * Read + subscribe to the current editor preference. The setter writes
 * through to localStorage and broadcasts so every mounted consumer
 * updates without a page reload.
 */
export function useEditorPreference(): {
  version: StudioEditorVersion;
  setVersion: (next: StudioEditorVersion) => void;
  isV2: boolean;
} {
  const [version, setVersionState] = useState<StudioEditorVersion>(readVersion);

  useEffect(() => {
    function onChange(event: Event) {
      const detail = (event as CustomEvent<StudioEditorVersion>).detail;
      if (detail === "classic" || detail === "v2") setVersionState(detail);
    }
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      setVersionState(readVersion());
    }
    window.addEventListener(EVENT_NAME, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setVersion = useCallback((next: StudioEditorVersion) => {
    writeVersion(next);
    setVersionState(next);
  }, []);

  return { version, setVersion, isV2: version === "v2" };
}

/** Imperative read for non-React callers (route guards, navigation). */
export function getEditorVersion(): StudioEditorVersion {
  return readVersion();
}
