import { useState } from "react";
import { ArrowLeft, Building2, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CompanyData {
  name?: string;
  mission?: string;
  values?: string;
}

interface CompanyInfoStepProps {
  onCompanyInfoSubmitted: (data: CompanyData) => void;
  isLoading?: boolean;
  onBack: () => void;
}

export default function CompanyInfoStep({
  onCompanyInfoSubmitted,
  isLoading = false,
  onBack,
}: CompanyInfoStepProps) {
  const { t } = useTranslation();
  const [companyName, setCompanyName] = useState("");
  const [companyMission, setCompanyMission] = useState("");
  const [companyValues, setCompanyValues] = useState("");

  const handleSubmit = () => {
    // Company info is optional, but at least company name is recommended
    onCompanyInfoSubmitted({
      name: companyName.trim() || undefined,
      mission: companyMission.trim() || undefined,
      values: companyValues.trim() || undefined,
    });
  };

  const handleSkip = () => {
    onCompanyInfoSubmitted({});
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </span>
            {t("headings.onboarding.employerCompanyTitle")}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("toolSteps.company.subtitle")}
          </p>
        </div>
        <Button variant="outline" className="min-h-11" onClick={onBack} disabled={isLoading}>
          <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
          {t("actions.back")}
        </Button>
      </div>

      <Alert>
        <Building2 className="h-4 w-4" aria-hidden="true" />
        <AlertDescription>{t("toolSteps.company.hint")}</AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("headings.companyDetail.companyDetails")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">{t("fields.companyName.label")}</Label>
            <Input
              id="companyName"
              placeholder={t("toolSteps.company.namePlaceholder")}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">{t("toolSteps.company.nameHelp")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyMission">{t("toolSteps.company.missionLabel")}</Label>
            <Textarea
              id="companyMission"
              placeholder={t("toolSteps.company.missionPlaceholder")}
              value={companyMission}
              onChange={(e) => setCompanyMission(e.target.value)}
              disabled={isLoading}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">{t("toolSteps.company.missionHelp")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyValues">{t("toolSteps.company.valuesLabel")}</Label>
            <Textarea
              id="companyValues"
              placeholder={t("toolSteps.company.valuesPlaceholder")}
              value={companyValues}
              onChange={(e) => setCompanyValues(e.target.value)}
              disabled={isLoading}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">{t("toolSteps.company.valuesHelp")}</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3 justify-end">
        <Button variant="outline" className="min-h-11" onClick={handleSkip} disabled={isLoading}>
          {t("toolSteps.company.skip")}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isLoading}
          size="lg"
          className="min-w-[140px]"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              {t("status.generating")}
            </>
          ) : (
            t("toolSteps.company.generate")
          )}
        </Button>
      </div>
    </div>
  );
}
