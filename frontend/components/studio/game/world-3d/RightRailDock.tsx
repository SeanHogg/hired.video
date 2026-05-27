/**
 * RightRailDock — the edit-mode side panel container shared by every
 * authoring affordance in the 3D world studio:
 *   - Inspector (Phase 1.5 — selected-entity form)
 *   - Challenges (Phase 2 — challenge CRUD)
 *   - AI Agent (Phase 5 — prompt-to-game agent loop)
 *
 * Single container, tab-switched. Per the project DRY rule
 * ([[feedback_extract_on_duplication]]), each tab self-gates its
 * visibility — `<InspectorPanel selection={null}>` returns null when
 * nothing is selected; the dock just lists every tab + lets the
 * component decide whether it has anything to show. No prop-drilled
 * `canShowInspector` boolean.
 *
 * The dock is collapsible — persists open/closed via localStorage so
 * the author's preference survives reloads. Self-gates inline: returns
 * null entirely in play mode (no authoring affordances belong there).
 */

import { useEffect, useState } from "react";
import { ChevronRight, Bot, Cuboid, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "studio.gameStage3D.rightRail.open";
const STORAGE_TAB_KEY = "studio.gameStage3D.rightRail.tab";

export type RightRailTab = "inspector" | "challenges" | "agent";

const TABS: { id: RightRailTab; label: string; icon: typeof Bot }[] = [
  { id: "inspector", label: "Inspector", icon: Cuboid },
  { id: "challenges", label: "Challenges", icon: Trophy },
  { id: "agent", label: "AI agent", icon: Bot },
];

interface RightRailDockProps {
  mode: "edit" | "play";
  /** Per-tab content. Each consumer self-gates internally — pass the
   *  actual panel here; the dock doesn't ask whether it should render. */
  inspector: React.ReactNode;
  challenges: React.ReactNode;
  agent: React.ReactNode;
}

export default function RightRailDock({
  mode,
  inspector,
  challenges,
  agent,
}: RightRailDockProps) {
  const [open, setOpen] = useState<boolean>(() => readBool(STORAGE_KEY, true));
  const [tab, setTab] = useState<RightRailTab>(() =>
    (readString(STORAGE_TAB_KEY) as RightRailTab | null) ?? "challenges",
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
    } catch {
      // SSR / private mode — ignore.
    }
  }, [open]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_TAB_KEY, tab);
    } catch {
      // ignore
    }
  }, [tab]);

  // Self-gate: the dock has no role in play mode (no authoring).
  if (mode !== "edit") return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute right-3 top-3 z-20 rounded-full bg-background/95 p-2 shadow-md hover:bg-muted"
        aria-label="Open authoring panel"
        title="Open authoring panel"
      >
        <ChevronRight className="h-4 w-4 rotate-180" />
      </button>
    );
  }

  const content =
    tab === "inspector" ? inspector : tab === "challenges" ? challenges : agent;

  return (
    <div className="absolute right-3 top-3 z-20 flex max-h-[calc(100%-1.5rem)] w-80 flex-col overflow-hidden rounded-md border border-border bg-background/95 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-2 py-1">
        <div className="flex items-center gap-0.5" role="tablist">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              role="tab"
              aria-selected={tab === id}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
                tab === id
                  ? "bg-fuchsia-600 text-white"
                  : "text-foreground hover:bg-muted-foreground/10",
              )}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded p-1 hover:bg-muted-foreground/10"
          aria-label="Collapse authoring panel"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3" role="tabpanel">
        {content}
      </div>
    </div>
  );
}

// ─── localStorage helpers (intentionally tiny — no dep) ───────────────

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return v == null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

function readString(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
