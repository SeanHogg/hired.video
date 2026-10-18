/**
 * Per-widget-kind contract for the pure (React-free, paint-free) model
 * concerns: default construction, plain-text extraction and the v1
 * `SceneElement` emit. One entry per `WidgetKind` in `registry.ts`; the
 * `Record`-style mapped type makes a new kind without an entry a compile
 * error, so no consumer hand-rolls a switch over widget kinds.
 *
 * Painting / clip emit / parse live in the widget plugins
 * (`lib/studio/widgets/plugins/*`, #2312) — kept separate so this
 * registry never drags canvas painters into the pure model modules.
 */
import type { ElementBox, ElementStyle, SceneElement } from "@/types/video-script";
import type { Widget, WidgetKind, WidgetParams, WidgetPosition } from "../canvas-model/widget-types";

/** The `WidgetParams` member whose `kind` covers `K`. */
export type WidgetParamsFor<K extends WidgetKind> = WidgetParams extends infer U
  ? U extends { kind: infer UK }
    ? K extends UK
      ? U
      : never
    : never
  : never;

/** The `data` payload a widget of kind `K` carries. */
export type WidgetDataFor<K extends WidgetKind> = WidgetParamsFor<K>["data"];

/** Widget-level values the v1 emit shares across every kind. */
export interface ScriptElementContext {
  widget: Widget;
  box: ElementBox;
  style: ElementStyle | undefined;
  z: number;
  rotation: number;
}

export interface WidgetKindEntry<K extends WidgetKind> {
  /** A fresh widget of this kind with its default geometry + params.
   *  `id` + `base` (the shared default pose) come from `defaultWidget`. */
  create(id: string, base: WidgetPosition): Widget;
  /** Authored human-readable text (`canvasStateToText`); "" when none. */
  toText(data: WidgetDataFor<K>): string;
  /** v1 `SceneElement` (`canvasStateToScript`); null when v1 has no
   *  equivalent and the widget is dropped from the v1 emit. */
  toScriptElement(data: WidgetDataFor<K>, ctx: ScriptElementContext): SceneElement | null;
}

export type WidgetKindRegistry = { [K in WidgetKind]: WidgetKindEntry<K> };
