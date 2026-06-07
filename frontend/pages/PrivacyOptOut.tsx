/**
 * /privacy/opt-out — CCPA / CPRA "Do Not Sell or Share My Personal
 * Information" self-service page. Closes gap #1149.
 *
 * Two flows:
 *   - Authenticated: server-side toggle on `users.do_not_share` via
 *     /api/Settings/privacy/do-not-share. Cascades marketing +
 *     personalization cookies to false on the server so the next pixel
 *     install pass short-circuits.
 *   - Anonymous: localStorage-only reject-optional via the cookie hook
 *     (best we can do without identifying the visitor), plus a mailto:
 *     fallback to privacy@hired.video for a verifiable request the DPO
 *     can process manually.
 */

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ShieldCheck, ExternalLink, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useCookiePreferences } from "@/hooks/use-cookie-preferences";
import { settingsService } from "@/lib/services/settings-service";
import { useSEO, useBreadcrumbs } from "@/lib/seo";

export default function PrivacyOptOut() {
  const location = useLocation();
  useSEO(location.pathname);
  useBreadcrumbs([{ name: "Do Not Sell or Share My Personal Information", url: "/privacy/opt-out" }]);
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const { rejectOptional, preferences } = useCookiePreferences();
  const [doNotShare, setDoNotShare] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setDoNotShare(null);
      return;
    }
    let cancelled = false;
    settingsService
      .getDoNotShare()
      .then((r) => { if (!cancelled) setDoNotShare(r.doNotShare); })
      .catch(() => { if (!cancelled) setDoNotShare(false); });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const handleToggle = async (next: boolean) => {
    if (!isAuthenticated) return;
    setBusy(true);
    try {
      const r = await settingsService.setDoNotShare(next);
      setDoNotShare(r.doNotShare);
      if (r.doNotShare) await rejectOptional();
      toast({
        title: r.doNotShare ? "Opt-out recorded" : "Opt-out reversed",
        description: r.doNotShare
          ? "We will not sell or share your personal information."
          : "You may now receive personalized advertising again.",
      });
    } catch {
      toast({
        title: "Couldn't update preference",
        description: "Please try again or email privacy@hired.video.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleAnonymousReject = async () => {
    setBusy(true);
    try {
      await rejectOptional();
      toast({
        title: "Marketing cookies disabled",
        description: "We've disabled non-essential cookies on this browser. Sign in to apply this across all your devices.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell bgClassName="bg-background">
      <main className="px-4 py-12 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Do Not Sell or Share My Personal Information</h1>
        <p className="text-muted-foreground mt-2">
          As required by the California Consumer Privacy Act (CCPA / CPRA),
          you can opt out of the sharing of your personal information for
          targeted advertising at any time. This page gives you the same
          control whether or not you're signed in.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            Your opt-out status
          </CardTitle>
          <CardDescription>
            Opting out turns off non-essential cookies, suppresses sharing of
            your identifiers with advertising partners, and prevents your
            data from being used for cross-context behavioral advertising.
            Essential cookies (sign-in, security) are unaffected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isAuthenticated ? (
            <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <Label htmlFor="do-not-share" className="text-base font-medium">
                  Do not sell or share my personal information
                </Label>
                <p className="text-sm text-muted-foreground">
                  Applies across every device you sign in on.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <Switch
                  id="do-not-share"
                  checked={doNotShare === true}
                  disabled={doNotShare === null || busy}
                  onCheckedChange={(v) => void handleToggle(!!v)}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Alert>
                <AlertTitle>Sign in for a verifiable, cross-device opt-out</AlertTitle>
                <AlertDescription>
                  When you're signed in we can record your opt-out on your account so it applies on every browser and device. The button below disables non-essential cookies on this browser only.
                </AlertDescription>
              </Alert>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link to="/login?next=/privacy/opt-out">Sign in to opt out</Link>
                </Button>
                <Button variant="outline" onClick={() => void handleAnonymousReject()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Opt out on this browser only
                </Button>
              </div>
              {preferences.consentedAt && !preferences.marketing && !preferences.personalization && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                  Non-essential cookies are currently disabled on this browser.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Other ways to exercise your privacy rights</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong>Email a request</strong> — Reach our Data Protection Officer at{" "}
            <a className="underline hover:text-foreground" href="mailto:privacy@hired.video">
              privacy@hired.video
            </a>
            . We respond within 45 days as required by CPRA.
          </p>
          <p>
            <strong>Settings</strong> — Manage cookie categories any time from{" "}
            <Link className="underline hover:text-foreground" to="/settings?tab=cookies">
              Settings → Cookies
            </Link>
            .
          </p>
          <p>
            <strong>Delete your account</strong> — Permanently delete your data from{" "}
            <Link className="underline hover:text-foreground" to="/settings?tab=privacy">
              Settings → Privacy
            </Link>
            .
          </p>
          <p>
            <strong>Browser-level signal</strong> — We honor the{" "}
            <a
              className="underline hover:text-foreground inline-flex items-center gap-0.5"
              href="https://globalprivacycontrol.org/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Global Privacy Control (GPC) <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>{" "}
            signal. Browsers and extensions that send it cause us to default to opt-out on first visit.
          </p>
          <p>
            Read the full{" "}
            <Link className="underline hover:text-foreground" to="/privacy">
              Privacy Policy
            </Link>{" "}
            for a complete description of categories collected, third-party recipients, and retention.
          </p>
        </CardContent>
      </Card>
      </main>
    </AppShell>
  );
}
