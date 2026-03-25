import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { DollarSign, TrendingUp, MapPin, Briefcase, ArrowRight, Loader2 } from "lucide-react";
import { useSEO } from "@/lib/seo";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api-client";

interface SalaryData {
  jobTitle: string;
  currency: string;
  averageSalary: number | null;
  minSalary: number | null;
  maxSalary: number | null;
  sampleSize: number;
  lastUpdated: string;
}

function fmt(n: number | null) {
  if (!n) return "N/A";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function slugToTitle(slug: string) {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export default function SalaryPage() {
  const { jobSlug } = useParams<{ jobSlug: string }>();
  const location = useLocation();
  const [data, setData] = useState<SalaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const title = data?.jobTitle ?? slugToTitle(jobSlug ?? "");

  useSEO(location.pathname);

  useEffect(() => {
    if (!jobSlug) return;
    setLoading(true);
    setError(false);
    apiClient
      .get(`/api/discovery/seo/salary/${jobSlug}`, null as any)
      .then((res: any) => setData(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [jobSlug]);

  return (
    <div className="min-h-screen bg-background">
      <Navigation onMenuClick={() => {}} onSidebarToggle={() => {}} sidebarCollapsed={true} />

      <div className="pt-16">
        <div className="max-w-3xl mx-auto px-4 py-12 sm:px-6 lg:px-8">

          {/* Breadcrumb */}
          <nav className="text-xs text-muted-foreground mb-6 flex items-center gap-1.5">
            <Link to="/" className="hover:text-foreground">Home</Link>
            <span>/</span>
            <Link to="/jobs" className="hover:text-foreground">Jobs</Link>
            <span>/</span>
            <span className="text-foreground">{title} Salary</span>
          </nav>

          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-3xl font-bold">{title} Salary Guide</h1>
          </div>
          <p className="text-muted-foreground mb-8">
            Real salary data from active job listings on hired.video. Updated regularly.
          </p>

          {loading && (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Salary data unavailable for this role right now. <Link to="/jobs" className="text-primary underline">Browse jobs instead</Link>.</p>
              </CardContent>
            </Card>
          )}

          {data && !loading && (
            <div className="space-y-6">
              {/* Main salary card */}
              <Card className="border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base text-muted-foreground font-normal">
                    <TrendingUp className="w-4 h-4" /> Average annual salary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-5xl font-black text-foreground">{fmt(data.averageSalary)}</p>
                  <p className="text-sm text-muted-foreground mt-1">Based on {data.sampleSize} listings · Last updated {new Date(data.lastUpdated).toLocaleDateString()}</p>
                </CardContent>
              </Card>

              {/* Range */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-5">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Entry level</p>
                    <p className="text-2xl font-bold">{fmt(data.minSalary)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Senior level</p>
                    <p className="text-2xl font-bold">{fmt(data.maxSalary)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* FAQ-style content for SEO */}
              <div className="prose prose-sm max-w-none text-foreground space-y-5 pt-4 border-t border-border">
                <h2 className="text-lg font-semibold">How much does a {title} make?</h2>
                <p>
                  The average {title} salary is <strong>{fmt(data.averageSalary)}</strong> per year in the United States,
                  ranging from {fmt(data.minSalary)} at the entry level to {fmt(data.maxSalary)} for senior roles.
                  Compensation varies based on years of experience, company size, industry, and location.
                </p>

                <h2 className="text-lg font-semibold">What factors affect {title} salaries?</h2>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li><strong>Experience:</strong> Senior professionals typically earn 40–60% more than entry-level.</li>
                  <li><strong>Location:</strong> Tech hubs (San Francisco, New York, Seattle) pay 20–40% above national average.</li>
                  <li><strong>Industry:</strong> Finance and tech companies generally offer higher total compensation.</li>
                  <li><strong>Company size:</strong> Enterprise roles often include equity, bonuses, and better benefits.</li>
                </ul>

                <h2 className="text-lg font-semibold">How to negotiate your {title} salary</h2>
                <p>
                  Use this data as your baseline. Research the specific company's pay band using Levels.fyi or Glassdoor,
                  then anchor 10–15% above your target. Ask your AI CHRO for a personalized negotiation script.
                </p>
              </div>

              {/* CTA */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button asChild className="gap-2">
                  <Link to={`/jobs?q=${encodeURIComponent(title)}`}>
                    <Briefcase className="w-4 h-4" /> Browse {title} Jobs
                  </Link>
                </Button>
                <Button variant="outline" asChild className="gap-2">
                  <Link to={`/ai-coach?q=${encodeURIComponent(`Help me negotiate my salary as a ${title}`)}`}>
                    Ask AI CHRO <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
