import { useEffect, useState } from "react";
import { Brain, Chrome, ExternalLink, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/lib/hooks/useSubscription";
import {
  settingsService,
  type ExtensionSettings,
  type ExtensionJobseekerSettings,
  type ExtensionRecruiterSettings,
  type ExtensionAISettings,
} from "@/lib/services/settings-service";
import { notifyExtension } from "@/hooks/use-extension-bridge";

export function ExtensionsSettings() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsService
      .getExtensionSettings()
      .then(setSettings)
      .catch((err) => {
        console.error("Failed to load extension settings", err);
        toast({
          title: t("errors.loadExtensionSettingsFailed"),
          description: t("messages.tryRefreshing"),
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
  }, [toast, t]);

  // Keep the web view in sync if the Chrome extension changes its own
  // settings while this tab is open. auth-bridge.js fires this custom
  // event when the extension broadcasts `settings-changed`.
  useEffect(() => {
    const onExtensionEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.type !== "settings-changed") return;
      settingsService.getExtensionSettings().then(setSettings).catch(() => {});
    };
    window.addEventListener("hired.video:extension-event", onExtensionEvent);
    return () => window.removeEventListener("hired.video:extension-event", onExtensionEvent);
  }, []);

  const patch = async (
    next: ExtensionSettings,
    patchBody: Partial<{
      jobseeker: Partial<ExtensionJobseekerSettings>;
      recruiter: Partial<ExtensionRecruiterSettings>;
      ai: Partial<ExtensionAISettings>;
    }>,
  ) => {
    setSettings(next); // optimistic
    setSaving(true);
    try {
      const server = await settingsService.updateExtensionSettings(patchBody);
      setSettings(server);
      notifyExtension("settings-changed");
    } catch (err) {
      console.error("Failed to save extension settings", err);
      toast({
        title: t("errors.saveExtensionSettingFailed"),
        description: t("messages.pleaseTryAgain"),
        variant: "destructive",
      });
      // Re-fetch authoritative state so the UI doesn't lie.
      settingsService.getExtensionSettings().then(setSettings).catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  const setJobseeker = <K extends keyof ExtensionJobseekerSettings>(key: K, value: ExtensionJobseekerSettings[K]) => {
    if (!settings) return;
    const next = { ...settings, jobseeker: { ...settings.jobseeker, [key]: value } };
    patch(next, { jobseeker: { [key]: value } as Partial<ExtensionJobseekerSettings> });
  };

  const setRecruiter = <K extends keyof ExtensionRecruiterSettings>(key: K, value: ExtensionRecruiterSettings[K]) => {
    if (!settings) return;
    const next = { ...settings, recruiter: { ...settings.recruiter, [key]: value } };
    patch(next, { recruiter: { [key]: value } as Partial<ExtensionRecruiterSettings> });
  };

  const setAi = <K extends keyof ExtensionAISettings>(key: K, value: ExtensionAISettings[K]) => {
    if (!settings) return;
    const next = { ...settings, ai: { ...settings.ai, [key]: value } };
    patch(next, { ai: { [key]: value } as Partial<ExtensionAISettings> });
  };

  if (loading || !settings) {
    return (
      <Card>
        <CardContent className="py-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const js = settings.jobseeker;
  const rc = settings.recruiter;
  const ai = settings.ai;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Chrome className="h-5 w-5" />
                {t("headings.chromeExtensions")}
              </CardTitle>
              <CardDescription>
                {t("messages.chromeExtensionsDesc")}
              </CardDescription>
            </div>
            {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("headings.jobSeekerExtension")}</CardTitle>
          <CardDescription>
            {t("messages.jobSeekerExtensionDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ToggleRow
            id="js-auto-detect"
            label={t("settings.extensions.autoDetectLabel")}
            description={t("settings.extensions.jsAutoDetectDesc")}
            checked={js.autoDetect}
            onChange={(v) => setJobseeker("autoDetect", v)}
          />
          <ToggleRow
            id="js-auto-score"
            label={t("settings.extensions.autoScoreLabel")}
            description={t("settings.extensions.jsAutoScoreDesc")}
            checked={js.autoScore}
            onChange={(v) => setJobseeker("autoScore", v)}
            pro
          />
          <ToggleRow
            id="js-auto-tailor"
            label={t("settings.extensions.autoTailorLabel")}
            description={t("settings.extensions.autoTailorDesc")}
            checked={js.autoTailor}
            onChange={(v) => setJobseeker("autoTailor", v)}
            pro
          />
          <ToggleRow
            id="js-wizard"
            label={t("settings.extensions.wizardModeLabel")}
            description={t("settings.extensions.wizardModeDesc")}
            checked={js.wizardMode}
            onChange={(v) => setJobseeker("wizardMode", v)}
          />
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="js-download-format">{t("settings.extensions.downloadFormatLabel")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.extensions.downloadFormatDesc")}
              </p>
            </div>
            <Select
              value={js.downloadFormat}
              onValueChange={(v) => setJobseeker("downloadFormat", v)}
            >
              <SelectTrigger id="js-download-format" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">{t("labels.downloadFormat.pdf")}</SelectItem>
                <SelectItem value="docx">{t("labels.downloadFormat.docx")}</SelectItem>
                <SelectItem value="txt">{t("labels.downloadFormat.txt")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("headings.recruiterExtension")}</CardTitle>
          <CardDescription>
            {t("messages.recruiterExtensionDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ToggleRow
            id="rc-detect-jobs"
            label={t("settings.extensions.autoDetectLabel")}
            description={t("settings.extensions.detectJobsDesc")}
            checked={rc.autoDetectJobs}
            onChange={(v) => setRecruiter("autoDetectJobs", v)}
            pro
          />
          <ToggleRow
            id="rc-detect-profiles"
            label={t("settings.extensions.detectProfilesLabel")}
            description={t("settings.extensions.detectProfilesDesc")}
            checked={rc.autoDetectProfiles}
            onChange={(v) => setRecruiter("autoDetectProfiles", v)}
            pro
          />
          <ToggleRow
            id="rc-detect-companies"
            label={t("settings.extensions.detectCompaniesLabel")}
            description={t("settings.extensions.detectCompaniesDesc")}
            checked={rc.autoDetectCompanies}
            onChange={(v) => setRecruiter("autoDetectCompanies", v)}
            pro
          />
          <ToggleRow
            id="rc-auto-score"
            label={t("settings.extensions.recruiterAutoScoreLabel")}
            description={t("settings.extensions.recruiterAutoScoreDesc")}
            checked={rc.autoScore}
            onChange={(v) => setRecruiter("autoScore", v)}
            pro
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4" />
            {t("headings.aiCoach", "AI Coach")}
          </CardTitle>
          <CardDescription>
            {t(
              "messages.aiCoachDesc",
              "Controls how the AI coach (/chat) handles edits to your resume and profile.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ToggleRow
            id="ai-auto-apply"
            label={t("settings.ai.autoApplyLabel", "Auto-apply AI edits")}
            description={t(
              "settings.ai.autoApplyDesc",
              "When on, the coach saves resume and profile edits the moment you accept them in chat — no Apply button per change.",
            )}
            checked={ai.autoApplyChanges}
            onChange={(v) => setAi("autoApplyChanges", v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("headings.installExtensions")}</CardTitle>
          <CardDescription>
            {t("messages.installExtensionsDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <a
              href="https://chromewebstore.google.com/search/hired.video%20job%20seeker"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Chrome className="h-4 w-4 mr-2" />
              {t("labels.jobSeeker")}
              <ExternalLink className="h-3 w-3 ml-2" />
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a
              href="https://chromewebstore.google.com/search/hired.video%20recruiter"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Chrome className="h-4 w-4 mr-2" />
              {t("labels.recruiterExt")}
              <ExternalLink className="h-3 w-3 ml-2" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

interface ToggleRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  pro?: boolean;
}

function ToggleRow({ id, label, description, checked, onChange, pro }: ToggleRowProps) {
  const { t } = useTranslation();
  // Self-gated. Whether the row is locked for this user is a "Pro" check —
  // the hook is the single primitive (with built-in SA bypass), so the row
  // doesn't need its parent to compute and pass `isPro` down.
  const { isPro } = useSubscription();
  const locked = pro && !isPro;
  return (
    <div className={`flex items-center justify-between gap-4 ${locked ? "opacity-70" : ""}`}>
      <div className="space-y-0.5">
        <Label htmlFor={id} className="flex items-center gap-2">
          {label}
          {pro && (
            <Badge
              variant={isPro ? "default" : "secondary"}
              className="text-[10px] uppercase tracking-wider px-1.5 py-0"
            >
              {t("labels.proBadge")}
            </Badge>
          )}
        </Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={locked}
      />
    </div>
  );
}
