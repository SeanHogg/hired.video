import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { accountService } from "@/lib/services/account-service";
import { useAuth } from "@/lib/auth";

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteAccountDialog({
  open,
  onOpenChange,
}: DeleteAccountDialogProps) {
  const { toast } = useToast();
  const { logout } = useAuth();
  const { t } = useTranslation();
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [transferToEmail, setTransferToEmail] = useState("");
  const [acknowledgeWarnings, setAcknowledgeWarnings] = useState({
    dataLoss: false,
    permanent: false,
    privacy: false,
  });

  const isConfirmationValid =
    confirmationText.toLowerCase() === "delete my account";
  const allWarningsAcknowledged =
    Object.values(acknowledgeWarnings).every(Boolean);
  const canDelete =
    isConfirmationValid && allWarningsAcknowledged && !isDeleting;

  const handleDelete = async () => {
    if (!canDelete) return;

    setIsDeleting(true);
    try {
      // Call the delete account API (backend automatically signs out the user).
      // When transferToEmail is set, the backend reassigns personal videos to
      // that user before disabling the account.
      const result = await accountService.deleteAccount({
        transferToEmail: transferToEmail.trim() || undefined,
      });

      const transferred = result.transferredProjects + result.transferredVideos;
      toast({
        title: t("messages.accountDeletedTitle"),
        description:
          transferred > 0
            ? `${t("messages.accountDeletedDesc")} (${result.transferredProjects} project(s) and ${result.transferredVideos} video(s) transferred.)`
            : t("messages.accountDeletedDesc"),
      });

      // Close dialog
      onOpenChange(false);

      // Use the auth context logout method to properly clear both local storage and React state
      await logout();

      // Force a complete page reload to ensure all state is cleared
      window.location.replace("/");
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error deleting account:", error);
      toast({
        title: t("errors.deleteAccountTitle"),
        description: t("errors.deleteAccountDesc"),
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isDeleting) {
      onOpenChange(newOpen);
      if (!newOpen) {
        // Reset form when closing
        setConfirmationText("");
        setTransferToEmail("");
        setAcknowledgeWarnings({
          dataLoss: false,
          permanent: false,
          privacy: false,
        });
      }
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {t("headings.deleteAccount")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left space-y-4">
            <p className="font-medium">
              {t("messages.deleteAccountIntro")}
            </p>

            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 space-y-3">
              <h4 className="font-semibold text-destructive">
                {t("headings.whatHappensOnDelete")}
              </h4>
              <ul className="space-y-2 text-sm">
                <li>• {t("messages.deleteEffect.deactivated")}</li>
                <li>• {t("messages.deleteEffect.private")}</li>
                <li>• {t("messages.deleteEffect.anonymized")}</li>
                <li>• {t("messages.deleteEffect.removed")}</li>
                <li>• {t("messages.deleteEffect.emailFreed")}</li>
                <li>• {t("messages.deleteEffect.companies")}</li>
              </ul>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-800 mb-2">
                {t("headings.beforeYouDelete")}
              </h4>
              <p className="text-sm text-blue-700">
                {t("messages.beforeYouDeleteBody")}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          {/* Acknowledgment checkboxes */}
          <div className="space-y-3">
            <div className="flex items-start space-x-2">
              <Checkbox
                id="dataLoss"
                checked={acknowledgeWarnings.dataLoss}
                onCheckedChange={(checked) =>
                  setAcknowledgeWarnings((prev) => ({
                    ...prev,
                    dataLoss: !!checked,
                  }))
                }
              />
              <Label htmlFor="dataLoss" className="text-sm leading-5">
                {t("labels.acknowledgeDataLoss")}
              </Label>
            </div>

            <div className="flex items-start space-x-2">
              <Checkbox
                id="permanent"
                checked={acknowledgeWarnings.permanent}
                onCheckedChange={(checked) =>
                  setAcknowledgeWarnings((prev) => ({
                    ...prev,
                    permanent: !!checked,
                  }))
                }
              />
              <Label htmlFor="permanent" className="text-sm leading-5">
                {t("labels.acknowledgePermanent")}
              </Label>
            </div>

            <div className="flex items-start space-x-2">
              <Checkbox
                id="privacy"
                checked={acknowledgeWarnings.privacy}
                onCheckedChange={(checked) =>
                  setAcknowledgeWarnings((prev) => ({
                    ...prev,
                    privacy: !!checked,
                  }))
                }
              />
              <Label htmlFor="privacy" className="text-sm leading-5">
                {t("labels.acknowledgePrivacy")}
              </Label>
            </div>
          </div>

          {/* Optional ownership transfer — kept-alive identity */}
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <Label htmlFor="transferTo" className="text-sm font-medium">
              Transfer my personal videos to (optional)
            </Label>
            <Input
              id="transferTo"
              type="email"
              value={transferToEmail}
              onChange={(e) => setTransferToEmail(e.target.value)}
              placeholder="successor@email.com"
              disabled={isDeleting}
            />
            <p className="text-xs text-muted-foreground">
              If set, every personal studio project and video you own will be
              reassigned to that user before your account is disabled. They
              must already have a hired.video account. Company-owned videos
              stay with the company regardless.
            </p>
          </div>

          {/* Confirmation text input */}
          <div className="space-y-2">
            <Label htmlFor="confirmation" className="text-sm font-medium">
              {t("labels.confirmDeleteAccount")}
            </Label>
            <Input
              id="confirmation"
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              placeholder={t("fields.deleteConfirmation.placeholder")}
              disabled={isDeleting}
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>{t("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={!canDelete}
            className="bg-destructive hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("status.deletingAccount")}
              </>
            ) : (
              t("headings.deleteAccount")
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
