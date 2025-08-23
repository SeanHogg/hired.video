import { CheckCircle2, AlertTriangle, XCircle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { sentimentService, type SentimentInterpretation } from "@/lib/services/sentiment-service";

interface SentimentScoreDisplayProps {
  score: number;
  className?: string;
}

export default function SentimentScoreDisplay({ score, className = "" }: SentimentScoreDisplayProps) {
  const interpretation = sentimentService.interpretSentiment(score);
  
  const getIcon = () => {
    switch (interpretation.color) {
      case "red":
        return <XCircle className="h-6 w-6 text-red-600" />;
      case "yellow":
        return <AlertTriangle className="h-6 w-6 text-yellow-600" />;
      case "green":
        return <CheckCircle2 className="h-6 w-6 text-green-600" />;
      default:
        return <TrendingUp className="h-6 w-6 text-gray-600" />;
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
          Sentiment Analysis Results
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score Display */}
        <div className="text-center space-y-2">
          <div className="text-4xl font-bold text-primary">
            {score.toFixed(1)}
            <span className="text-lg text-muted-foreground">/100</span>
          </div>
          <Badge variant={getBadgeVariant()} className="text-sm">
            {interpretation.label} Sentiment
          </Badge>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Negative</span>
            <span>Neutral</span>
            <span>Positive</span>
          </div>
          <div className="relative">
            <Progress value={score} className="h-3" />
            <div 
              className={`absolute top-0 left-0 h-3 rounded-full transition-all duration-500 ${sentimentService.getProgressBarColor(score)}`}
              style={{ width: `${score}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0</span>
            <span>30</span>
            <span>60</span>
            <span>100</span>
          </div>
        </div>

        {/* Interpretation */}
        <div className={`p-4 rounded-lg border ${sentimentService.getScoreColorClass(score)}`}>
          <p className="text-sm font-medium mb-2">Analysis</p>
          <p className="text-sm">{interpretation.description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
