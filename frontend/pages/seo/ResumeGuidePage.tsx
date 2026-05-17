import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { FileText, CheckCircle2, XCircle, Lightbulb, DollarSign, ArrowRight, Loader2, Brain } from "lucide-react";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api-client";
import { aiCoachHref } from "@/lib/ai-context";

interface ResumeGuide {
  jobTitle: string;
  headline: string;
  introduction: string;
  keySkills: string[];
  resumeTips: string[];
  commonMistakes: string[];
  salaryRange: { min: number; max: number; currency: string; source: string };
  generatedAt: string;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function slugToTitle(slug: string) {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export default function ResumeGuidePage() {
  const { jobSlug } = useParams<{ jobSlug: string }>();
  const location = useLocation();
  const [guide, setGuide] = useState<ResumeGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const title = guide?.jobTitle ?? slugToTitle(jobSlug ?? "");

  useSEO(location.pathname);
  useBreadcrumbs([
    { name: "Resumes", url: "/resumes" },
    { name: `${title} Resume Guide`, url: `/resume-guide/${jobSlug ?? ""}` },
  ]);

  useEffect(() => {
    if (!jobSlug) return;
    setLoading(true);
    setError(false);
    apiClient
      .get(`/api/discovery/seo/resume-guide/${jobSlug}`, null as any)
      .then((res: any) => setGuide(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [jobSlug]);

  return (
    <AppShell bgClassName="bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12 sm:px-6 lg:px-8">

          {/* Breadcrumb */}
          <nav className="text-xs text-muted-foreground mb-6 flex items-center gap-1.5">
            <Link to="/" className="hover:text-foreground">Home</Link>
            <span>/</span>
            <Link to="/jobs" className="hover:text-foreground">Jobs</Link>
            <span>/</span>
            <span className="text-foreground">{title} Resume Guide</span>
          </nav>

          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-3xl font-bold">{title} Resume Guide</h1>
          </div>

          {loading && (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Guide unavailable for this role. <Link to="/resume-roast" className="text-primary underline">Roast your resume instead</Link>.</p>
              </CardContent>
            </Card>
          )}

          {guide && !loading && (
            <div className="space-y-8">
              <p className="text-lg text-muted-foreground leading-relaxed">{guide.introduction}</p>

              {/* Salary range */}
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-5 flex items-center gap-4">
                  <DollarSign className="w-8 h-8 text-primary flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Salary range</p>
                    <p className="text-2xl font-bold">{fmt(guide.salaryRange.min)} – {fmt(guide.salaryRange.max)}</p>
                    <p className="text-xs text-muted-foreground">{guide.salaryRange.source}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Key skills */}
              <div>
                <h2 className="text-xl font-semibold mb-4">Key skills to feature on your resume</h2>
                <div className="flex flex-wrap gap-2">
                  {guide.keySkills.map((skill) => (
                    <Badge key={skill} variant="secondary" className="text-sm py-1 px-3">{skill}</Badge>
                  ))}
                </div>
              </div>

              {/* Resume tips */}
              <div>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-primary" /> Resume tips for {title} roles
                </h2>
                <ul className="space-y-3">
                  {guide.resumeTips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-foreground">{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Common mistakes */}
              <div>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-destructive" /> Common mistakes to avoid
                </h2>
                <ul className="space-y-3">
                  {guide.commonMistakes.map((mistake, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <XCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-foreground">{mistake}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* CTA block */}
              <Card className="border-border bg-muted/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Brain className="w-5 h-5 text-primary" /> Get personalised help from your AI CHRO
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Upload your resume and let the AI CHRO give you line-by-line feedback tailored to {title} roles.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button asChild className="gap-2">
                      <Link to="/resume-roast">
                        <FileText className="w-4 h-4" /> Roast my resume free
                      </Link>
                    </Button>
                    <Button variant="outline" asChild className="gap-2">
                      <Link to={aiCoachHref(`Help me tailor my resume for a ${title} role`)}>
                        Ask AI CHRO <ArrowRight className="w-4 h-4" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <p className="text-xs text-muted-foreground">
                Last updated: {new Date(guide.generatedAt).toLocaleDateString()} · Data sourced from active job listings on hired.video
              </p>
            </div>
          )}
        </div>
    </AppShell>
  );
}
