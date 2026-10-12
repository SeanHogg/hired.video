import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { settingsService } from "@/lib/services/settings-service";

interface Props {
  /**
   * Wrap the toggle in its own Card so it reads as a standalone block.
   * Use on pages that aren't already a list of toggle rows
   * (Content Creator → Account). Settings → Privacy renders many rows
   * inside one Card and passes false so this row joins the list.
   */
  asCard?: boolean;
}

/**
 * Self-contained Privacy → "Promote Services & Content Without Authentication"
 * toggle. Fetches and persists its own value via settingsService so any host
 * can drop it in without prop-drilling state. Mounted on Settings → Privacy
 * and Content Creator → Account.
 */
export default function PromoteWithoutAuthToggle({ asCard = false }: Props = {}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [value, setValue] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    settingsService
      .getPrivacySettings()
      .then((p) => { if (!cancelled) setValue(p.promoteWithoutAuth ?? false); })
      .catch(() => { /* leave default; user can still toggle to set */ })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  const onChange = async (next: boolean) => {
    const previous = value;
    setSaving(true);
    setValue(next);
    try {
      const updated = await settingsService.updatePrivacySettings({ promoteWithoutAuth: next });
      setValue(updated.promoteWithoutAuth ?? next);
    } catch {
      setValue(previous);
      toast({ title: t("errors.savePrivacyFailed"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const row = (
    <div className="flex items-center justify-between">
      <div className="space-y-1">
        <Label className="text-sm font-medium">
          {t("settings.privacy.promoteWithoutAuthLabel")}
        </Label>
        <p className="text-sm text-muted-foreground">
          {t("settings.privacy.promoteWithoutAuthDesc")}
        </p>
      </div>
      <Switch
        checked={value}
        disabled={!loaded || saving}
        onCheckedChange={onChange}
      />
    </div>
  );

  if (!asCard) return row;
  return (
    <Card>
      <CardContent className="p-5">{row}</CardContent>
    </Card>
  );
}
