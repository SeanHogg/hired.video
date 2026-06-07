/**
 * DocumentTemplatePicker — the in-editor design-template gallery for the
 * document canvas. Surfaces the resume / job design presets (the same
 * descriptors the marketing [TemplateGallery] / [JobTemplateGallery] show) and
 * applies the chosen one's theme + section layout to the live `DocumentState`.
 *
 * Self-gating per the DRY rule: it renders nothing when the active entity kind
 * has no design templates (article / blog today — see
 * `documentTemplatesForEntity`), so the DocumentStage toolbar never hard-codes
 * an `entityKind === "resume" || "job"` check.
 */
import { useState } from "react";
import { LayoutTemplate, Check } from "lucide-react";
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
import {
  documentTemplatesForEntity,
  type DocumentTemplateOption,
} from "@/lib/studio/editor-v2/document-templates";

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
  const [open, setOpen] = useState(false);
  const options = documentTemplatesForEntity(entityKind);

  // No design library for this entity (article / blog) — render nothing.
  if (options.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <LayoutTemplate className="mr-1 h-4 w-4" />
          Templates
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choose a design template</DialogTitle>
          <DialogDescription>
            Applies a layout + theme to your document. Your content stays — only
            the design changes.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {options.map((option) => (
            <TemplateOptionCard
              key={option.id}
              option={option}
              active={option.id === currentTemplateId}
              onUse={() => {
                onApply(option);
                setOpen(false);
              }}
            />
          ))}
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
            <Check className="h-3 w-3" /> Applied
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
            {option.sections.length} sections
          </span>
          <Button size="sm" variant={active ? "secondary" : "default"} onClick={onUse}>
            {active ? "Reapply" : "Use template"}
          </Button>
        </div>
      </div>
    </div>
  );
}
