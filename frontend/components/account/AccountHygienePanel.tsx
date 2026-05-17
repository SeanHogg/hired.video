import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Download, RefreshCw, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";
import { DeleteAccountDialog } from "@/components/account/DeleteAccountDialog";

interface VerificationStatus {
  email?: string;
  emailConfirmed: boolean;
  sentAt?: string;
  sendCount?: number;
}

/**
 * Account-hygiene controls: email-verification status + resend, data export,
 * password change, and account deletion. Lives as a sub-tab of
 * [AccountManagementPanel](./AccountManagementPanel.tsx) under the consolidated
 * "Account & Billing" sidebar item — the standalone "Account" sidebar entry was
 * collapsed into this panel so users have one billing + account surface.
 *
 * Self-contained: owns its own verification fetch + resend cooldown + delete
 * dialog state. Returns null when the user is anonymous so the parent does not
 * need to gate visibility.
 */
export function AccountHygienePanel() {
  const { t } = useTranslation();
  const { isAuthenticated, resendEmailVerification, getVerificationStatus } = useAuth();
  const [verification, setVerification] = useState<VerificationStatus | null>(null);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    getVerificationStatus().then(setVerification).catch(() => setVerification(null));
  }, [isAuthenticated, getVerificationStatus]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = window.setInterval(() => setResendCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [resendCooldown]);

  if (!isAuthenticated) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("headings.accountManagement")}</CardTitle>
          <CardDescription>{t("messages.accountManagementDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-md border p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium mb-1">{t("headings.emailVerification")}</h4>
                <p className="text-sm text-muted-foreground">{verification?.email}</p>
              </div>
              <Badge variant={verification?.emailConfirmed ? "default" : "destructive"}>
                {verification?.emailConfirmed ? t("labels.verified") : t("labels.notVerified")}
              </Badge>
            </div>
            {!verification?.emailConfirmed ? (
              <div className="mt-3 flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    const ok = await resendEmailVerification();
                    if (ok) setResendCooldown(60);
                  }}
                  disabled={resendCooldown > 0}
                >
                  {resendCooldown > 0
                    ? t("actions.resendIn", { seconds: resendCooldown })
                    : t("actions.resendVerificationEmail")}
                </Button>
                <Link to="/verify-email" className="text-primary underline text-sm">
                  {t("actions.goToVerificationPage")}
                </Link>
              </div>
            ) : null}
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2">{t("headings.dataExport")}</h4>
            <p className="text-sm text-muted-foreground mb-4">{t("messages.dataExportDesc")}</p>
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              {t("actions.downloadData")}
            </Button>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-medium mb-2">{t("headings.password")}</h4>
            <p className="text-sm text-muted-foreground mb-4">{t("messages.passwordChangeDesc")}</p>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => window.open("https://hired.video/forgot-password", "_blank")}
            >
              <RefreshCw className="h-4 w-4" />
              {t("actions.changePassword")}
            </Button>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-medium mb-2 text-destructive">
              {t("headings.deleteAccount")}
            </h4>
            <p className="text-sm text-muted-foreground mb-4">{t("messages.deleteAccountDesc")}</p>
            <Button
              variant="destructive"
              className="gap-2"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              {t("headings.deleteAccount")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <DeleteAccountDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} />
    </>
  );
}
