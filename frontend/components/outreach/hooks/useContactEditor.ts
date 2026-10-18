import { useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { communicationService } from "@/lib/services/communication-service";
import type { CreateExternalContactRequest, ExternalContactDTO } from "@/types/communication";
import { EMPTY_CONTACT_FORM, contactToForm } from "@/components/outreach/outreach-helpers";

/** External contact create/edit dialog state + CRUD handlers. */
export function useContactEditor({
  setExternalContacts,
  setError,
}: {
  setExternalContacts: Dispatch<SetStateAction<ExternalContactDTO[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ExternalContactDTO | null>(null);
  const [contactForm, setContactForm] = useState<CreateExternalContactRequest>(EMPTY_CONTACT_FORM);

  const resetContactForm = () => {
    setContactForm(EMPTY_CONTACT_FORM);
  };

  const handleCreateContact = async () => {
    try {
      const newContact =
        await communicationService.createExternalContact(contactForm);
      setExternalContacts((prev) => [...prev, newContact]);
      setOpen(false);
      resetContactForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.failedCreateContact"));
    }
  };

  const handleUpdateContact = async () => {
    if (!editingContact) return;

    try {
      const updatedContact = await communicationService.updateExternalContact({
        ...contactForm,
        id: editingContact.id,
      });
      setExternalContacts((prev) =>
        prev.map((c) => (c.id === updatedContact.id ? updatedContact : c)),
      );
      setOpen(false);
      resetContactForm();
      setEditingContact(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.failedUpdateContact"));
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    try {
      await communicationService.deleteExternalContact(contactId);
      setExternalContacts((prev) => prev.filter((c) => c.id !== contactId));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.failedDeleteContact"));
    }
  };

  const startEdit = (contact: ExternalContactDTO) => {
    setEditingContact(contact);
    setContactForm(contactToForm(contact));
    setOpen(true);
  };

  const cancel = () => {
    setOpen(false);
    setEditingContact(null);
    resetContactForm();
  };

  return {
    open,
    setOpen,
    editingContact,
    contactForm,
    setContactForm,
    handleCreateContact,
    handleUpdateContact,
    handleDeleteContact,
    startEdit,
    cancel,
  };
}

export type ContactEditorState = ReturnType<typeof useContactEditor>;
