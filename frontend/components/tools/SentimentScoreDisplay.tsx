import { CheckCircle2, AlertTriangle, XCircle, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { sentimentService } from "@/lib/services/sentiment-service";

interface SentimentScoreDisplayProps {
  score: number;
  className?: string;
}

/** Token-based styling + i18n keys per interpretation polarity. */
const POLARITY: Record<
  string,
  { labelKey: string; descriptionKey: string; panelClass: string; barClass: string }
> = {
  red: {
    labelKey: "toolSteps.sentiment.negative",
    descriptionKey: "toolSteps.sentiment.negativeDescription",
    panelClass: "text-destructive bg-destructive/10 border-destructive/30",
    barClass: "bg-destructive",
  },
  yellow: {
    labelKey: "toolSteps.sentiment.neutral",
    descriptionKey: "toolSteps.sentiment.neutralDescription",
    panelClass: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30",
    barClass: "bg-amber-500",
  },
  green: {
    labelKey: "toolSteps.sentiment.positive",
    descriptionKey: "toolSteps.sentiment.positiveDescription",
    panelClass: "text-brand-green-text bg-brand-green/10 border-brand-green/30",
    barClass: "bg-brand-green",
  },
};

export default function SentimentScoreDisplay({
  score,
  className = "",
}: SentimentScoreDisplayProps) {
  const { t } = useTranslation();
  const interpretation = sentimentService.interpretSentiment(score);
  const polarity = POLARITY[interpretation.color];

  const getIcon = () => {
    switch (interpretation.color) {
      case "red":
        return <XCircle className="h-6 w-6 text-destructive" aria-hidden="true" />;
      case "yellow":
        return <AlertTriangle className="h-6 w-6 text-amber-600" aria-hidden="true" />;
      case "green":
        return <CheckCircle2 className="h-6 w-6 text-brand-green-text" aria-hidden="true" />;
      default:
        return <TrendingUp className="h-6 w-6 text-muted-foreground" aria-hidden="true" />;
    }
  };

  const getBadgeVariant = () => {
    switch (interpretation.color) {
      case "red":
        return "destructive";
      case "yellow":
        return "secondary";
      case "green":
        return "default";
      default:
        return "outline";
    }
  };

  return (
    <Card className={`${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          {getIcon()}
          {t("toolSteps.sentiment.resultsTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score Display */}
        <div className="text-center space-y-2">
          <div className="font-display text-5xl font-bold tracking-tight text-primary">
            {score.toFixed(1)}
            <span className="text-lg text-muted-foreground">
              {t("toolSteps.match.outOf100")}
            </span>
          </div>
          <Badge variant={getBadgeVariant()} className="text-sm">
            {t("toolSteps.sentiment.badge", {
              label: polarity ? t(polarity.labelKey) : interpretation.label,
            })}
          </Badge>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{t("toolSteps.sentiment.negative")}</span>
            <span>{t("toolSteps.sentiment.neutral")}</span>
            <span>{t("toolSteps.sentiment.positive")}</span>
          </div>
          <div className="relative">
            <Progress value={score} className="h-3" />
            <div
              className={`absolute top-0 left-0 h-3 rounded-full transition-all duration-500 ${polarity?.barClass ?? "bg-muted-foreground"}`}
              style={{ width: `${score}%` }}
            />
          </div>
          <div className="flex justify-between font-mono text-xs text-muted-foreground">
            <span>0</span>
            <span>30</span>
            <span>60</span>
            <span>100</span>
          </div>
        </div>

        {/* Interpretation */}
        <div
          className={`p-4 rounded-xl border ${polarity?.panelClass ?? "bg-muted border-border text-foreground"}`}
        >
          <p className="text-sm font-medium mb-2">
            {t("tools.card.sentiment-analysis.stat.0.label")}
          </p>
          <p className="text-sm">
            {polarity ? t(polarity.descriptionKey) : interpretation.description}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
