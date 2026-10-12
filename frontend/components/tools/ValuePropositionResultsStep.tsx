import {
  ArrowLeft,
  RefreshCw,
  Copy,
  Download,
  CheckCircle2,
  Star,
  Target,
  TrendingUp,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import MarkdownDisplay from "./MarkdownDisplay";
import type { ValuePropositionResponse } from "@/lib/services/value-proposition-service";

interface ValuePropositionResultsStepProps {
  valuePropositionResult: ValuePropositionResponse;
  onStartOver: () => void;
  onBack: () => void;
  isLoading?: boolean;
}

export default function ValuePropositionResultsStep({
  valuePropositionResult,
  onStartOver,
  onBack,
  isLoading = false,
}: ValuePropositionResultsStepProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(
        valuePropositionResult.valueProposition,
      );
      toast({
        title: t("partnerAccess.copiedToast"),
        description: t("toolSteps.vp.copiedDescription"),
      });
    } catch (_err) {
      toast({
        title: t("errors.copyFailed"),
        description: t("toolSteps.vp.copyManually"),
        variant: "destructive",
      });
    }
  };

  const handleDownload = () => {
    const element = document.createElement("a");
    const file = new Blob([valuePropositionResult.valueProposition], {
      type: "text/plain",
    });
    element.href = URL.createObjectURL(file);
    element.download = "value-proposition.txt";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-brand-green-text";
    if (score >= 60) return "text-amber-600";
    return "text-destructive";
  };

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 80) return "default";
    if (score >= 60) return "secondary";
    return "destructive";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-brand-green-text" aria-hidden="true" />
            {t("headings.valueProposition")}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("toolSteps.vp.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11" onClick={onBack} disabled={isLoading}>
            <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
            {t("actions.back")}
          </Button>
          <Button variant="outline" className="min-h-11" onClick={onStartOver} disabled={isLoading}>
            <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
            {t("toolSteps.vp.startOver")}
          </Button>
        </div>
      </div>

      {/* Confidence Score */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" aria-hidden="true" />
              {t("toolSteps.vp.confidenceScore")}
            </span>
            <Badge
              variant={getScoreBadgeVariant(
                valuePropositionResult.confidenceScore,
              )}
              className="font-mono"
            >
              {t("toolSteps.vp.scoreOutOf100", { score: valuePropositionResult.confidenceScore })}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Progress
              value={valuePropositionResult.confidenceScore}
              className="h-2"
            />
            <p
              className={`text-sm font-medium ${getScoreColor(valuePropositionResult.confidenceScore)}`}
            >
              {valuePropositionResult.confidenceScore >= 80 &&
                t("toolSteps.vp.alignment.excellent")}
              {valuePropositionResult.confidenceScore >= 60 &&
                valuePropositionResult.confidenceScore < 80 &&
                t("toolSteps.vp.alignment.good")}
              {valuePropositionResult.confidenceScore < 60 &&
                t("toolSteps.vp.alignment.moderate")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Executive Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-primary" aria-hidden="true" />
            {t("toolSteps.vp.executiveSummary")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">
            {valuePropositionResult.executiveSummary}
          </p>
        </CardContent>
      </Card>

      {/* Key Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Key Strengths */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-primary" aria-hidden="true" />
              {t("toolSteps.vp.keyStrengths")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {valuePropositionResult.keyStrengths.map((strength, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-brand-green-text mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <span>{strength}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Alignment Points */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-primary" aria-hidden="true" />
              {t("toolSteps.vp.alignmentPoints")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {valuePropositionResult.alignmentPoints.map((point, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Full Value Proposition */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{t("toolSteps.vp.fullLetter")}</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={handleCopyToClipboard}
              >
                <Copy className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("actions.copy")}
              </Button>
              <Button variant="outline" size="sm" className="min-h-11" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("actions.download")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-muted p-4 rounded-xl">
            <MarkdownDisplay
              content={valuePropositionResult.valueProposition}
            />
          </div>
        </CardContent>
      </Card>

      {/* Call to Action */}
      {valuePropositionResult.callToAction && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />
              {t("toolSteps.vp.recommendedNextSteps")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">
              {valuePropositionResult.callToAction}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 justify-center pt-4">
        <Button onClick={onStartOver} variant="outline" className="min-h-11">
          <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
          {t("toolSteps.vp.generateAnother")}
        </Button>
        <Button onClick={handleCopyToClipboard} className="min-h-11">
          <Copy className="h-4 w-4 mr-2" aria-hidden="true" />
          {t("toolSteps.vp.copyValueProposition")}
        </Button>
      </div>
    </div>
  );
}
