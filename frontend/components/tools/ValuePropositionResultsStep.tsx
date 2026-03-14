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
  const { toast } = useToast();

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(
        valuePropositionResult.valueProposition,
      );
      toast({
        title: "Copied to clipboard",
        description: "Value proposition has been copied to your clipboard.",
      });
    } catch (_err) {
      toast({
        title: "Failed to copy",
        description: "Please select and copy the text manually.",
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
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 80) return "default";
    if (score >= 60) return "secondary";
    return "destructive";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Your Value Proposition
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            AI-generated value proposition tailored to your background and the
            role
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} disabled={isLoading}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button variant="outline" onClick={onStartOver} disabled={isLoading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Start Over
          </Button>
        </div>
      </div>

      {/* Confidence Score */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Confidence Score
            </span>
            <Badge
              variant={getScoreBadgeVariant(
                valuePropositionResult.confidenceScore,
              )}
            >
              {valuePropositionResult.confidenceScore}/100
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
                "Excellent alignment with the role requirements"}
              {valuePropositionResult.confidenceScore >= 60 &&
                valuePropositionResult.confidenceScore < 80 &&
                "Good alignment with some areas for improvement"}
              {valuePropositionResult.confidenceScore < 60 &&
                "Moderate alignment - consider highlighting additional relevant experience"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Executive Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            Executive Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">
            {valuePropositionResult.executiveSummary}
          </p>
        </CardContent>
      </Card>

      {/* Key Insights */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Key Strengths */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5" />
              Key Strengths
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {valuePropositionResult.keyStrengths.map((strength, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
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
              <Target className="h-5 w-5" />
              Alignment Points
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {valuePropositionResult.alignmentPoints.map((point, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
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
          <div className="flex items-center justify-between">
            <CardTitle>Complete Value Proposition Letter</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyToClipboard}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 p-4 rounded-lg">
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
              <CheckCircle2 className="h-5 w-5" />
              Recommended Next Steps
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
      <div className="flex gap-3 justify-center pt-4">
        <Button onClick={onStartOver} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Generate Another
        </Button>
        <Button onClick={handleCopyToClipboard}>
          <Copy className="h-4 w-4 mr-2" />
          Copy Value Proposition
        </Button>
      </div>
    </div>
  );
}
