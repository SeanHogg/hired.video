/**
 * Brand-kit Content section — pick a kit (snapshots logoUrl) and set
 * logo opacity. Position lives on the widget.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BrandKitWidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import { studioService, type StudioBrandKit } from "@/lib/services/studio-service";
import { Field, NumberField, SelectField } from "../fields";
import type { WidgetInspectorSection } from "../types";

export const BRAND_CONTENT_SECTION: WidgetInspectorSection = {
  id: "content",
  titleKey: "studio.layout.brandKitsTitle",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "brand-kit") return null;
    const data = widget.params.data;
    const set = (next: Partial<BrandKitWidgetParams>) =>
      onUpdateWidgetParams({ kind: "brand-kit", data: { ...data, ...next } });
    return <BrandKitFields data={data} set={set} />;
  },
};

function BrandKitFields({
  data,
  set,
}: {
  data: BrandKitWidgetParams;
  set: (next: Partial<BrandKitWidgetParams>) => void;
}) {
  const { t } = useTranslation();
  const [kits, setKits] = useState<StudioBrandKit[]>([]);

  useEffect(() => {
    let cancelled = false;
    studioService
      .listBrandKits()
      .then((res) => {
        if (!cancelled && res.success) setKits(res.data);
      })
      .catch(() => {
        if (!cancelled) setKits([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-3">
      <Field label={t("headings.pitchDeck.pickBrandKit")}>
        <SelectField<string>
          value={data.brandKitId}
          options={[
            { value: "", label: t("headings.pitchDeck.pickBrandKit") },
            ...kits.map((kit) => ({ value: kit.id, label: kit.name })),
          ]}
          onChange={(brandKitId) => {
            const kit = kits.find((k) => k.id === brandKitId);
            set({ brandKitId, logoUrl: kit?.logoUrl ?? "" });
          }}
        />
      </Field>
      <Field label={t("studio.effects.param.opacity")}>
        <NumberField
          value={data.opacity}
          min={0}
          max={1}
          step={0.05}
          onChange={(opacity) => set({ opacity })}
        />
      </Field>
    </div>
  );
}
