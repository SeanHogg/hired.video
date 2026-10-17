/**
 * Salary Calculator result cards — estimate, breakdown, adjustments,
 * industry comparison and the reset / copy-report actions.
 */
import { useTranslation } from "react-i18next";
import { DollarSign, TrendingUp, MapPin, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatSalary, type SalaryData } from "./salary-data";

export function SalaryResults({
  salaryData,
  jobTitle,
  location,
  onReset,
}: {
  salaryData: SalaryData;
  jobTitle: string;
  location: string;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {/* Main Salary Display */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {t("headings.aiSalaryAnalysis")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center p-6 rounded-lg mb-4 bg-accent/50">
            <div className="text-4xl font-bold text-brand-green mb-2">
              {formatSalary(salaryData.baseSalary)}
            </div>
            <p className="text-sm text-muted-foreground">
              {t("labels.estimatedAnnualSalary")}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="font-semibold">
                {formatSalary(salaryData.lowRange)}
              </div>
              <div className="text-muted-foreground">
                {t("labels.lowRange")}
              </div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="font-semibold">
                {formatSalary(salaryData.highRange)}
              </div>
              <div className="text-muted-foreground">
                {t("labels.highRange")}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            {t("headings.salaryBreakdown")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <span>{t("labels.marketAverage")}</span>
            <span className="font-semibold">
              {formatSalary(salaryData.marketAverage)}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span>{t("labels.percentile25")}</span>
            <span className="font-semibold">
              {formatSalary(salaryData.percentile25)}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span>{t("labels.percentile75")}</span>
            <span className="font-semibold">
              {formatSalary(salaryData.percentile75)}
            </span>
          </div>

          <div className="flex justify-between items-center border-t pt-3">
            <span>{t("labels.totalCompensation")}</span>
            <span className="font-semibold text-brand-green">
              {formatSalary(salaryData.totalCompensation)}
            </span>
          </div>

          <div className="text-xs text-muted-foreground">
            {t("messages.totalCompensationNote")}
          </div>
        </CardContent>
      </Card>

      {/* Adjustments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            {t("headings.salaryAdjustments")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {t("labels.locationAdjustment")}
            </span>
            <Badge
              variant={
                salaryData.locationAdjustment >= 0
                  ? "default"
                  : "secondary"
              }
            >
              {salaryData.locationAdjustment >= 0 ? "+" : ""}
              {salaryData.locationAdjustment}%
            </Badge>
          </div>

          <div className="flex justify-between items-center">
            <span className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              {t("labels.experienceAdjustment")}
            </span>
            <Badge variant="default">
              +{salaryData.experienceAdjustment}%
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Industry Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            {t("headings.industryComparison")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {salaryData.industryComparison.map((comp, index) => (
            <div
              key={index}
              className="flex justify-between items-center"
            >
              <span>{comp.industry}</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  {formatSalary(comp.averageSalary)}
                </span>
                <Badge
                  variant={
                    comp.difference >= 0 ? "default" : "secondary"
                  }
                  className={
                    comp.difference >= 0
                      ? "bg-brand-green/15 text-brand-green-text"
                      : "bg-destructive/10 text-destructive"
                  }
                >
                  {comp.difference >= 0 ? "+" : ""}
                  {comp.difference}%
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onReset}>
          {t("actions.calculateAnother")}
        </Button>
        <Button
          onClick={async () => {
            const report = t("messages.salary.reportBody", {
              jobTitle,
              location,
              estimated: formatSalary(salaryData.baseSalary),
              low: formatSalary(salaryData.lowRange),
              high: formatSalary(salaryData.highRange),
              total: formatSalary(salaryData.totalCompensation),
            });
            try {
              await navigator.clipboard.writeText(report);
              toast.success(t("messages.salary.reportCopied"));
            } catch {
              toast.error(t("errors.couldNotCopyToClipboard"));
            }
          }}
          variant="outline"
        >
          {t("actions.copyReport")}
        </Button>
      </div>
    </>
  );
}
