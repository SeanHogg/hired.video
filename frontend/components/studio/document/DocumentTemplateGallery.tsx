/**
 * DocumentTemplateGallery — the design-template gallery for a document entity
 * kind: the user's own templates, purchased ones, and the built-in design
 * library (`useDocumentTemplates`), as one card grid with one pick path.
 *
 * Two hosts share it (no second gallery — DRY):
 *   • the in-editor `DocumentTemplatePicker` dialog ("Use template" applies a
 *     design to the open document);
 *   • the studio create step (#2221), where a card SELECTS the design a new
 *     document starts from (`labels` swaps the button + badge copy).
 *
 * Self-gating: renders nothing when the kind has no templates in any group.
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LayoutTemplate, Check, Sparkles, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { THEMES } from "@/lib/resume-template-themes";
import type { DocumentEntityKind } from "@/lib/studio/editor-v2/document-state";
import type { DocumentTemplateOption } from "@/lib/studio/editor-v2/document-templates";
import {
  useDocumentTemplates,
  type DocumentTemplateGroups,
} from "@/lib/studio/editor-v2/use-document-templates";

/** Card copy — defaults to the editor's apply wording. */
export interface DocumentTemplateGalleryLabels {
  /** Button on an inactive card. */
  use: string;
  /** Button on the active card. */
  active: string;
  /** Badge on the active card. */
  badge: string;
}

interface DocumentTemplateGalleryProps {
  entityKind: DocumentEntityKind;
  /** The id of the active template (applied in the editor / selected in the
   *  create step) — marks its card. */
  currentTemplateId?: string;
  onPick: (option: DocumentTemplateOption) => void;
  labels?: DocumentTemplateGalleryLabels;
  /** Grid columns override (the create step's narrower dialog). */
  gridClassName?: string;
}

/** True when a kind's template groups hold at least one template. */
export function hasDocumentTemplates(groups: Pick<DocumentTemplateGroups, "presets" | "owned" | "purchased">): boolean {
  return groups.presets.length + groups.owned.length + groups.purchased.length > 0;
}

/** The gallery, loading its own groups. */
export default function DocumentTemplateGallery(props: DocumentTemplateGalleryProps) {
  const groups = useDocumentTemplates(props.entityKind);
  return <DocumentTemplateGalleryView {...props} groups={groups} />;
}

/** The gallery over groups the host already loaded (the picker loads them to
 *  decide whether to show its trigger — one fetch, not two). */
export function DocumentTemplateGalleryView({
  groups,
  currentTemplateId,
  onPick,
  labels,
  gridClassName,
}: DocumentTemplateGalleryProps & { groups: DocumentTemplateGroups }) {
  const { t } = useTranslation();
  const { presets, owned, purchased } = groups;
  if (!hasDocumentTemplates(groups)) return null;
  const copy: DocumentTemplateGalleryLabels = labels ?? {
    use: t("studio.document.useTemplate"),
    active: t("studio.document.reapply"),
    badge: t("studio.document.applied"),
  };

  const renderGroup = (label: string, icon: ReactNode, options: DocumentTemplateOption[]) => {
    if (options.length === 0) return null;
    return (
      <div className="space-y-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {icon}
          {label}
        </h4>
        <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3", gridClassName)}>
          {options.map((option) => (
            <TemplateOptionCard
              key={`${option.source ?? "builtin"}:${option.id}`}
              option={option}
              active={option.id === currentTemplateId}
              copy={copy}
              onUse={() => onPick(option)}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {renderGroup(t("studio.document.yourTemplates"), <Sparkles className="h-3.5 w-3.5" />, owned)}
      {renderGroup(t("studio.document.purchasedTemplates"), <ShoppingBag className="h-3.5 w-3.5" />, purchased)}
      {renderGroup(t("studio.document.designLibrary"), <LayoutTemplate className="h-3.5 w-3.5" />, presets)}
    </div>
  );
}

function TemplateOptionCard({
  option,
  active,
  copy,
  onUse,
}: {
  option: DocumentTemplateOption;
  active: boolean;
  copy: DocumentTemplateGalleryLabels;
  onUse: () => void;
}) {
  const { t } = useTranslation();
  const theme = THEMES[option.theme.themeKey];
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-card transition",
        active ? "border-brand-primary ring-2 ring-brand-primary/40" : "border-border hover:border-brand-primary/50",
      )}
    >
      {/* Theme swatch — a stand-in cover that conveys the palette + density.
          The full-fidelity preview is the generalized renderer (#1912). */}
      <div className={cn("relative h-28 w-full p-4", theme?.heroGradient)}>
        <div className="space-y-1.5">
          <div className="h-2.5 w-1/2 rounded bg-white/80" />
          <div className="h-1.5 w-1/3 rounded bg-white/50" />
        </div>
        <div className="absolute bottom-3 left-4 right-4 space-y-1">
          <div className="h-1 w-full rounded bg-white/40" />
          <div className="h-1 w-4/5 rounded bg-white/30" />
        </div>
        {active && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-brand-primary">
            <Check className="h-3 w-3" /> {copy.badge}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold leading-tight">{option.name}</h3>
          {option.industry && (
            <p className="mt-0.5 text-xs text-muted-foreground">{option.industry}</p>
          )}
        </div>
        {option.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{option.description}</p>
        )}
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="text-[11px] text-muted-foreground">
            {t("studio.document.sectionCount", { count: option.sections.length })}
          </span>
          <Button size="sm" variant={active ? "secondary" : "default"} onClick={onUse}>
            {active ? copy.active : copy.use}
          </Button>
        </div>
      </div>
    </div>
  );
}
