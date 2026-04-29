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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";

interface EditAboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EditAboutDialog({ open, onOpenChange }: EditAboutDialogProps) {
  const { t } = useTranslation();
  const { user, updateProfile, refreshUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [bio, setBio] = useState("");

  useEffect(() => {
    if (open && user) {
      setBio(user.bio || "");
    }
  }, [open, user]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateProfile({ bio });
      refreshUser().catch(() => {});
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save bio:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("headings.editAbout")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="editBio">{t("fields.aboutYou.label")}</Label>
          <Textarea
            id="editBio"
            placeholder={t("fields.aboutYou.placeholder")}
            rows={6}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {t("labels.charactersCount", { count: bio.length, max: 2000 })}
          </p>
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
