import {
  Target,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  FileText,
  Briefcase,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import MarkdownDisplay from "./MarkdownDisplay";
import type { JobResumeMatchResponse } from "@/lib/services/match-service";
import { useAuth } from "@/lib/auth";

interface MatchResultsStepProps {
  matchResult: JobResumeMatchResponse;
  onStartOver: () => void;
  isLoading?: boolean;
}

export default function MatchResultsStep({
  matchResult,
  onStartOver,
  isLoading = false,
}: MatchResultsStepProps) {
  const { isAuthenticated } = useAuth();
  const { score, summaryRecommendations } = matchResult;

  // Determine score category and styling
  const getScoreCategory = (score: number) => {
    if (score >= 80)
      return {
        label: "Excellent Match",
        color: "bg-green-500",
        textColor: "text-green-700",
        bgColor: "bg-green-50",
      };
    if (score >= 60)
      return {
        label: "Good Match",
        color: "bg-blue-500",
        textColor: "text-blue-700",
        bgColor: "bg-blue-50",
      };
    if (score >= 40)
      return {
        label: "Fair Match",
        color: "bg-yellow-500",
        textColor: "text-yellow-700",
        bgColor: "bg-yellow-50",
      };
    return {
      label: "Needs Improvement",
      color: "bg-red-500",
      textColor: "text-red-700",
      bgColor: "bg-red-50",
    };
  };

  const scoreCategory = getScoreCategory(score);

  const getScoreIcon = (score: number) => {
    if (score >= 80) return <CheckCircle2 className="h-6 w-6 text-green-600" />;
    if (score >= 60) return <TrendingUp className="h-6 w-6 text-blue-600" />;
    if (score >= 40) return <Target className="h-6 w-6 text-yellow-600" />;
    return <AlertCircle className="h-6 w-6 text-red-600" />;
  };

  const getScoreMessage = (score: number) => {
    if (score >= 80)
      return "Your resume is an excellent match for this job! You have strong alignment with the requirements.";
    if (score >= 60)
      return "Your resume shows good compatibility with this job. There are several matching qualifications.";
    if (score >= 40)
      return "Your resume has some relevant qualifications, but there's room for improvement to better match this job.";
    return "Your resume needs significant improvements to align with this job's requirements.";
  };

  return (
    <div className="space-y-6">
      {/* Score Display */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Match Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Score Circle and Details */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div
                  className={`relative w-20 h-20 rounded-full ${scoreCategory.bgColor} flex items-center justify-center`}
                >
                  <div className="text-center">
                    <div
                      className={`text-2xl font-bold ${scoreCategory.textColor}`}
                    >
                      {Math.round(score)}
                    </div>
                    <div className={`text-xs ${scoreCategory.textColor}`}>
                      /100
                    </div>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {getScoreIcon(score)}
                    <Badge
                      variant="secondary"
                      className={scoreCategory.textColor}
                    >
                      {scoreCategory.label}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {getScoreMessage(score)}
                  </p>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Match Score</span>
                <span className="font-medium">{Math.round(score)}%</span>
              </div>
              <Progress value={score} className="h-2" />
            </div>

            {/* Score Breakdown */}
            <div className="grid grid-cols-4 gap-4 text-center">
              <div className="space-y-1">
                <div
                  className={`text-sm font-medium ${score >= 25 ? "text-green-600" : "text-muted-foreground"}`}
                >
                  Basic Match
                </div>
                <div
                  className={`w-full h-2 rounded ${score >= 25 ? "bg-green-200" : "bg-muted"}`}
                >
                  <div
                    className={`h-full rounded ${score >= 25 ? "bg-green-500" : "bg-muted-foreground"}`}
                    style={{ width: `${Math.min(100, (score / 25) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <div
                  className={`text-sm font-medium ${score >= 50 ? "text-blue-600" : "text-muted-foreground"}`}
                >
                  Skills Match
                </div>
                <div
                  className={`w-full h-2 rounded ${score >= 50 ? "bg-blue-200" : "bg-muted"}`}
                >
                  <div
                    className={`h-full rounded ${score >= 50 ? "bg-blue-500" : "bg-muted-foreground"}`}
                    style={{
                      width: `${Math.min(100, ((score - 25) / 25) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <div
                  className={`text-sm font-medium ${score >= 75 ? "text-purple-600" : "text-muted-foreground"}`}
                >
                  Experience
                </div>
                <div
                  className={`w-full h-2 rounded ${score >= 75 ? "bg-purple-200" : "bg-muted"}`}
                >
                  <div
                    className={`h-full rounded ${score >= 75 ? "bg-purple-500" : "bg-muted-foreground"}`}
                    style={{
                      width: `${Math.min(100, ((score - 50) / 25) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <div
                  className={`text-sm font-medium ${score >= 90 ? "text-orange-600" : "text-muted-foreground"}`}
                >
                  Perfect Fit
                </div>
                <div
                  className={`w-full h-2 rounded ${score >= 90 ? "bg-orange-200" : "bg-muted"}`}
                >
                  <div
                    className={`h-full rounded ${score >= 90 ? "bg-orange-500" : "bg-muted-foreground"}`}
                    style={{
                      width: `${Math.min(100, ((score - 75) / 25) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Analysis */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Detailed Analysis & Recommendations
        </h3>
        <MarkdownDisplay content={summaryRecommendations} />
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Button
          onClick={onStartOver}
          variant="outline"
          className="flex-1"
          disabled={isLoading}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Analyze Another Match
        </Button>

        {isAuthenticated && (
          <>
            <Link to="/resumes" className="flex-1">
              <Button variant="outline" className="w-full">
                <FileText className="mr-2 h-4 w-4" />
                View My Resumes
              </Button>
            </Link>
            <Link to="/jobs" className="flex-1">
              <Button variant="outline" className="w-full">
                <Briefcase className="mr-2 h-4 w-4" />
                Browse Jobs
              </Button>
            </Link>
          </>
        )}
      </div>

      {/* Tips Section */}
      <Card className="bg-muted/30">
        <CardContent className="p-6">
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <Target className="h-4 w-4" />
            Next Steps
          </h4>
          <div className="space-y-2 text-sm text-muted-foreground">
            {score >= 80 ? (
              <>
                <p>
                  • Your resume is well-aligned! Consider applying to this
                  position.
                </p>
                <p>
                  • Prepare for interviews by reviewing the job requirements in
                  detail.
                </p>
                <p>
                  • Customize your cover letter to highlight the matching
                  qualifications.
                </p>
              </>
            ) : score >= 60 ? (
              <>
                <p>
                  • Review the recommendations above to strengthen weak areas.
                </p>
                <p>
                  • Add relevant keywords and skills mentioned in the job
                  posting.
                </p>
                <p>
                  • Consider gaining additional experience in the highlighted
                  areas.
                </p>
              </>
            ) : (
              <>
                <p>
                  • Focus on the key recommendations to improve your match
                  score.
                </p>
                <p>
                  • Consider additional training or certifications in required
                  areas.
                </p>
                <p>
                  • Look for similar roles that better match your current
                  qualifications.
                </p>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
