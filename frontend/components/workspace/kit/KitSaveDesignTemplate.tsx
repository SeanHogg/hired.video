/**
 * KitSaveDesignTemplate — the Design tool's "Save design as template": opens
 * the studio's ONE publish sheet (PublishTemplateSheet, the same form a
 * studio project publishes with) on the kit's résumé, and on success toasts
 * with a link to the new template's page. It then sits in the user's
 * templates and is worn like any résumé template (`?design=`, useKitTemplate).
 *
 * Self-contained and self-gating: renders nothing unless the visitor may
 * save this design (useKitDesignTemplate). The host only mounts it.
 */
import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import type { StudioTemplate } from "@/lib/services/studio-templates-service";
import type { KitWorkspace } from "@/lib/workspace/use-kit-workspace";
import { useKitDesignTemplate } from "@/lib/workspace/kit/use-kit-design-template";
import { templatePageHref } from "@/lib/templates/apply-targets";

const PublishTemplateSheet = lazy(() => import("@/components/studio/publish-template/PublishTemplateSheet"));

export default function KitSaveDesignTemplate({ kit }: { kit: KitWorkspace }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { picks } = kit;
  const design = useKitDesignTemplate({
    resumeId: kit.handoff.savedResumeId,
    content: kit.intake.content,
    descriptor: picks.descriptor,
    usingSavedDesign: picks.usingSavedDesign,
  });

  if (!design.available) return null;

  const onPublished = (template: StudioTemplate) => {
    const href = templatePageHref(template.listingSlug ?? template.id);
    toast({
      title: t("workspace.designTemplate.savedTitle"),
      description: t("workspace.designTemplate.savedBody", { name: template.name }),
      action: (
        <ToastAction altText={t("workspace.designTemplate.view")} onClick={() => navigate(href)}>
          {t("workspace.designTemplate.view")}
        </ToastAction>
      ),
    });
  };

  return (
    <div className="flex flex-col gap-1.5 border-t border-border pt-4">
      <Button type="button" variant="outline" className="w-full justify-start gap-2" onClick={() => design.setOpen(true)}>
        <LayoutTemplate className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{t("workspace.designTemplate.action")}</span>
      </Button>
      <p className="text-xs text-muted-foreground">{t("workspace.designTemplate.hint")}</p>
      {design.open && (
        <Suspense fallback={null}>
          <PublishTemplateSheet
            open={design.open}
            onOpenChange={design.setOpen}
            projectId={design.resumeId}
            mediaKind="document"
            defaultName={t("workspace.designTemplate.defaultName", { design: picks.descriptor.name })}
            publish={design.publish}
            onPublished={onPublished}
          />
        </Suspense>
      )}
    </div>
  );
}
