import { useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { communicationService } from "@/lib/services/communication-service";
import type { CreateEmailTemplateRequest, EmailTemplateDTO } from "@/types/communication";
import { EMPTY_TEMPLATE_FORM, templateToForm } from "@/components/outreach/outreach-helpers";

/** Email template create/edit sheet state + CRUD handlers. */
export function useTemplateEditor({
  setEmailTemplates,
  setError,
}: {
  setEmailTemplates: Dispatch<SetStateAction<EmailTemplateDTO[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplateDTO | null>(null);
  const [templateForm, setTemplateForm] = useState<CreateEmailTemplateRequest>(EMPTY_TEMPLATE_FORM);

  const resetTemplateForm = () => {
    setTemplateForm(EMPTY_TEMPLATE_FORM);
  };

  const handleCreateTemplate = async () => {
    try {
      const newTemplate =
        await communicationService.createEmailTemplate(templateForm);
      setEmailTemplates((prev) => [...prev, newTemplate]);
      setOpen(false);
      resetTemplateForm();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("errors.failedCreateTemplate"),
      );
    }
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate) return;

    try {
      const updatedTemplate = await communicationService.updateEmailTemplate({
        ...templateForm,
        id: editingTemplate.id,
      });
      setEmailTemplates((prev) =>
        prev.map((tmpl) => (tmpl.id === updatedTemplate.id ? updatedTemplate : tmpl)),
      );
      setOpen(false);
      resetTemplateForm();
      setEditingTemplate(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("errors.failedUpdateTemplate"),
      );
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      await communicationService.deleteEmailTemplate(templateId);
      setEmailTemplates((prev) => prev.filter((tmpl) => tmpl.id !== templateId));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("errors.failedDeleteTemplate"),
      );
    }
  };

  const startEdit = (template: EmailTemplateDTO) => {
    setEditingTemplate(template);
    setTemplateForm(templateToForm(template));
    setOpen(true);
  };

  const cancel = () => {
    setOpen(false);
    setEditingTemplate(null);
    resetTemplateForm();
  };

  return {
    open,
    setOpen,
    editingTemplate,
    templateForm,
    setTemplateForm,
    handleCreateTemplate,
    handleUpdateTemplate,
    handleDeleteTemplate,
    startEdit,
    cancel,
  };
}

export type TemplateEditorState = ReturnType<typeof useTemplateEditor>;
