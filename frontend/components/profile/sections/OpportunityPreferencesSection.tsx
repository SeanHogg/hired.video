import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProfileSectionVisibility } from "./profile-sections-context";

interface SalaryExpectation {
  min?: number;
  max?: number;
  currency?: string;
}

interface OpportunityPreferencesSectionProps {
  openToWork: boolean;
  opportunityTypes?: string[];
  preferredRoles?: string[];
  salaryExpectation?: SalaryExpectation | null;
}

export default function OpportunityPreferencesSection({
  openToWork,
  opportunityTypes = [],
  preferredRoles = [],
  salaryExpectation,
}: OpportunityPreferencesSectionProps) {
  const { t } = useTranslation();
  const sectionVisible = useProfileSectionVisibility("opportunityPreferences");
  if (!sectionVisible) return null;
  if (!openToWork) return null;

  const hasTypes = opportunityTypes.length > 0;
  const hasRoles = preferredRoles.length > 0;
  const hasSalary =
    !!salaryExpectation &&
    (salaryExpectation.min != null || salaryExpectation.max != null);

  if (!hasTypes && !hasRoles && !hasSalary) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-green-700">{t("headings.openToOpportunities")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasTypes && (
          <div>
            <h4 className="font-medium text-sm mb-2">{t("headings.opportunityTypes")}</h4>
            <div className="flex flex-wrap gap-1">
              {opportunityTypes.map((type, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className="text-xs capitalize"
                >
                  {type.replace("-", " ")}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {hasRoles && (
          <div>
            <h4 className="font-medium text-sm mb-2">{t("headings.preferredRoles")}</h4>
            <div className="space-y-1">
              {preferredRoles.map((role, index) => (
                <div key={index} className="text-xs text-muted-foreground">
                  • {role}
                </div>
              ))}
            </div>
          </div>
        )}

        {hasSalary && salaryExpectation && (
          <div>
            <h4 className="font-medium text-sm mb-2">{t("headings.salaryExpectation")}</h4>
            <p className="text-xs text-muted-foreground">
              {salaryExpectation.min != null && salaryExpectation.max != null
                ? t("labels.salaryRange", {
                    min: (salaryExpectation.min / 1000).toFixed(0),
                    max: (salaryExpectation.max / 1000).toFixed(0),
                    currency: salaryExpectation.currency ? ` ${salaryExpectation.currency}` : "",
                  })
                : t("labels.salaryNegotiable")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
