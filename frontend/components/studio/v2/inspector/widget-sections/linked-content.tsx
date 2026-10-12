/**
 * CTA card + linked-content Content sections.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n/i18n";
import type {
  CtaWidgetParams,
  LinkedContentWidgetParams,
} from "@/lib/studio/editor-v2/canvas-state";
import {
  LINKED_CONTENT_REGISTRY,
  type LinkedContentKind,
  type LinkedContentSummary,
} from "@/lib/studio/editor-v2/linked-content";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import ContentLinkPicker from "@/components/studio/shared/ContentLinkPicker";
import UrlPickerInput from "@/components/shared/UrlPickerInput";
import { ColorInput, Field, NumberField } from "../fields";
import type { WidgetInspectorSection } from "../types";

/** A downloaded / posted file can't be clicked, so a CTA-link card paints
 *  its link + QR instead (cta-export-fallback.ts). Absent = on; the CTA
 *  card and the linked-content card share this one toggle. */
function ExportFallbackToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <label className="flex items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-foreground">{t("studio.inspector.field.ctaExportFallback")}</span>
        <span className="block text-xs text-muted-foreground">{t("studio.inspector.field.ctaExportFallbackHint")}</span>
      </span>
      <Switch checked={on} onCheckedChange={onChange} aria-label={t("studio.inspector.field.ctaExportFallback")} />
    </label>
  );
}

export const CTA_CONTENT_SECTION: WidgetInspectorSection = {
  id: "cta-content",
  titleKey: "studio.inspector.section.content",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "cta") return null;
    const data = widget.params.data;
    const set = (next: Partial<CtaWidgetParams>) =>
      onUpdateWidgetParams({ kind: "cta", data: { ...data, ...next } });
    return (
      <div className="space-y-3">
        <Field label={i18n.t("studio.effects.param.headline")}>
          <Input value={data.headline} onChange={(e) => set({ headline: e.target.value })} />
        </Field>
        <Field label={i18n.t("studio.effects.param.subheadline")}>
          <Input
            value={data.subheadline ?? ""}
            onChange={(e) => set({ subheadline: e.target.value || undefined })}
          />
        </Field>
        <Field label={i18n.t("studio.effects.param.ctaText")}>
          <Input value={data.ctaText} onChange={(e) => set({ ctaText: e.target.value })} />
        </Field>
        <Field label={i18n.t("studio.inspector.field.buttonUrl")}>
          <UrlPickerInput
            value={data.ctaUrl}
            onChange={(ctaUrl) => set({ ctaUrl })}
            placeholder="https://…"
          >
            <ContentLinkPicker
              onSelect={(ctaUrl) => set({ ctaUrl })}
              label={i18n.t("studio.inspector.ctaLinkPicker")}
            />
          </UrlPickerInput>
        </Field>
        <ExportFallbackToggle on={data.exportFallback !== false} onChange={(on) => set({ exportFallback: on ? undefined : false })} />
        <div className="grid grid-cols-2 gap-2">
          <Field label={i18n.t("studio.inspector.field.cardFontPx")}>
            <NumberField
              value={data.cardFontPx ?? 24}
              min={8}
              max={120}
              onChange={(cardFontPx) => set({ cardFontPx })}
            />
          </Field>
          <Field label={i18n.t("studio.inspector.field.buttonFontPx")}>
            <NumberField
              value={data.ctaFontPx ?? 14}
              min={8}
              max={96}
              onChange={(ctaFontPx) => set({ ctaFontPx })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={i18n.t("studio.inspector.field.cardBg")}>
            <ColorInput value={data.bgColor} onChange={(bgColor) => set({ bgColor })} />
          </Field>
          <Field label={i18n.t("studio.style.text")}>
            <ColorInput value={data.textColor} onChange={(textColor) => set({ textColor })} />
          </Field>
          <Field label={i18n.t("studio.inspector.field.buttonBg")}>
            <ColorInput
              value={data.accentColor}
              onChange={(accentColor) => set({ accentColor })}
            />
          </Field>
          <Field label={i18n.t("studio.effects.param.ctaText")}>
            <ColorInput
              value={data.accentTextColor}
              onChange={(accentTextColor) => set({ accentTextColor })}
            />
          </Field>
        </div>
      </div>
    );
  },
};

// ───────────────────────────────────────────────────────────────────────────
// Linked content — pick + switch the bound entity for a `linked-content`
// widget. The body component self-fetches the preview; this section is
// just an entity picker scoped to the user's owned items per kind.
// ───────────────────────────────────────────────────────────────────────────

