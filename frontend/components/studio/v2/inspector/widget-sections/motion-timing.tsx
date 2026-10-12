/**
 * Motion (enter/exit) + timing (visible window) sections — part of the
 * shared tail applied to every widget kind.
 */
import i18n from "@/lib/i18n/i18n";
import {
  MOTION_KINDS,
  MOTION_KIND_LABEL_KEYS,
  MOTION_EASINGS,
  MOTION_EASING_LABEL_KEYS,
  defaultMotion,
  type MotionEasing,
  type MotionKind,
  type WidgetMotion,
} from "@/lib/studio/editor-v2/widget-motion";
import { Input } from "@/components/ui/input";
import { Field, NumberField, SelectField } from "../fields";
import type { WidgetInspectorSection } from "../types";

const MOTION_KIND_OPTIONS = MOTION_KINDS.map((k) => ({
  value: k,
  labelKey: MOTION_KIND_LABEL_KEYS[k],
}));
const MOTION_EASING_OPTIONS = MOTION_EASINGS.map((e) => ({
  value: e,
  labelKey: MOTION_EASING_LABEL_KEYS[e],
}));

export const MOTION_SECTION: WidgetInspectorSection = {
  id: "motion",
  titleKey: "studio.picker.motion",
  render: ({ widget, onUpdateWidget, onUpdateWidgetParams }) => {
    const motion = widget.motion ?? defaultMotion();
    function patch(next: Partial<WidgetMotion>) {
      onUpdateWidget({ motion: { ...motion, ...next } });
    }
    function patchPhase(phase: "enter" | "exit", next: Partial<WidgetMotion["enter"]>) {
      patch({ [phase]: { ...motion[phase], ...next } } as Partial<WidgetMotion>);
    }
    return (
      <div className="space-y-4">
        <PhaseEditor
          title={i18n.t("studio.inspector.motion.enter")}
          phase={motion.enter}
          onChangeKind={(kind: MotionKind) => patchPhase("enter", { kind })}
          onChangeDuration={(durationSeconds) => patchPhase("enter", { durationSeconds })}
          onChangeEasing={(easing: MotionEasing) => patchPhase("enter", { easing })}
        />
        <PhaseEditor
          title={i18n.t("studio.inspector.motion.exit")}
          phase={motion.exit}
          onChangeKind={(kind: MotionKind) => patchPhase("exit", { kind })}
          onChangeDuration={(durationSeconds) => patchPhase("exit", { durationSeconds })}
          onChangeEasing={(easing: MotionEasing) => patchPhase("exit", { easing })}
        />
      </div>
    );
  },
};

function PhaseEditor({
  title,
  phase,
  onChangeKind,
  onChangeDuration,
  onChangeEasing,
}: {
  title: string;
  phase: WidgetMotion["enter"];
  onChangeKind: (kind: MotionKind) => void;
  onChangeDuration: (seconds: number) => void;
  onChangeEasing: (easing: MotionEasing) => void;
}) {
  const disabled = phase.kind === "none";
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <Field label={i18n.t("studio.style.animation")}>
        <SelectField<MotionKind>
          value={phase.kind}
          options={MOTION_KIND_OPTIONS}
          onChange={onChangeKind}
        />
      </Field>
      {!disabled && (
        <div className="grid grid-cols-2 gap-2">
          <Field label={i18n.t("studio.inspector.durationSeconds")}>
            <NumberField
              value={Number(phase.durationSeconds.toFixed(2))}
              min={0}
              step={0.05}
              onChange={onChangeDuration}
            />
          </Field>
          <Field label={i18n.t("studio.inspector.field.easing")}>
            <SelectField<MotionEasing>
              value={phase.easing}
              options={MOTION_EASING_OPTIONS}
              onChange={onChangeEasing}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

export const TIMING_SECTION: WidgetInspectorSection = {
  id: "timing",
  titleKey: "studio.inspector.section.timing",
  render: ({ widget, scene, onUpdateWidget }) => {
    const from = widget.visibleFrom;
    const to = widget.visibleTo;
    return (
      <div className="space-y-3">
        <p className="text-[10px] text-muted-foreground">
          {i18n.t("studio.inspector.timingHelp", { seconds: scene.durationSeconds.toFixed(1) })}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Field label={i18n.t("studio.inspector.field.fromSeconds")}>
            <Input
              type="number"
              min={0}
              max={scene.durationSeconds}
              step={0.1}
              value={from ?? ""}
              placeholder="0"
              onChange={(e) => {
                const raw = e.target.value;
                onUpdateWidget({
                  visibleFrom: raw === "" ? null : Math.max(0, Number(raw) || 0),
                });
              }}
            />
          </Field>
          <Field label={i18n.t("studio.inspector.field.toSeconds")}>
            <Input
              type="number"
              min={0}
              max={scene.durationSeconds}
              step={0.1}
              value={to ?? ""}
              placeholder={scene.durationSeconds.toFixed(1)}
              onChange={(e) => {
                const raw = e.target.value;
                onUpdateWidget({
                  visibleTo:
                    raw === ""
                      ? null
                      : Math.min(scene.durationSeconds, Math.max(0, Number(raw) || 0)),
                });
              }}
            />
          </Field>
        </div>
      </div>
    );
  },
};
