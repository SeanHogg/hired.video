import { Loader2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
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
import { useProfileSectionSaver } from "@/lib/hooks/useProfileSectionSaver";
import { useImproveText } from "@/lib/hooks/useImproveText";
import AIImproveButton from "@/components/profile/AIImproveButton";

interface EditAboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  /** When opened via the section header's ✨ icon, kick off an AI rewrite of
   *  the existing bio automatically (once per open). */
  autoImprove?: boolean;
}

export default function EditAboutDialog({ open, onOpenChange, onSaved, autoImprove }: EditAboutDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { saving, save } = useProfileSectionSaver({
    onSaved,
    onClose: onOpenChange,
    errorLabel: "bio",
  });
  // Auto-kickoff controller (the manual button owns its own via AIImproveButton).
  const { improve, loading: autoImproving } = useImproveText();
  const [bio, setBio] = useState("");
  const autoRanRef = useRef(false);

  const aiContext = {
    name: `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || undefined,
    role: user?.currentRole || undefined,
    company: user?.currentCompany || undefined,
  };

  useEffect(() => {
    if (open && user) {
      setBio(user.bio || "");
    }
    if (!open) autoRanRef.current = false;
  }, [open, user]);

  // Open-via-✨ path: rewrite the current bio with AI as soon as the dialog
  // mounts. Guarded so it runs once per open even as `user`/deps settle.
  useEffect(() => {
    if (!open || !autoImprove || autoRanRef.current || !user) return;
    autoRanRef.current = true;
    void (async () => {
      const improved = await improve({ field: "about", text: user.bio || "", context: aiContext });
      if (improved) setBio(improved);
    })();
    // aiContext is derived from `user`; depending on `user` is sufficient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoImprove, user, improve]);

  const handleSave = () => save({ bio });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("headings.editAbout")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="editBio">{t("fields.aboutYou.label")}</Label>
            <AIImproveButton
              field="about"
              text={bio}
              context={aiContext}
              onImproved={setBio}
              disabled={saving || autoImproving}
            />
          </div>
          <div className="relative">
            <Textarea
              id="editBio"
              placeholder={t("fields.aboutYou.placeholder")}
              rows={6}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              disabled={autoImproving}
            />
            {autoImproving && (
              <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/60">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("labels.charactersCount", { count: bio.length, max: 2000 })}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving || autoImproving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
