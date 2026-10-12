/**
 * ResumeTemplateSwitcher — the shared "change resume template" control: a
 * SplitButton whose dropdown lists the user's available design templates,
 * marks the one applied / set-as-default / embedded, and (owner-only) lets the
 * user assign the current template as the default or embedded view.
 *
 * Extracted from `ResumeDetail`'s inline dropdown so the resume-viewer page AND
 * the studio document preview drive the SAME control instead of each
 * re-implementing the template list + unlock filter + set-default items (DRY).
 * The component is presentational: it owns the menu shape + unlock filtering;
 * each host supplies the apply/assign handlers + the persisted assignment ids,
 * because persistence differs per surface (the viewer writes
 * `content.meta.{template,embeddedTemplate}`; the studio re-skins the live
 * `DocumentState` and snapshots it on save).
 *
 * Optional menu items (set-embedded, design editor, marketplace) self-hide when
 * their handler prop is omitted, so a lighter host (the studio preview) renders
 * just the switch + set-default core without branching at the call site.
 */
import { useTranslation } from "react-i18next";
import { Eye, FileType, Monitor, Paintbrush, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { SplitButton } from "@/components/ui/split-button";
import { isTemplateUnlocked } from "@/lib/template-unlocks";
import {
  DEFAULT_DESCRIPTOR,
  TEMPLATE_PRESETS,
  type ResumeTemplateDescriptor,
} from "@/types/resume-template";

export interface ResumeTemplateSwitcherProps {
  /** Id of the template currently shown (descriptor / `DocumentState.templateId`). */
  currentTemplateId: string;
  /** Label on the primary button — defaults to the current template's name. */
  label?: string;
  /** Apply (and, on the viewer, preview) the chosen template. */
  onSelect: (preset: ResumeTemplateDescriptor) => void;
  /** Id persisted as the resume's default view (`content.meta.template`). */
  assignedDefaultId?: string | null;
  /** Set the CURRENT template as the default view. Omit to hide (non-owner). */
  onSetDefault?: () => void;
  /** Id persisted as the embedded view (`content.meta.embeddedTemplate`). */
  assignedEmbeddedId?: string | null;
  /** Set the CURRENT template as the embedded view. Omit to hide. */
  onSetEmbedded?: () => void;
  /** Open the resume's design in the Studio (full-canvas template editing:
   *  layout, theme, font, colour, page size/orientation — and save variations
   *  / publish to the marketplace there). Omit to hide (non-owner). */
  /** Opens the résumé's Design tab in the kit workspace. */
  onEditDesign?: () => void;
  /** Open the template marketplace. Omit to hide. */
  onBrowseMarketplace?: () => void;
  /** Variant for the SplitButton (defaults to outline). */
  variant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
}

export default function ResumeTemplateSwitcher({
  currentTemplateId,
  label,
  onSelect,
  assignedDefaultId,
  onSetDefault,
  assignedEmbeddedId,
  onSetEmbedded,
  onEditDesign,
  onBrowseMarketplace,
  variant,
  className,
}: ResumeTemplateSwitcherProps) {
  const { t } = useTranslation();
  const currentName =
    label ?? TEMPLATE_PRESETS.find((p) => p.id === currentTemplateId)?.name ?? currentTemplateId;
  // "custom" is the ad-hoc descriptor — it has no marketplace identity, so it
  // can't be assigned as a default/embedded view.
  const isCustom = currentTemplateId === "custom";

  return (
    <SplitButton
      label={currentName}
      icon={FileType}
      variant={variant}
      primaryTitle={t("actions.resumeDetail.changeTemplate")}
      chevronLabel={t("actions.resumeDetail.templateOptions")}
      menuClassName="w-72"
      className={className}
    >
      <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
        {t("labels.resumeDetail.yourTemplates")}
      </DropdownMenuLabel>
      {TEMPLATE_PRESETS
        // Show only the free default + templates this user has unlocked.
        // Previewing other templates lives in the marketplace; this dropdown is
        // for applying templates the user can actually use.
        .filter((preset) => preset.id === DEFAULT_DESCRIPTOR.id || isTemplateUnlocked(preset.id))
        .map((preset) => {
          const isCurrent = currentTemplateId === preset.id;
          const isAssignedDefault = assignedDefaultId === preset.id;
          const isAssignedEmbedded = assignedEmbeddedId === preset.id;
          return (
            <DropdownMenuItem
              key={preset.id}
              onClick={() => onSelect(preset)}
              className={isCurrent ? "bg-accent" : ""}
            >
              <div className="flex flex-col flex-1 min-w-0 gap-0.5">
                <span className="font-medium truncate">{preset.name}</span>
                <span className="text-xs text-muted-foreground truncate">{preset.industry}</span>
                {(isAssignedDefault || isAssignedEmbedded) && (
                  <span className="flex items-center gap-1 mt-0.5">
                    {isAssignedDefault && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        <Eye className="w-3 h-3" />
                        {t("labels.resumeDetail.defaultView")}
                      </span>
                    )}
                    {isAssignedEmbedded && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        <Monitor className="w-3 h-3" />
                        {t("labels.resumeDetail.embedded")}
                      </span>
                    )}
                  </span>
                )}
              </div>
            </DropdownMenuItem>
          );
        })}

      {(onSetDefault || onSetEmbedded) && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            {t("labels.resumeDetail.assignTemplate", { name: currentName })}
          </DropdownMenuLabel>
          {onSetDefault && (
            <DropdownMenuItem
              onClick={onSetDefault}
              disabled={assignedDefaultId === currentTemplateId || isCustom}
            >
              <Eye className="w-4 h-4 mr-2" />
              {t("actions.resumeDetail.setAsDefaultView")}
            </DropdownMenuItem>
          )}
          {onSetEmbedded && (
            <DropdownMenuItem
              onClick={onSetEmbedded}
              disabled={assignedEmbeddedId === currentTemplateId || isCustom}
            >
              <Monitor className="w-4 h-4 mr-2" />
              {t("actions.resumeDetail.setAsEmbeddedView")}
            </DropdownMenuItem>
          )}
        </>
      )}

      {onEditDesign && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onEditDesign}>
            <Paintbrush className="w-4 h-4 mr-2" />
            {t("actions.resumeDetail.editDesign")}
          </DropdownMenuItem>
        </>
      )}

      {onBrowseMarketplace && (
        <div className="p-1 pt-2">
          <Button size="sm" className="w-full" onClick={onBrowseMarketplace}>
            <Store className="w-4 h-4 mr-1" />
            {t("actions.resumeDetail.browseMarketplace")}
          </Button>
        </div>
      )}
    </SplitButton>
  );
}
