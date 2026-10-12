/**
 * DocumentTemplatePicker — the in-editor design-template gallery for the
 * document canvas, in a dialog. Surfaces, for the active entity kind:
 *   • the built-in resume / job design presets (the same descriptors the
 *     marketing [TemplateGallery] / [JobTemplateGallery] show), AND
 *   • the user's OWN saved variations / published document templates, AND
 *   • document templates the user purchased or claimed from the marketplace.
 * Applying one stamps its theme + section layout + page geometry onto the live
 * `DocumentState`. The grid itself is `DocumentTemplateGallery` — shared with
 * the studio create step (#2221), so there is one gallery.
 *
 * Self-gating per the DRY rule: it renders nothing when the active entity kind
 * has no templates in ANY group, so the DocumentStage toolbar never hard-codes
 * an `entityKind === "resume" || "job"` check.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { DocumentEntityKind } from "@/lib/studio/editor-v2/document-state";
import type { DocumentTemplateOption } from "@/lib/studio/editor-v2/document-templates";
import { useDocumentTemplates } from "@/lib/studio/editor-v2/use-document-templates";
import { DocumentTemplateGalleryView, hasDocumentTemplates } from "./DocumentTemplateGallery";

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
  const groups = useDocumentTemplates(entityKind);

  // No template in any group for this entity — render nothing.
  if (!hasDocumentTemplates(groups)) return null;

  const apply = (option: DocumentTemplateOption) => {
    onApply(option);
    setOpen(false);
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
        <DocumentTemplateGalleryView
          entityKind={entityKind}
          groups={groups}
          currentTemplateId={currentTemplateId}
          onPick={apply}
        />
      </DialogContent>
    </Dialog>
  );
}
