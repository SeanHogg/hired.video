/**
 * /security/sessions — authed page that renders the SessionsPanel.
 *
 * Page-level shell only. The panel self-fetches via useSessions and
 * each row self-gates via SessionRow — no canRevoke / isCurrent prop
 * drilling.
 */

import { Navigate, useLocation } from "react-router-dom";
import { SessionsPanel } from "@/components/security/SessionsPanel";
import { TotpSetupPanel } from "@/components/security/TotpSetupPanel";
import { BackupCodesPanel } from "@/components/security/BackupCodesPanel";
import { ChangeEmailForm } from "@/components/security/ChangeEmailForm";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useSEO, useBreadcrumbs } from "@/lib/seo";

export default function SecuritySessions() {
  const location = useLocation();  const { isAuthenticated, isLoading } = useAuth();

  useSEO(location.pathname);
  useBreadcrumbs([
    { name: "Security", url: "/security" },
    { name: "Sessions", url: "/security/sessions" },
  ]);

  if (!isLoading && !isAuthenticated) {
    return <Navigate to="/login?redirect=/security/sessions" replace />;
  }

  return (
    <AppShell bgClassName="bg-background">
<div className="pt-16">
          <section className="py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto space-y-6">
              <div>
                <h1 className="text-3xl font-bold mb-2">Security</h1>
                <p className="text-muted-foreground">
                  Active devices, two-factor auth, backup codes, and email-change flow.
                </p>
              </div>
              <SessionsPanel />
              <TotpSetupPanel />
              <BackupCodesPanel />
              <ChangeEmailForm />
            </div>
          </section>
</div>
</AppShell>
  );
}