export const LINKED_CONTENT_SECTION: WidgetInspectorSection = {
  id: "linked-content",
  titleKey: "studio.inspector.section.linkedContent",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetParams }) => {
    if (widget.params.kind !== "linked-content") return null;
    return (
      <LinkedContentInspector
        data={widget.params.data}
        onChange={(next) =>
          onUpdateWidgetParams({ kind: "linked-content", data: next })
        }
      />
    );
  },
};

function LinkedContentInspector({
  data,
  onChange,
}: {
  data: LinkedContentWidgetParams;
  onChange: (next: LinkedContentWidgetParams) => void;
}) {
  const kind: LinkedContentKind = data.entityKind;
  const { t } = useTranslation();
  const meta = LINKED_CONTENT_REGISTRY[kind];
  const [items, setItems] = useState<LinkedContentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    meta
      .listForUser()
      .then((list) => {
        if (cancelled) return;
        setItems(list);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setItems([]);
        setError(err instanceof Error ? err.message : i18n.t("studio.inspector.linked.loadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [meta]);

  return (
    <div className="space-y-3">
      <Field label={meta.label}>
        {items === null ? (
          <div className="text-xs text-muted-foreground">{t("status.loading")}</div>
        ) : items.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            {error ?? t("studio.inspector.linked.empty", { kind: meta.label.toLowerCase() })}
          </div>
        ) : (
          <select
            value={data.entityId}
            onChange={(e) => onChange({ ...data, entityId: e.target.value })}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">{t("studio.inspector.linked.pick", { kind: meta.label.toLowerCase() })}</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
                {item.subtitle ? ` (${item.subtitle})` : ""}
              </option>
            ))}
          </select>
        )}
      </Field>
      {data.entityId && (
        <div className="text-[11px] text-muted-foreground">
          {t("studio.inspector.linked.ctaOpens")}{" "}
          <a
            href={meta.viewUrl(data.entityId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            {meta.viewUrl(data.entityId)}
          </a>
        </div>
      )}
      {data.entityId && (
        <ExportFallbackToggle
          on={data.exportFallback !== false}
          onChange={(on) => {
            const { exportFallback: _drop, ...rest } = data;
            onChange(on ? rest : { ...rest, exportFallback: false });
          }}
        />
      )}
      {/* CTA pill customisation — the same fields the canvas-2D applier
          and DOM `<CtaPill>` read through `resolveLinkedContentCtaTypography`.
          Each input is uncontrolled-default: blank means "use the
          kind default" so an author who hasn't customised anything
          keeps the legacy look. */}
      <Field label={t("studio.inspector.linked.ctaText", { label: meta.ctaLabel })}>
        <Input
          value={data.ctaText ?? ""}
          placeholder={meta.ctaLabel}
          onChange={(e) => {
            const next = e.target.value;
            // Empty input → drop the override so the kind default
            // takes back over. Saving an empty string would lock the
            // pill into "" and render an invisible label.
            if (next === "") {
              const { ctaText: _drop, ...rest } = data;
              onChange(rest);
            } else {
              onChange({ ...data, ctaText: next });
            }
          }}
          className="h-8 text-xs"
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={i18n.t("studio.effects.param.fontPx")}>
          <Input
            type="number"
            min={8}
            max={120}
            value={data.ctaFontPx ?? ""}
            placeholder={t("studio.inspector.auto")}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                const { ctaFontPx: _drop, ...rest } = data;
                onChange(rest);
              } else {
                const n = Number(raw);
                if (Number.isFinite(n) && n > 0) {
                  onChange({ ...data, ctaFontPx: n });
                }
              }
            }}
            className="h-8 text-xs"
          />
        </Field>
        <Field label={i18n.t("studio.inspector.field.weight")}>
          <select
            value={data.ctaFontWeight ?? "bold"}
            onChange={(e) =>
              onChange({
                ...data,
                ctaFontWeight: e.target.value === "normal" ? "normal" : "bold",
              })
            }
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="bold">{t("studio.inspector.option.bold")}</option>
            <option value="normal">{t("studio.inspector.option.regular")}</option>
          </select>
        </Field>
      </div>
      <Field label={i18n.t("studio.inspector.field.fontFamily")}>
        <Input
          value={data.ctaFontFamily ?? ""}
          placeholder="sans-serif"
          onChange={(e) => {
            const next = e.target.value;
            if (next === "") {
              const { ctaFontFamily: _drop, ...rest } = data;
              onChange(rest);
            } else {
              onChange({ ...data, ctaFontFamily: next });
            }
          }}
          className="h-8 text-xs"
        />
      </Field>
    </div>
  );
}
