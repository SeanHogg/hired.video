import { Flame, TrendingUp, AlertCircle, Wrench, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import ApplyRewriteCard from "@/components/tools/ApplyRewriteCard";

export interface RoastResult {
  score: number;
  strengths: string[];
  weaknesses: string[];
  roast: string;
  fixes: string[];
  improvedExamples: { original: string; improved: string }[];
}

interface RoastResultProps {
  result: RoastResult;
  /** When set, the rewritten-examples section shows Apply/Reject controls
   *  that write the improvement back into the saved resume. Omit (or pass
   *  undefined) when the input came from a paste/upload — `ApplyRewriteCard`
   *  self-gates and hides its controls. */
  resumeId?: string;
}

function scoreColor(score: number): string {
  if (score >= 8) return "text-green-500";
  if (score >= 6) return "text-yellow-500";
  if (score >= 4) return "text-orange-500";
  return "text-red-500";
}

function scoreLabel(score: number): string {
  if (score >= 8) return "Strong";
  if (score >= 6) return "Good";
  if (score >= 4) return "Needs Work";
  return "Critical Issues";
}

export default function RoastResultView({ result, resumeId }: RoastResultProps) {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Score Hero */}
      <Card className="border-2">
        <CardContent className="pt-6">
          <div className="flex items-center gap-6">
            <div className="text-center flex-shrink-0">
              <p className={`text-6xl font-black tabular-nums ${scoreColor(result.score)}`}>
                {result.score.toFixed(1)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">/ 10</p>
              <Badge
                variant="outline"
                className={`mt-2 font-semibold border-current ${scoreColor(result.score)}`}
              >
                {scoreLabel(result.score)}
              </Badge>
            </div>
            <div className="flex-1">
              <Progress value={result.score * 10} className="h-3 mb-3" />
              <p className="text-sm text-muted-foreground italic leading-relaxed">
                "{result.roast}"
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Strengths & Weaknesses */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-green-600">
              <TrendingUp className="w-4 h-4" /> Strengths
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {result.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-orange-600">
              <AlertCircle className="w-4 h-4" /> Weaknesses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {result.weaknesses.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-orange-500 mt-0.5">✗</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Fixes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wrench className="w-4 h-4" /> How to Fix It
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2">
            {result.fixes.map((fix, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">
                  {i + 1}
                </span>
                <span>{fix}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* Improved Examples */}
      {result.improvedExamples.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" /> Rewritten Examples
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {result.improvedExamples.map((ex, i) => (
              <ApplyRewriteCard
                key={i}
                original={ex.original}
                improved={ex.improved}
                resumeId={resumeId}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* CTA */}
      <div className="text-center py-4 border-t">
        <p className="text-muted-foreground text-sm mb-3">Ready to stand out? Turn your resume into a video.</p>
        <Button size="lg" onClick={() => navigate("/studio")} className="gap-2">
          Create Video Resume <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
