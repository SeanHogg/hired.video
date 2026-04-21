import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
        <CardTitle className="text-green-700">Open to Opportunities</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasTypes && (
          <div>
            <h4 className="font-medium text-sm mb-2">Opportunity Types</h4>
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
            <h4 className="font-medium text-sm mb-2">Preferred Roles</h4>
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
            <h4 className="font-medium text-sm mb-2">Salary Expectation</h4>
            <p className="text-xs text-muted-foreground">
              {salaryExpectation.min != null && salaryExpectation.max != null
                ? `$${(salaryExpectation.min / 1000).toFixed(0)}k - $${(salaryExpectation.max / 1000).toFixed(0)}k${
                    salaryExpectation.currency ? ` ${salaryExpectation.currency}` : ""
                  }`
                : "Negotiable"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
