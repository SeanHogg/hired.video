import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { ContactEditorState } from "@/components/outreach/hooks/useContactEditor";

type ContactTextField = "firstName" | "lastName" | "jobTitle" | "companyName" | "phone" | "location";

/** External Contact Dialog — create or edit. */
export function ExternalContactDialog({ state }: { state: ContactEditorState }) {
  const { t } = useTranslation();
  const { contactForm, setContactForm, editingContact } = state;

  const textField = (id: string, labelKey: string, field: ContactTextField) => (
    <div>
      <Label htmlFor={id}>{t(labelKey)}</Label>
      <Input
        id={id}
        value={contactForm[field]}
        onChange={(e) =>
          setContactForm({ ...contactForm, [field]: e.target.value })
        }
      />
    </div>
  );

  return (
    <Dialog open={state.open} onOpenChange={state.setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editingContact ? t("actions.editContactAction") : t("actions.addExternalContact")}
          </DialogTitle>
          <DialogDescription>
            {t("messages.contactsForCampaigns")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {textField("contact-first-name", "fields.firstName.label", "firstName")}
            {textField("contact-last-name", "fields.lastName.label", "lastName")}
          </div>

          <div>
            <Label htmlFor="contact-email">{t("fields.contactEmail.label")}</Label>
            <Input
              id="contact-email"
              type="email"
              value={contactForm.email}
              onChange={(e) =>
                setContactForm({ ...contactForm, email: e.target.value })
              }
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {textField("contact-job-title", "fields.contactJobTitleField.label", "jobTitle")}
            {textField("contact-company", "fields.companyNameField.label", "companyName")}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {textField("contact-phone", "fields.phone.label", "phone")}
            {textField("contact-location", "fields.location.label", "location")}
          </div>

          <div>
            <Label htmlFor="contact-linkedin">{t("fields.linkedinUrl.label")}</Label>
            <Input
              id="contact-linkedin"
              value={contactForm.linkedInUrl}
              onChange={(e) =>
                setContactForm({
                  ...contactForm,
                  linkedInUrl: e.target.value,
                })
              }
              placeholder={t("fields.linkedinUrl.placeholder")}
            />
          </div>

          <div>
            <Label htmlFor="contact-notes">{t("fields.notes.label")}</Label>
            <Textarea
              id="contact-notes"
              value={contactForm.notes}
              onChange={(e) =>
                setContactForm({ ...contactForm, notes: e.target.value })
              }
              placeholder={t("fields.contactNotes.placeholder")}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={state.cancel}>
            {t("actions.cancel")}
          </Button>
          <Button
            onClick={
              editingContact ? state.handleUpdateContact : state.handleCreateContact
            }
          >
            {editingContact ? t("actions.updateContact") : t("actions.addContact")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
