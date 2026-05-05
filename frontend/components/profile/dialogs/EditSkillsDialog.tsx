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

interface EditSkillsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export default function EditSkillsDialog({ open, onOpenChange, onSaved }: EditSkillsDialogProps) {
  const { t } = useTranslation();
  const { user, updateProfile, refreshUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ skills: "", industries: "" });

  useEffect(() => {
    if (open && user) {
      setForm({
        skills: user.skills?.join(", ") || "",
        industries: user.industries?.join(", ") || "",
      });
    }
  }, [open, user]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateProfile({
        skills: form.skills
          ? form.skills.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        industries: form.industries
          ? form.industries.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
      });
      refreshUser().catch(() => {});
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save skills:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("headings.editSkillsAndIndustries")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="editSkills">{t("fields.skills.label")}</Label>
            <Input
              id="editSkills"
              placeholder={t("fields.skills.placeholder")}
              value={form.skills}
              onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))}
              className="min-h-[44px]"
            />
            <p className="text-xs text-muted-foreground">{t("labels.separateSkillsWithCommas")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="editIndustries">{t("fields.industries.label")}</Label>
            <Input
              id="editIndustries"
              placeholder={t("fields.industries.placeholder")}
              value={form.industries}
              onChange={(e) => setForm((f) => ({ ...f, industries: e.target.value }))}
              className="min-h-[44px]"
            />
            <p className="text-xs text-muted-foreground">{t("labels.separateIndustriesWithCommas")}</p>
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
