import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { EmailTemplateCategory, EmailTemplateTargetRole } from "@/types/communication";
import type { TemplateEditorState } from "@/components/outreach/hooks/useTemplateEditor";

/** Numeric-enum entries as `[name, value]` pairs (drops the reverse mapping). */
function enumOptions(e: object): [string, string | number][] {
  return Object.entries(e).filter(([key]) => isNaN(Number(key)));
}

/** Email Template Sheet (slide-out panel) — create or edit. */
export function EmailTemplateSheet({ state }: { state: TemplateEditorState }) {
  const { t } = useTranslation();
  const { templateForm, setTemplateForm, editingTemplate } = state;
  return (
    <Sheet open={state.open} onOpenChange={state.setOpen}>
      <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {editingTemplate
              ? t("actions.editEmailTemplate")
              : t("actions.createEmailTemplate")}
          </SheetTitle>
          <SheetDescription>
            {t("messages.outreachCampaignReusable")}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="template-name">{t("fields.templateName.label")}</Label>
            <Input
              id="template-name"
              value={templateForm.name}
              onChange={(e) =>
                setTemplateForm({ ...templateForm, name: e.target.value })
              }
              placeholder={t("fields.templateName.placeholder")}
            />
          </div>

          <div>
            <Label htmlFor="template-description">{t("fields.taskDescription.label")}</Label>
            <Input
              id="template-description"
              value={templateForm.description}
              onChange={(e) =>
                setTemplateForm({
                  ...templateForm,
                  description: e.target.value,
                })
              }
              placeholder={t("fields.templateDescription.placeholder")}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="template-category">{t("fields.templateCategory.label")}</Label>
              <Select
                value={templateForm.category.toString()}
                onValueChange={(value) =>
                  setTemplateForm({
                    ...templateForm,
                    category: parseInt(value) as EmailTemplateCategory,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {enumOptions(EmailTemplateCategory).map(([key, value]) => (
                    <SelectItem key={value} value={value.toString()}>
                      {key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="template-target-role">{t("fields.templateTargetRole.label")}</Label>
              <Select
                value={templateForm.targetRole.toString()}
                onValueChange={(value) =>
                  setTemplateForm({
                    ...templateForm,
                    targetRole: parseInt(value) as EmailTemplateTargetRole,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {enumOptions(EmailTemplateTargetRole).map(([key, value]) => (
                    <SelectItem key={value} value={value.toString()}>
                      {key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="template-subject">{t("fields.templateSubject.label")}</Label>
            <Input
              id="template-subject"
              value={templateForm.subject}
              onChange={(e) =>
                setTemplateForm({ ...templateForm, subject: e.target.value })
              }
              placeholder={t("fields.templateSubject.placeholder")}
            />
          </div>

          <div>
            <Label htmlFor="template-body">{t("fields.templateBody.label")}</Label>
            <Textarea
              id="template-body"
              value={templateForm.body}
              onChange={(e) =>
                setTemplateForm({ ...templateForm, body: e.target.value })
              }
              placeholder={t("fields.templateBody.placeholder")}
              rows={8}
            />
          </div>
        </div>

        <SheetFooter className="flex gap-2 pt-4">
          <Button variant="outline" onClick={state.cancel}>
            {t("actions.cancel")}
          </Button>
          <Button
            onClick={
              editingTemplate ? state.handleUpdateTemplate : state.handleCreateTemplate
            }
          >
            {editingTemplate ? t("actions.updateTemplate") : t("actions.createTemplate")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
