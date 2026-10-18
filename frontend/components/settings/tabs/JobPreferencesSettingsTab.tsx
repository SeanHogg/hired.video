import { useEffect, useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { JobPreferences, JobPreferencesPatch } from "@/lib/services/settings-service";
import type { useOpenToWorkToggle } from "@/lib/hooks/use-open-to-work";
import { SALARY_CURRENCIES, splitCommaList } from "@/components/settings/settings-tabs";

type CommaListField = "preferredRoles" | "industries";
type SalaryField = "minSalaryExpectation" | "maxSalaryExpectation";

interface JobPreferencesSettingsTabProps {
  jobPrefs: JobPreferences | null;
  saving: boolean;
  onSavePatch: (patch: JobPreferencesPatch) => void;
  openToWorkToggle: ReturnType<typeof useOpenToWorkToggle>;
}

/** Text input that edits a local draft and commits on blur / Enter, so a
 *  comma list or a salary isn't saved (and re-parsed) on every keystroke. */
function CommitOnBlurInput({
  value,
  onCommit,
  ...rest
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "onBlur"> & {
  value: string;
  onCommit: (draft: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <Input
      {...rest}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}

export function JobPreferencesSettingsTab({
  jobPrefs,
  saving,
  onSavePatch,
  openToWorkToggle,
}: JobPreferencesSettingsTabProps) {
  const { t } = useTranslation();

  const renderCommaInput = (prefs: JobPreferences, field: CommaListField, i18nBase: string) => (
    <CommitOnBlurInput
      value={prefs[field].join(", ")}
      placeholder={t(`${i18nBase}.placeholder`)}
      onCommit={(draft) => {
        const patch: JobPreferencesPatch = {};
        patch[field] = splitCommaList(draft);
        onSavePatch(patch);
      }}
      disabled={saving}
    />
  );

  const renderSalaryField = (prefs: JobPreferences, field: SalaryField, i18nKey: string) => (
    <div className="space-y-2">
      <Label>{t(i18nKey)}</Label>
      <CommitOnBlurInput
        type="number"
        min={0}
        inputMode="numeric"
        value={prefs[field] == null ? "" : String(prefs[field])}
        onCommit={(draft) => {
          const patch: JobPreferencesPatch = {};
          patch[field] = draft ? Number(draft) : null;
          onSavePatch(patch);
        }}
        disabled={saving}
      />
    </div>
  );

  // Keep a currency set from the profile selectable even if it isn't one
  // of the quick-pick codes.
  const currencyOptions = jobPrefs && !SALARY_CURRENCIES.some((c) => c === jobPrefs.salaryCurrency)
    ? [...SALARY_CURRENCIES, jobPrefs.salaryCurrency]
    : [...SALARY_CURRENCIES];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("headings.jobPreferences")}</CardTitle>
        <CardDescription>
          {t("messages.jobPreferencesDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!jobPrefs ? (
          <p className="text-sm text-muted-foreground">{t("status.loadingJobPreferences")}</p>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("fields.preferredRoles.label")}</Label>
                {renderCommaInput(jobPrefs, "preferredRoles", "fields.preferredRoles")}
                <p className="text-xs text-muted-foreground">{t("messages.separateWithCommas")}</p>
              </div>
              <div className="space-y-2">
                <Label>{t("fields.preferredIndustries.label")}</Label>
                {renderCommaInput(jobPrefs, "industries", "fields.preferredIndustries")}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {renderSalaryField(jobPrefs, "minSalaryExpectation", "fields.minSalary.label")}
              {renderSalaryField(jobPrefs, "maxSalaryExpectation", "fields.maxSalary.label")}
              <div className="space-y-2">
                <Label>{t("fields.currency.label")}</Label>
                <Select
                  value={jobPrefs.salaryCurrency}
                  onValueChange={(v) => onSavePatch({ salaryCurrency: v })}
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencyOptions.map((currency) => (
                      <SelectItem key={currency} value={currency}>{currency}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md border border-brand-green/30 bg-brand-green/10 p-3">
              <div>
                <Label>{t("settings.jobPreferences.openToWorkLabel")}</Label>
                <p className="text-xs text-muted-foreground">{t("settings.jobPreferences.openToWorkDesc")}</p>
              </div>
              <Switch
                checked={openToWorkToggle.openToWork}
                onCheckedChange={(checked) => openToWorkToggle.setOpenToWork(checked)}
                disabled={openToWorkToggle.busy}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>{t("settings.jobPreferences.remoteOnlyLabel")}</Label>
                <p className="text-xs text-muted-foreground">{t("settings.jobPreferences.remoteOnlyDesc")}</p>
              </div>
              <Switch
                checked={jobPrefs.remoteOnly}
                onCheckedChange={(checked) => onSavePatch({ remoteOnly: checked })}
                disabled={saving}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
