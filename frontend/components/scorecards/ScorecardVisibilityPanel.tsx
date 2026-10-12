// ScorecardVisibilityPanel — hiring-manager scorecard visibility config (#241).
// One panel drives BOTH scopes (a company-wide default and a per-job
// override) since the control is identical; only the load/save endpoint and
// the "inherit" affordance differ. The per-job scope adds an "Inherit company
// default" option (sends null to clear the override).

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  scorecardsService,
  SCORECARD_HM_VISIBILITY_MODES,
  type ScorecardHmVisibility,
} from "@/lib/services/scorecards-service";

const INHERIT = "__inherit__";

interface Props {
  scope: "job" | "company";
  /** jobId for scope="job", companyId for scope="company". */
  id: string;
}

export default function ScorecardVisibilityPanel({ scope, id }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // `value` is the select state: a mode, or INHERIT (job scope only).
  const [value, setValue] = useState<string>("");
  const [companyDefault, setCompanyDefault] = useState<ScorecardHmVisibility>("always_show_hm");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        if (scope === "company") {
          const r = await scorecardsService.getCompanyScorecardVisibility(id);
          if (!cancelled) setValue(r.default);
        } else {
          const r = await scorecardsService.getJobScorecardVisibility(id);
          if (!cancelled) {
            setCompanyDefault(r.companyDefault);
            setValue(r.override ?? INHERIT);
          }
        }
      } catch {
        if (!cancelled) toast({ title: t("scorecardVisibility.loadFailed"), variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, id, t, toast]);

  const modeLabel = (m: ScorecardHmVisibility) => t(`scorecardVisibility.mode.${m}`);

  const save = async () => {
    setSaving(true);
    try {
      if (scope === "company") {
        await scorecardsService.setCompanyScorecardVisibility(id, value as ScorecardHmVisibility);
      } else {
        await scorecardsService.setJobScorecardVisibility(
          id,
          value === INHERIT ? null : (value as ScorecardHmVisibility),
        );
      }
      toast({ title: t("scorecardVisibility.saved") });
    } catch (e) {
      toast({ title: t("scorecardVisibility.saveFailed"), description: (e as Error)?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const currentMode: ScorecardHmVisibility =
    value === INHERIT || value === "" ? companyDefault : (value as ScorecardHmVisibility);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("scorecardVisibility.title")}</CardTitle>
        <CardDescription>
          {scope === "company"
            ? t("scorecardVisibility.companyDesc")
            : t("scorecardVisibility.jobDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("status.loading")}
          </div>
        ) : (
          <>
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger className="max-w-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scope === "job" && (
                  <SelectItem value={INHERIT}>
                    {t("scorecardVisibility.inherit", { mode: modeLabel(companyDefault) })}
                  </SelectItem>
                )}
                {SCORECARD_HM_VISIBILITY_MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {modeLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground max-w-md">
              {t(`scorecardVisibility.help.${currentMode}`)}
            </p>
            <Button size="sm" onClick={save} disabled={saving || value === ""}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {t("actions.save")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
