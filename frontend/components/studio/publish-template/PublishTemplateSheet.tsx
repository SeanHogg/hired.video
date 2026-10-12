/**
 * PublishTemplateSheet — the ONE publish-as-template surface, a right
 * slide-out sheet (✕ to close). Publishes a studio project, or — with an
 * injected `publish` — any other source, e.g. the career kit's résumé design
 * (KitSaveDesignTemplate).
 *
 * Thin container: state, rules and submit live in usePublishTemplateForm;
 * the field sections in PublishTemplateFields.
 */
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Sparkles, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { MediaKind } from "@shared/media-kinds";
import { CREATOR_SHARE_PCT, usePublishTemplateForm, type PublishTemplateFormArgs } from "./usePublishTemplateForm";
import {
  ConsentField,
  CreatorPitch,
  KindNote,
  NameDescriptionFields,
  PriceVisibilityFields,
  ThumbnailField,
} from "./PublishTemplateFields";

interface Props extends PublishTemplateFormArgs {
  /** The source's output axis — the template is the same kind (#913). */
  mediaKind?: MediaKind;
}

export default function PublishTemplateSheet({ mediaKind = "video", ...args }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const form = usePublishTemplateForm(args);
  const { fields, existing, submitting, isTemplateCreator, enableTemplatesHref } = form;
  const close = () => args.onOpenChange(false);

  const submitLabel = existing
    ? t("publishTemplate.updateListing")
    : fields.visibility === "public"
      ? t("publishTemplate.publishToMarketplace")
      : t("publishTemplate.saveDraft");

  return (
    <Sheet open={args.open} onOpenChange={args.onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-lg">
        <SheetHeader className="pr-6 text-left">
          <SheetTitle className="flex items-center gap-2">
            <Store className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            {t("publishTemplate.title")}
          </SheetTitle>
          <SheetDescription>{t("publishTemplate.description", { pct: CREATOR_SHARE_PCT })}</SheetDescription>
        </SheetHeader>

        {form.loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground" role="status">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            {t("publishTemplate.checkingCreator")}
          </div>
        ) : (
          <form onSubmit={form.submit} className="flex flex-col gap-4">
            <KindNote mediaKind={mediaKind} />
            <NameDescriptionFields fields={fields} />
            <ThumbnailField
              fields={fields}
              canCapture={form.canCapture}
              capturing={form.capturingFrame}
              onCapture={() => void form.captureFrame()}
            />
            <PriceVisibilityFields fields={fields} isTemplateCreator={isTemplateCreator} />
            {!isTemplateCreator && (
              <CreatorPitch
                onEnableTemplates={() => {
                  close();
                  navigate(enableTemplatesHref);
                }}
              />
            )}
            {fields.visibility === "public" && <ConsentField fields={fields} />}

            <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={close} disabled={submitting}>
                {t("actions.cancel")}
              </Button>
              <Button type="submit" disabled={submitting || !fields.name.trim()}>
                {submitting ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />
                )}
                {submitting
                  ? existing
                    ? t("publishTemplate.updating")
                    : t("publishTemplate.publishing")
                  : submitLabel}
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
