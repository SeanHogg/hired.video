import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useProfileSectionSaver } from "@/lib/hooks/useProfileSectionSaver";

interface EditContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export default function EditContactDialog({ open, onOpenChange, onSaved }: EditContactDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { saving, save } = useProfileSectionSaver({
    onSaved,
    onClose: onOpenChange,
    errorLabel: "contact info",
  });
  const [form, setForm] = useState({ phone: "", website: "" });

  useEffect(() => {
    if (open && user) {
      setForm({
        phone: user.phone || "",
        website: user.website || "",
      });
    }
  }, [open, user]);

  const handleSave = () =>
    save({
      phone: form.phone,
      website: form.website,
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("headings.editContactInformation")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t("fields.email.label")}</Label>
            <Input value={user?.email || ""} disabled className="min-h-[44px] bg-muted" />
            <p className="text-xs text-muted-foreground">
              {t("labels.emailReadOnlyHint")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="editPhone">{t("fields.phoneNumber.label")}</Label>
            <Input
              id="editPhone"
              type="tel"
              placeholder={t("fields.phoneNumber.placeholder")}
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="min-h-[44px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="editWebsite">{t("fields.website.simpleLabel")}</Label>
            <Input
              id="editWebsite"
              type="url"
              placeholder={t("fields.website.profilePlaceholder")}
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              className="min-h-[44px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
