import { Camera, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { useProfileSectionSaver } from "@/lib/hooks/useProfileSectionSaver";
import MediaPicker from "@/components/shared/MediaPicker";
import AIImproveButton from "@/components/profile/AIImproveButton";

interface EditHeaderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export default function EditHeaderDialog({ open, onOpenChange, onSaved }: EditHeaderDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { saving, save, runSave } = useProfileSectionSaver({
    onSaved,
    onClose: onOpenChange,
    errorLabel: "profile header",
  });
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    headline: "",
    location: "",
    currentRole: "",
    currentCompany: "",
  });

  useEffect(() => {
    if (open && user) {
      setForm({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        headline: user.headline || "",
        location: user.location || "",
        currentRole: user.currentRole || "",
        currentCompany: user.currentCompany || "",
      });
    }
  }, [open, user]);

  const handleSave = () =>
    save({
      firstName: form.firstName,
      lastName: form.lastName,
      headline: form.headline,
      location: form.location,
      currentRole: form.currentRole,
      currentCompany: form.currentCompany,
    });

  // Avatar uses the same save envelope but doesn't close the dialog —
  // user keeps editing other fields after a successful avatar pick.
  const { updateProfile } = useAuth();
  const handleAvatarPicked = async (url: string) => {
    await runSave(
      async () => {
        await updateProfile({ profilePicture: url });
      },
      { closeOnSuccess: false },
    );
  };

  const initials = `${form.firstName?.[0] || ""}${form.lastName?.[0] || ""}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("headings.editProfile")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="w-16 h-16">
                <AvatarImage src={user?.profilePicture ?? (user as { avatar?: string } | null)?.avatar} />
                <AvatarFallback className="text-xl">{initials}</AvatarFallback>
              </Avatar>
              <MediaPicker
                accept="image"
                title="Choose profile picture"
                onPick={(asset) => handleAvatarPicked(asset.url)}
                disabled={saving}
                trigger={
                  <button
                    type="button"
                    className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary text-primary-foreground rounded-full flex items-center justify-center cursor-pointer hover:opacity-90"
                    aria-label="Change profile picture"
                  >
                    <Camera className="h-3.5 w-3.5" />
                  </button>
                }
              />
            </div>
            <p className="text-sm text-muted-foreground">{t("labels.avatarHint")}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="editFirstName">{t("fields.firstName.label")}</Label>
              <Input
                id="editFirstName"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editLastName">{t("fields.lastName.label")}</Label>
              <Input
                id="editLastName"
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                className="min-h-[44px]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="editHeadline">{t("fields.headline.label")}</Label>
              <AIImproveButton
                field="headline"
                text={form.headline}
                context={{
                  name: `${form.firstName} ${form.lastName}`.trim() || undefined,
                  role: form.currentRole || undefined,
                  company: form.currentCompany || undefined,
                }}
                onImproved={(headline) => setForm((f) => ({ ...f, headline }))}
                disabled={saving}
              />
            </div>
            {/* Textarea (not Input) so a long headline wraps and stays fully
                visible — the single-line input was truncating the value. */}
            <Textarea
              id="editHeadline"
              placeholder={t("fields.headline.placeholder")}
              value={form.headline}
              onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))}
              rows={2}
              className="min-h-[44px] resize-none"
            />
            <p className="text-xs text-muted-foreground">{t("fields.headline.help")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="editLocation">{t("fields.location.label")}</Label>
            <Input
              id="editLocation"
              placeholder={t("fields.location.placeholder")}
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              className="min-h-[44px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="editCurrentRole">{t("fields.jobTitle.label")}</Label>
              <Input
                id="editCurrentRole"
                placeholder={t("fields.jobTitle.placeholder")}
                value={form.currentRole}
                onChange={(e) => setForm((f) => ({ ...f, currentRole: e.target.value }))}
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editCurrentCompany">{t("fields.company.label")}</Label>
              <Input
                id="editCurrentCompany"
                placeholder={t("fields.company.placeholder")}
                value={form.currentCompany}
                onChange={(e) => setForm((f) => ({ ...f, currentCompany: e.target.value }))}
                className="min-h-[44px]"
              />
            </div>
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
