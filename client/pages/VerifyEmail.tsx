import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Mail, LogOut } from "lucide-react";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function VerifyEmail(): JSX.Element {
  const navigate = useNavigate();
  const query = useQuery();
  const redirect = query.get("redirect") || "/dashboard";
  const hintedEmail = query.get("email") || undefined;

  const { user, isAuthenticated, resendEmailVerification, getVerificationStatus, logout } = useAuth();

  const [email, setEmail] = useState<string | undefined>(hintedEmail);
  const [statusLoading, setStatusLoading] = useState<boolean>(false);
  const [resendLoading, setResendLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<number>(0);

  // Sync email from authenticated user if present
  useEffect(() => {
    if (user?.email) setEmail(user.email);
  }, [user?.email]);

  // If the user becomes verified, send them forward
  const checkAndRedirectIfVerified = async () => {
    try {
      setStatusLoading(true);
      const status = await getVerificationStatus();
      if (status.isEmailVerified || status.emailConfirmed) {
        navigate(redirect, { replace: true });
        return true;
      }
      return false;
    } catch (e) {
      // If not authenticated, keep them on page with guidance
      return false;
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    // Proactively check status for authenticated users
    if (isAuthenticated) {
      checkAndRedirectIfVerified();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const handleResend = async () => {
    setError(null);
    setMessage(null);
    setResendLoading(true);
    const ok = await resendEmailVerification();
    setResendLoading(false);
    if (ok) {
      setMessage("Verification email sent. Please check your inbox.");
      setCooldown(60); // 1 per minute rate limit UX
    } else {
      setError("Please wait before requesting another verification email.");
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="container mx-auto max-w-xl py-10">
      <Card>
        <CardHeader>
          <CardTitle>Verify your email to continue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            For your security and to prevent fake profiles, you must verify your email address before accessing your account.
          </p>
          {email && (
            <Alert>
              <Mail className="h-4 w-4" />
              <AlertDescription>
                We sent a verification link to <strong>{email}</strong>. Check your inbox (and spam folder).
              </AlertDescription>
            </Alert>
          )}

          <p className="text-sm text-muted-foreground">
            Need to update your email? You can change it in your account settings after signing in.
          </p>

          {!isAuthenticated && (
            <Alert>
              <AlertDescription>
                You are not currently signed in. Please sign in with your account to resend the verification email.
              </AlertDescription>
            </Alert>
          )}

          {message && (
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button
            onClick={handleResend}
            disabled={!isAuthenticated || resendLoading || cooldown > 0}
          >
            {resendLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending
              </>
            ) : cooldown > 0 ? (
              <>Resend in {cooldown}s</>
            ) : (
              <>Resend Verification Email</>
            )}
          </Button>
          <Button variant="secondary" onClick={() => checkAndRedirectIfVerified()} disabled={statusLoading}>
            {statusLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            I already verified
          </Button>
          <div className="grow" />
          <Button variant="ghost" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" /> Logout
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

