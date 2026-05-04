/**
 * NleActionsPanel — what fills the Actions tab for kind='nle' projects.
 *
 * Per the standing DRY rule, this panel SELF-GATES on `kind` and on
 * timeline presence — the parent (StudioEditor) renders it
 * unconditionally inside the Actions tab content; this component
 * returns null when not applicable. No prop-drilled `isNle` boolean.
 *
 * It composes the existing pieces (EffectsPanel for per-clip effects,
 * ExportProfilePicker for the export profile) into the tab. Nothing
 * here is NLE-specific that doesn't already live in those components.
 */

"use client";

import React from "react";
import { Sparkles, FileVideo } from "lucide-react";
import EffectsPanel from "./EffectsPanel";
import ExportProfilePicker from "./ExportProfilePicker";
import type { Timeline } from "@shared/timeline";

interface Props {
  kind: "scene" | "nle";
  timeline: Timeline | null;
  onTimelineChange: (next: Timeline) => void;
  selectedClipId: string | null;
}

export default function NleActionsPanel({
  kind,
  timeline,
  onTimelineChange,
  selectedClipId,
}: Props) {
  if (kind !== "nle" || !timeline) return null;

  return (
    <div className="space-y-6 p-4">
      <section>
        <header className="mb-2 flex items-center gap-2">
          <FileVideo className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Export profile
          </h3>
        </header>
        <ExportProfilePicker
          timeline={timeline}
          onTimelineChange={onTimelineChange}
        />
      </section>

      <section>
        <header className="mb-2 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Effects
          </h3>
          {!selectedClipId && (
            <span className="text-[10px] text-muted-foreground">— select a clip on the timeline to apply effects</span>
          )}
        </header>
        <div className="rounded border bg-card">
          <EffectsPanel
            timeline={timeline}
            selectedClipId={selectedClipId}
            onTimelineChange={onTimelineChange}
          />
        </div>
      </section>
    </div>
  );
}
