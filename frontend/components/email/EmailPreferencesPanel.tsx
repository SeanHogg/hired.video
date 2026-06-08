/**
 * EmailPreferencesPanel — the reusable marketing email consent control. One
 * component, two entry points (DRY):
 *   • token mode (`token` prop)  → public unsubscribe page from an email link
 *   • me mode (no token)         → authenticated Settings panel
 *
 * Self-loading + self-saving; the parent just drops it in. Master "receive
 * marketing emails" switch + per-category switches. Turning the master off is
 * a full unsubscribe; the only way back on is flipping it here (the sticky
 * opt-out rule lives server-side, this is just its UI).
 */
import { useEffect, useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { emailPreferencesService } from "@/lib/services/email-preferences-service";
import {
  MARKETING_CATEGORIES,
  MARKETING_CATEGORY_LABELS,
  MARKETING_CATEGORY_DESCRIPTIONS,
  type EmailMarketingPreferencesDTO,
  type MarketingCategory,
  type UpdatePreferencesInput,
} from "@shared/email-consent";

export interface EmailPreferencesPanelProps {
  /** Public token from an email link. Omit for the authenticated Settings view. */
  token?: string;
}

export function EmailPreferencesPanel({ token }: EmailPreferencesPanelProps) {
  const [prefs, setPrefs] = useState<EmailMarketingPreferencesDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    (token ? emailPreferencesService.getByToken(token) : emailPreferencesService.getMine());
  const save = (patch: UpdatePreferencesInput) =>
    token
      ? emailPreferencesService.updateByToken(token, patch)
      : emailPreferencesService.updateMine(patch);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load()
      .then((p) => active && setPrefs(p))
      .catch(() => active && setError("This link is invalid or has expired."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const apply = async (patch: UpdatePreferencesInput) => {
    setSaving(true);
    try {
      setPrefs(await save(patch));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading preferences…
      </div>
    );
  }
  if (error || !prefs) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {error ?? "Couldn't load preferences."}
        </CardContent>
      </Card>
    );
  }

  const receiving = !prefs.unsubscribedAll;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <MailCheck className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <p className="font-medium">Marketing emails</p>
            <p className="text-sm text-muted-foreground">
              Master switch for all hired.video marketing email to{" "}
              <strong>{prefs.email}</strong>. Account & security emails are always sent.
            </p>
          </div>
        </div>
        <Switch
          checked={receiving}
          disabled={saving}
          onCheckedChange={(v) => apply({ unsubscribedAll: !v })}
        />
      </div>

      <div className="space-y-2">
        {MARKETING_CATEGORIES.map((c: MarketingCategory) => (
          <div
            key={c}
            className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3"
          >
            <div>
              <p className="font-medium text-sm">{MARKETING_CATEGORY_LABELS[c]}</p>
              <p className="text-xs text-muted-foreground">
                {MARKETING_CATEGORY_DESCRIPTIONS[c]}
              </p>
            </div>
            <Switch
              checked={receiving && prefs.categories[c]}
              disabled={saving || !receiving}
              onCheckedChange={(v) => apply({ categories: { [c]: v } })}
            />
          </div>
        ))}
      </div>

      {saving && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Saving…
        </p>
      )}
    </div>
  );
}

export default EmailPreferencesPanel;
