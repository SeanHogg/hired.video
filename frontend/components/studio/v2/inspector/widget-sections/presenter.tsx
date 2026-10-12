/**
 * AI presenter (avatar) Content section.
 */
import { lazy, Suspense } from "react";
import i18n from "@/lib/i18n/i18n";
import type { AvatarWidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import { STOCK_PRESENTERS } from "@/lib/studio/avatar/presenters";
import MediaPicker from "@/components/shared/MediaPicker";
import { TTS_ENGINES, type TtsEngineId } from "@/lib/services/tts-engines";
import { AutoSizeTextarea, Field, NumberField, SelectField } from "../fields";
import type { WidgetInspectorSection } from "../types";

const AvatarPreview = lazy(
  () => import("@/components/studio/avatar/AvatarPreview"),
);

export const AVATAR_CONTENT_SECTION: WidgetInspectorSection = {
  id: "content",
  titleKey: "studio.inspector.section.presenter",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "avatar") return null;
    const data = widget.params.data;
    const set = (next: Partial<AvatarWidgetParams>) =>
      onUpdateWidgetParams({ kind: "avatar", data: { ...data, ...next } });
    return (
      <div className="space-y-3">
        <Field label={i18n.t("studio.inspector.section.presenter")}>
          <SelectField<string>
            value={data.presenterId}
            options={STOCK_PRESENTERS.map((p) => ({ value: p.id, label: p.label }))}
            onChange={(presenterId) => set({ presenterId })}
          />
        </Field>
        {/* #1559 — BYO portrait upload. Mounts the shared MediaPicker
            (image only), persists the chosen URL into portraitSourceId
            on the widget params. The painter consumes the field when
            present; otherwise stylized stock presenter is used. */}
        <Field label={i18n.t("studio.inspector.field.portrait")}>
          <div className="space-y-2">
            {data.portraitSourceId ? (
              <div className="flex items-start gap-2">
                <img
                  src={data.portraitSourceId}
                  alt={i18n.t("studio.inspector.portraitAlt")}
                  className="h-16 w-16 rounded object-cover border"
                />
                <button
                  type="button"
                  className="text-xs text-destructive underline"
                  onClick={() => set({ portraitSourceId: undefined, portraitFaceBbox: undefined, portraitMouthRegion: undefined })}
                >
                  {i18n.t("actions.remove")}
                </button>
              </div>
            ) : null}
            <MediaPicker
              accept="image"
              title={i18n.t("studio.inspector.uploadPortrait")}
              triggerLabel={i18n.t(data.portraitSourceId ? "studio.inspector.replacePortrait" : "studio.inspector.uploadPortrait")}
              onPick={(asset) => set({ portraitSourceId: asset.url })}
            />
            <p className="text-xs text-muted-foreground">
              {i18n.t("studio.inspector.portraitNote")}
            </p>
          </div>
        </Field>
        <Field label={i18n.t("studio.inspector.field.avatarScript")}>
          <AutoSizeTextarea
            value={data.script}
            onChange={(script) => set({ script })}
            placeholder={i18n.t("studio.inspector.scriptPlaceholder")}
          />
        </Field>
        <Field label={i18n.t("studio.inspector.field.ttsEngine")}>
          <SelectField<TtsEngineId>
            value={(data.engine ?? "web-speech") as TtsEngineId}
            options={TTS_ENGINES.map((e) => ({ value: e.id, label: e.label }))}
            onChange={(engine) => set({ engine })}
          />
        </Field>
        <Field label={i18n.t("studio.inspector.field.voiceId")}>
          <input
            type="text"
            value={data.voiceId ?? ""}
            placeholder={i18n.t("studio.inspector.voiceIdPlaceholder")}
            onChange={(e) => set({ voiceId: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
          />
        </Field>
        <Field label={i18n.t("studio.effects.param.speed")}>
          <NumberField
            value={data.speed ?? 1}
            min={0.5}
            max={2}
            step={0.05}
            onChange={(speed) => set({ speed })}
          />
        </Field>
        <Suspense fallback={null}>
          <AvatarPreview
            presenterId={data.presenterId}
            script={data.script}
            engine={(data.engine ?? "web-speech") as TtsEngineId}
            voiceId={data.voiceId}
            speed={data.speed ?? 1}
          />
        </Suspense>
      </div>
    );
  },
};
