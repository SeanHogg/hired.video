import { useEffect, useState } from "react";
import { LayoutDashboard } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { authService } from "@/lib/services/auth-service";
import { userService } from "@/lib/services/user-service";
import {
  PROFILE_SECTION_I18N,
  PROFILE_SECTION_KEYS,
  resolveProfileSections,
  type ProfileSectionKey,
  type ProfileSections,
  type StoredProfileSections,
} from "../../../shared/profile-sections";

/**
 * Settings → Profile Sections panel. Self-fetches the resolved
 * visibility map for the authenticated user, then PATCHes the full map
 * on each toggle. The server merges with role defaults at read time
 * (shared/profile-sections.ts) so flipping a key back to its default is
 * harmless — it just becomes redundant with the fallback.
 *
 * Labels + descriptions come from `PROFILE_SECTION_I18N` (i18n keys);
 * the panel iterates `PROFILE_SECTION_KEYS` so adding a section in the
 * shared module automatically surfaces here without an extra edit.
 */
export default function ProfileSectionsSettingsCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const role = (user as any)?.role ?? null;

  const [sections, setSections] = useState<ProfileSections>(() =>
    resolveProfileSections(null, role),
  );
  const [loaded, setLoaded] = useState(false);
  const [savingKey, setSavingKey] = useState<ProfileSectionKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    userService
      .getCurrentUser()
      .then((profile: any) => {
        if (cancelled) return;
        const stored = (profile?.profileSectionsRaw ?? profile?.profileSections ?? null) as
          | StoredProfileSections
          | null;
        setSections(resolveProfileSections(stored, profile?.role ?? role));
      })
      .catch(() => {
        // Fall through to role defaults — user can still toggle.
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [role]);

  const onChange = async (key: ProfileSectionKey, next: boolean) => {
    const previous = sections;
    const merged: ProfileSections = { ...sections, [key]: next };
    setSavingKey(key);
    setSections(merged);
    try {
      await authService.updateProfile({ profileSections: merged });
    } catch {
      setSections(previous);
      toast({ title: t("settings.profileSections.saveFailed"), variant: "destructive" });
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5" />
          {t("settings.profileSections.cardTitle")}
        </CardTitle>
        <CardDescription>{t("settings.profileSections.cardDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {PROFILE_SECTION_KEYS.map((key, idx) => (
          <div key={key}>
            {idx > 0 && <Separator className="mb-6" />}
            <div className="flex items-center justify-between">
              <div className="space-y-1 pr-4">
                <Label className="text-sm font-medium">
                  {t(PROFILE_SECTION_I18N[key].label)}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t(PROFILE_SECTION_I18N[key].description)}
                </p>
              </div>
              <Switch
                checked={sections[key]}
                disabled={!loaded || savingKey !== null}
                onCheckedChange={(checked) => onChange(key, checked)}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
