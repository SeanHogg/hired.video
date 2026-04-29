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

interface EditSocialProfilesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EditSocialProfilesDialog({ open, onOpenChange }: EditSocialProfilesDialogProps) {
  const { t } = useTranslation();
  const { user, updateProfile, refreshUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ linkedIn: "", github: "", twitter: "" });

  useEffect(() => {
    if (open && user) {
      setForm({
        linkedIn: user.linkedIn || "",
        github: user.github || "",
        twitter: user.twitter || "",
      });
    }
  }, [open, user]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateProfile({
        linkedIn: form.linkedIn,
        github: form.github,
        twitter: form.twitter,
      });
      refreshUser().catch(() => {});
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save social profiles:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("headings.editSocialProfiles")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="editLinkedIn">{t("fields.linkedIn.label")}</Label>
            <Input
              id="editLinkedIn"
              type="url"
              placeholder={t("fields.linkedIn.placeholder")}
              value={form.linkedIn}
              onChange={(e) => setForm((f) => ({ ...f, linkedIn: e.target.value }))}
              className="min-h-[44px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="editGitHub">{t("fields.github.label")}</Label>
            <Input
              id="editGitHub"
              type="url"
              placeholder={t("fields.github.placeholder")}
              value={form.github}
              onChange={(e) => setForm((f) => ({ ...f, github: e.target.value }))}
              className="min-h-[44px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="editTwitter">{t("fields.twitter.label")}</Label>
            <Input
              id="editTwitter"
              type="url"
              placeholder={t("fields.twitter.placeholder")}
              value={form.twitter}
              onChange={(e) => setForm((f) => ({ ...f, twitter: e.target.value }))}
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
