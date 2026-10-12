/**
 * useFocusLeftPanel — state for the editor's single tabbed left panel
 * (AI · Scenes · Widgets · Media). The active tab persists per browser; the
 * Widgets tab's inner Widgets|Actions mode is seeded from the kind defaults
 * (`deriveKindDefaults().leftTab`) so capture / audio kinds still land on
 * the recorder.
 */
import type { ComponentType, ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

export type FocusLeftTabId = "ai" | "scenes" | "widgets" | "media";
export type WidgetsMode = "widgets" | "actions";

/** One of a studio format's left-panel tabs: kind-aware label + icon + body
 *  (the same id means Scenes / Levels / Frames depending on the kind). The
 *  workspace rail places it in a registry slot (studio-tool-slots.ts). */
export interface FocusLeftTab {
  id: FocusLeftTabId;
  /** Accessible name + tooltip (already translated). */
  label: string;
  icon: ComponentType<{ className?: string }>;
  content: ReactNode;
}

const TAB_STORAGE_KEY = "studio.v2.focus.left.tab";
const TAB_IDS: readonly FocusLeftTabId[] = ["ai", "scenes", "widgets", "media"];

function readStoredTab(): FocusLeftTabId | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TAB_STORAGE_KEY);
    return TAB_IDS.includes(raw as FocusLeftTabId) ? (raw as FocusLeftTabId) : null;
  } catch {
    return null;
  }
}

export function useFocusLeftPanel(initialMode: WidgetsMode) {
  const [widgetsMode, setWidgetsMode] = useState<WidgetsMode>(initialMode);
  const [tab, setTab] = useState<FocusLeftTabId>(() =>
    initialMode === "actions" ? "widgets" : readStoredTab() ?? "scenes",
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, tab);
    } catch {
      // ignore quota / private mode
    }
  }, [tab]);

  /** Reveal the Widgets tab in a given mode (e.g. arm the recorder). */
  const showWidgets = useCallback((mode: WidgetsMode) => {
    setWidgetsMode(mode);
    setTab("widgets");
  }, []);

  return { tab, setTab, widgetsMode, setWidgetsMode, showWidgets };
}

export type FocusLeftPanelState = ReturnType<typeof useFocusLeftPanel>;
