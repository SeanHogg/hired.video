/**
 * CanvasForProject — single source of truth for "which editor canvas
 * does this project use?"
 *
 * Per the standing DRY rule, callers MUST NOT branch on `project.kind`
 * inline. They render `<CanvasForProject ... />` and this component
 * picks the right canvas based on the kind discriminator from
 * studio_projects (see migration 0067 + shared/timeline.ts). New
 * editor surfaces (e.g. a future podcast canvas) plug in here — one
 * branch in one file — and every consumer automatically picks them up.
 *
 * Today the dispatcher knows two kinds:
 *   - 'scene' → existing scene-row template editor (StudioEditor)
 *   - 'nle'   → new frame-accurate timeline editor (NleCanvas)
 *
 * The two canvases need different prop shapes (scene uses VideoScript,
 * NLE uses Timeline JSON). Rather than forcing one prop shape on both,
 * this dispatcher takes the WHOLE project context and routes the
 * relevant pieces to whichever canvas wins. That keeps the call site
 * in StudioLayout a single line — `<CanvasForProject ... />` — instead
 * of an if/else with parallel prop trees.
 */

"use client";

import React, { type ComponentProps } from "react";
import StudioEditor from "../../pages/studio/StudioEditor";
import NleCanvas from "./NleCanvas";
import type { Timeline } from "@shared/timeline";

export type CanvasKind = "scene" | "nle";

type SceneEditorProps = ComponentProps<typeof StudioEditor>;
type NleCanvasProps = ComponentProps<typeof NleCanvas>;

interface Props {
  /** The kind discriminator from studio_projects.kind. Defaults to
   *  'scene' so legacy projects without an explicit kind keep working. */
  kind: CanvasKind | undefined;
  /** Props for the scene editor. Required when kind='scene'; ignored
   *  for kind='nle'. */
  sceneProps: SceneEditorProps;
  /** Props for the NLE canvas. Required when kind='nle'; ignored for
   *  kind='scene'. The MediaSource library lives inside NleCanvas for
   *  M1 (session-scoped blob: URLs); when server-upload lands, sources
   *  graduate to a parent slot here so they survive project switches. */
  nleProps: {
    timeline: Timeline | null;
    onTimelineChange: NleCanvasProps["onTimelineChange"];
    title: string;
  };
}

export default function CanvasForProject({ kind, sceneProps, nleProps }: Props) {
  // Default to the legacy scene editor so any pre-migration row that
  // doesn't have `kind` populated still renders correctly. Migration
  // 0067 sets the column default to 'scene', so this branch protects
  // only the brief window before the migration runs.
  const k = kind ?? "scene";

  if (k === "nle") {
    if (!nleProps.timeline) return null;
    return (
      <NleCanvas
        timeline={nleProps.timeline}
        onTimelineChange={nleProps.onTimelineChange}
        title={nleProps.title}
      />
    );
  }

  return <StudioEditor {...sceneProps} />;
}
