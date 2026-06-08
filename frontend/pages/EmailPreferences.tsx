// Public email preference center, reached from the token link in any marketing
// email footer (/email-preferences/:token). No login required — the opaque
// token is the bearer credential. Reuses the same <EmailPreferencesPanel> the
// authenticated Settings page uses.
//
// eslint-page-chrome: skip — token-keyed public utility page reached from an
// email link; no breadcrumbs/SEO surface needed.
import { useParams } from "react-router-dom";
import { Mail } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmailPreferencesPanel } from "@/components/email/EmailPreferencesPanel";

export default function EmailPreferences() {
  const { token } = useParams<{ token: string }>();

  return (
    <AppShell bgClassName="bg-background">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" />
            Email preferences
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Choose which hired.video marketing emails you'd like to receive. Changes
            take effect immediately.
          </p>
        </div>
        {token ? (
          <EmailPreferencesPanel token={token} />
        ) : (
          <p className="text-muted-foreground">This preference link is missing its token.</p>
        )}
      </div>
    </AppShell>
  );
}
