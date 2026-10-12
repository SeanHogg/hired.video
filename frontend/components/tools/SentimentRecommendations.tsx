import { Lightbulb, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sentimentService } from "@/lib/services/sentiment-service";

interface SentimentRecommendationsProps {
  score: number;
  className?: string;
}

export default function SentimentRecommendations({
  score,
  className = "",
}: SentimentRecommendationsProps) {
  const interpretation = sentimentService.interpretSentiment(score);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Lightbulb className="h-5 w-5 text-amber-500" />
          Recommendations
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {interpretation.recommendations.map((recommendation, index) => (
            <div key={index} className="flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 text-brand-green-text mt-0.5 flex-shrink-0" />
              <p className="text-sm text-muted-foreground leading-relaxed">
                {recommendation}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
