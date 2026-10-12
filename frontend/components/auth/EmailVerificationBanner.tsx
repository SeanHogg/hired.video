/**
 * Persistent banner shown across the app whenever the signed-in user
 * hasn't verified their email yet. Owns its own data fetch + resend
 * cooldown — consumers just mount it and the component decides whether
 * to render anything.
 *
 * Returns null when:
 *   • the user is not authenticated, or
 *   • the user is authenticated AND emailVerified.
 *
 * Mounted once in <AppShell> (and only there) so users see this on
 * every page until they verify, including landing pages they can still
 * reach in verification limbo.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

const RESEND_COOLDOWN_SECONDS = 60;

interface VerificationStatus {
  email?: string;
  emailConfirmed: boolean;
  sentAt?: string;
  sendCount?: number;
}

export function EmailVerificationBanner() {
  const { t } = useTranslation();
  const { isAuthenticated, isEmailVerified, user, resendEmailVerification, getVerificationStatus } = useAuth();
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);

  // Probe the verification gate once per session — the JWT carries an
  // `emailVerified` flag, but the server endpoint is the source of truth
  // (admin manually flipping the flag, etc.).
  useEffect(() => {
    if (!isAuthenticated) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    getVerificationStatus()
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
      })
      .catch(() => {
        if (cancelled) return;
        // Endpoint failure — fall back to the JWT claim so the banner
        // doesn't silently disappear when the verification status route
        // is rate-limited or down.
        setStatus({ emailConfirmed: isEmailVerified !== false, email: user?.email });
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, getVerificationStatus, isEmailVerified, user?.email]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  if (!isAuthenticated) return null;
  if (status == null) return null;
  if (status.emailConfirmed) return null;

  const handleResend = async () => {
    setBusy(true);
    try {
      const ok = await resendEmailVerification();
      if (ok) setCooldown(RESEND_COOLDOWN_SECONDS);
    } finally {
      setBusy(false);
    }
  };

  const resendLabel =
    cooldown > 0
      ? t("actions.resendIn", { seconds: cooldown, defaultValue: `Resend in ${cooldown}s` })
      : t("actions.resendVerificationEmail", { defaultValue: "Resend verification email" });

  return (
    <div className="px-4 pt-3">
      <Alert>
        <AlertDescription>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span>
              {t("messages.emailNotVerifiedBanner", {
                defaultValue:
                  "Verify your email to unlock email integrations, OAuth sign-ins, and full inbox sync.",
              })}
              {status.email ? <span className="ml-2 text-muted-foreground">({status.email})</span> : null}
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleResend} disabled={busy || cooldown > 0}>
                {resendLabel}
              </Button>
              <Link to="/verify-email" className="inline-flex min-h-[40px] items-center text-sm font-semibold text-primary hover:underline">
                {t("actions.verifyNow", { defaultValue: "Verify now" })}
              </Link>
            </div>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}

export default EmailVerificationBanner;
