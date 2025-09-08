import React, { useState } from "react";
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
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
      // Call the delete account API (backend automatically signs out the user)
      await accountService.deleteAccount();

      toast({
        title: "Account Deleted",
        description:
          "Your account has been successfully deleted. You will be redirected to the home page.",
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
        title: "Deletion Failed",
        description:
          "Failed to delete your account. Please try again or contact support.",
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
            Delete Account
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left space-y-4">
            <p className="font-medium">
              This action will permanently delete your account and cannot be
              undone.
            </p>

            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 space-y-3">
              <h4 className="font-semibold text-destructive">
                What happens when you delete your account:
              </h4>
              <ul className="space-y-2 text-sm">
                <li>• Your account will be deactivated immediately</li>
                <li>
                  • All your resumes and profile information will be made
                  private
                </li>
                <li>• Your personal data will be anonymized for privacy</li>
                <li>
                  • You will be removed from any company accounts you&apos;re
                  associated with
                </li>
                <li>• Your email address will be freed up for future use</li>
                <li>
                  • Company profiles you own will be made private but not
                  deleted
                </li>
              </ul>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-800 mb-2">
                Before you delete:
              </h4>
              <p className="text-sm text-blue-700">
                Make sure to download any important data (resumes, company
                information) as you won&apos;t be able to access it after
                deletion.
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
                I understand that all my data will be made private and
                anonymized
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
                I understand this action is permanent and cannot be undone
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
                I have downloaded any important data I want to keep
              </Label>
            </div>
          </div>

          {/* Confirmation text input */}
          <div className="space-y-2">
            <Label htmlFor="confirmation" className="text-sm font-medium">
              Type &quot;delete my account&quot; to confirm:
            </Label>
            <Input
              id="confirmation"
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              placeholder="delete my account"
              disabled={isDeleting}
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={!canDelete}
            className="bg-destructive hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting Account...
              </>
            ) : (
              "Delete Account"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
