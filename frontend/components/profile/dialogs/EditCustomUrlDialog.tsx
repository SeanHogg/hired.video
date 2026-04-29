import { Check, Loader2, X as XIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { userService } from "@/lib/services/user-service";

interface EditCustomUrlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EditCustomUrlDialog({ open, onOpenChange }: EditCustomUrlDialogProps) {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const [slugInput, setSlugInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSlugInput(user?.slug || "");
      setAvailable(null);
    }
  }, [open, user]);

  const handleSlugChange = async (val: string) => {
    const clean = val.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSlugInput(clean);
    setAvailable(null);

    if (clean.length >= 2 && clean !== user?.slug) {
      setChecking(true);
      try {
        const res = await userService.checkSlug(clean);
        setAvailable(res.available);
      } catch {
        setAvailable(false);
      }
      setChecking(false);
    } else if (clean === user?.slug) {
      // Same as current - no need to check
      setAvailable(true);
    }
  };

  const handleSave = async () => {
    if (!available || slugInput.length < 2) return;
    if (slugInput === user?.slug) {
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      await userService.updateSlug(slugInput);
      await refreshUser();
      onOpenChange(false);
    } catch {
      // keep dialog open on error
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("headings.customProfileUrl")}</DialogTitle>
          <DialogDescription>
            {t("labels.customUrlIntro")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Label htmlFor="editSlug">{t("fields.customUrl.label")}</Label>
          <div className="flex items-center border rounded-md overflow-hidden">
            <span className="px-3 py-2.5 bg-muted text-muted-foreground text-sm border-r whitespace-nowrap">
              hired.video/people/
            </span>
            <input
              id="editSlug"
              className="flex-1 px-3 py-2.5 outline-none bg-background text-foreground text-sm min-w-0"
              value={slugInput}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder={t("fields.customUrl.userPlaceholder")}
              autoFocus
            />
            <div className="pr-3 flex items-center">
              {checking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {!checking && available === true && <Check className="h-4 w-4 text-emerald-500" />}
              {!checking && available === false && <XIcon className="h-4 w-4 text-destructive" />}
            </div>
          </div>
          {available === false && (
            <p className="text-xs text-destructive">{t("labels.customUrlNotAvailable")}</p>
          )}
          {slugInput.length > 0 && slugInput.length < 2 && (
            <p className="text-xs text-muted-foreground">{t("labels.customUrlMinChars")}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("actions.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!available || saving || slugInput.length < 2}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
