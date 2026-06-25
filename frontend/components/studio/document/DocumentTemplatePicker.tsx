/**
 * DocumentTemplatePicker — the in-editor design-template gallery for the
 * document canvas. Surfaces, for the active entity kind:
 *   • the built-in resume / job design presets (the same descriptors the
 *     marketing [TemplateGallery] / [JobTemplateGallery] show), AND
 *   • the user's OWN saved variations / published document templates, AND
 *   • document templates the user purchased or claimed from the marketplace.
 * Applying one stamps its theme + section layout + page geometry onto the live
 * `DocumentState`. All three groups normalize to one `DocumentTemplateOption`
 * so there's one card + one apply path (DRY).
 *
 * Self-gating per the DRY rule: it renders nothing when the active entity kind
 * has no templates in ANY group, so the DocumentStage toolbar never hard-codes
 * an `entityKind === "resume" || "job"` check.
 */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LayoutTemplate, Check, Sparkles, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { THEMES } from "@/lib/resume-template-themes";
import type { DocumentEntityKind } from "@/lib/studio/editor-v2/document-state";
import type { DocumentTemplateOption } from "@/lib/studio/editor-v2/document-templates";
import { useDocumentTemplates } from "@/lib/studio/editor-v2/use-document-templates";

interface DocumentTemplatePickerProps {
  entityKind: DocumentEntityKind;
  /** The id of the template currently applied (`DocumentState.templateId`) —
   *  used to mark the active card. Unambiguous, unlike matching by themeKey
   *  (several templates share a palette). */
  currentTemplateId?: string;
  onApply: (option: DocumentTemplateOption) => void;
}

export default function DocumentTemplatePicker({
  entityKind,
  currentTemplateId,
  onApply,
}: DocumentTemplatePickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { presets, owned, purchased } = useDocumentTemplates(entityKind);

  // No template in any group for this entity — render nothing.
  if (presets.length === 0 && owned.length === 0 && purchased.length === 0) {
    return null;
  }

  const apply = (option: DocumentTemplateOption) => {
    onApply(option);
    setOpen(false);
  };

  const renderGroup = (
    label: string,
    icon: ReactNode,
    options: DocumentTemplateOption[],
  ) => {
    if (options.length === 0) return null;
    return (
      <div className="space-y-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {icon}
          {label}
        </h4>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {options.map((option) => (
            <TemplateOptionCard
              key={`${option.source ?? "builtin"}:${option.id}`}
              option={option}
              active={option.id === currentTemplateId}
              onUse={() => apply(option)}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <LayoutTemplate className="mr-1 h-4 w-4" />
          {t("studio.document.templates")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("studio.document.chooseTemplate")}</DialogTitle>
          <DialogDescription>{t("studio.document.chooseTemplateHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          {renderGroup(
            t("studio.document.yourTemplates"),
            <Sparkles className="h-3.5 w-3.5" />,
            owned,
          )}
          {renderGroup(
            t("studio.document.purchasedTemplates"),
            <ShoppingBag className="h-3.5 w-3.5" />,
            purchased,
          )}
          {renderGroup(
            t("studio.document.designLibrary"),
            <LayoutTemplate className="h-3.5 w-3.5" />,
            presets,
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TemplateOptionCard({
  option,
  active,
  onUse,
}: {
  option: DocumentTemplateOption;
  active: boolean;
  onUse: () => void;
}) {
  const { t } = useTranslation();
  const theme = THEMES[option.theme.themeKey];
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-card transition",
        active ? "border-brand-purple ring-2 ring-brand-purple/40" : "border-border hover:border-brand-purple/50",
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
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-brand-purple">
            <Check className="h-3 w-3" /> {t("studio.document.applied")}
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
            {active ? t("studio.document.reapply") : t("studio.document.useTemplate")}
          </Button>
        </div>
      </div>
    </div>
  );
}
