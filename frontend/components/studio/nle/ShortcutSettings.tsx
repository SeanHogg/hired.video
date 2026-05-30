/**
 * ShortcutSettings — panel for remapping NLE keyboard shortcuts (#348).
 *
 * Sits inside the studio's preferences surface. Lets the user:
 *   - pick an industry-standard profile (Premiere / FCP / Resolve)
 *   - rebind any single action via "click to record"
 *   - reset to the profile defaults
 *
 * All state lives in [useShortcutMap](/lib/timeline/use-shortcut-map.ts)
 * which is the single source of truth — the NLETimeline reads the same
 * bindings, so a change here is reflected the next time the user
 * presses a key.
 */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RotateCcw, Keyboard } from "lucide-react";
import {
  NLE_SHORTCUT_PROFILES,
  normaliseKeyEvent,
  useShortcutMap,
  type NleShortcutAction,
} from "@/lib/timeline/use-shortcut-map";

const ACTION_LABELS: Record<NleShortcutAction, string> = {
  "split-at-playhead": "Split scene at playhead",
  "merge-with-next": "Merge with next scene",
  "duplicate-scene": "Duplicate scene",
  "delete-scene": "Delete scene",
  "zoom-in": "Zoom in",
  "zoom-out": "Zoom out",
  "toggle-play": "Play / pause",
  "nudge-left": "Nudge selection left",
  "nudge-right": "Nudge selection right",
};

const ACTION_IDS = Object.keys(ACTION_LABELS) as NleShortcutAction[];

export default function ShortcutSettings() {
  const map = useShortcutMap();
  const [recording, setRecording] = useState<NleShortcutAction | null>(null);
  const profile = NLE_SHORTCUT_PROFILES.find((p) => p.id === map.profileId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Keyboard className="h-4 w-4" />
          Keyboard shortcuts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">
              Preset profile
            </label>
            <Select value={map.profileId} onValueChange={(id) => map.loadProfile(id)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NLE_SHORTCUT_PROFILES.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {profile && (
              <p className="text-[11px] text-muted-foreground mt-1">
                {profile.description}
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => map.loadProfile(map.profileId)}
            title="Clear all overrides and reload the active profile"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Reset
          </Button>
        </div>

        <div className="border rounded-md divide-y">
          {ACTION_IDS.map((action) => {
            const binding = map.effectiveMap[action];
            const isOverride = action in map.overrides;
            const isRecording = recording === action;
            return (
              <div
                key={action}
                className="flex items-center justify-between px-3 py-2 text-sm"
              >
                <div className="flex-1">
                  <div className="font-medium">{ACTION_LABELS[action]}</div>
                  {isOverride && (
                    <div className="text-[10px] text-muted-foreground">
                      Custom override
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={`min-w-[8rem] h-8 px-3 rounded border font-mono text-xs ${
                    isRecording
                      ? "bg-primary text-primary-foreground border-primary animate-pulse"
                      : "bg-muted hover:bg-accent"
                  }`}
                  onClick={() => setRecording(action)}
                  onKeyDown={(e) => {
                    if (!isRecording) return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.key === "Escape") {
                      setRecording(null);
                      return;
                    }
                    // Modifier-only keypresses are noise — wait for the
                    // user to press the real key.
                    if (["Control", "Shift", "Alt", "Meta", "Command"].includes(e.key)) {
                      return;
                    }
                    map.setBinding(action, normaliseKeyEvent(e.nativeEvent));
                    setRecording(null);
                  }}
                  onBlur={() => setRecording(null)}
                >
                  {isRecording ? "Press a key…" : (binding ?? "Unbound")}
                </button>
                {isOverride && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 ml-1"
                    title="Clear override"
                    onClick={() => map.setBinding(action, null)}
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Bindings persist per browser. Press Escape during recording to cancel.
        </p>
      </CardContent>
    </Card>
  );
}
