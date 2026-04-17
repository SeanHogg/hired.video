import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Briefcase, Sparkles, CheckCircle2, ArrowRight, Zap,
  Users, BarChart3, Brain, Building2, Loader2,
} from "lucide-react";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { apiClient } from "@/lib/api-client";
import { gtmEvent } from "@/lib/gtm";
import { useAuth } from "@/lib/auth";

const PERKS = [
  { icon: Sparkles, text: "AI writes the job description for you" },
  { icon: Users, text: "Reach thousands of active job seekers" },
  { icon: Brain, text: "AI CHRO screens and ranks applicants" },
  { icon: BarChart3, text: "See analytics: views, applies, match scores" },
  { icon: Zap, text: "Go live in under 2 minutes" },
  { icon: CheckCircle2, text: "First job posting always free" },
];

export default function PostAJob() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  useSEO(location.pathname);
  useBreadcrumbs([{ name: "Post a Job", url: "/post-a-job" }]);

  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobTitle.trim() || !company.trim() || !email.trim()) return;
    setLoading(true);
    setError("");

    try {
      // Capture lead + intent
      await apiClient.post("/api/marketing/leads", {
        email: email.trim(),
        source: "post_a_job_landing",
        notes: `Job title: ${jobTitle.trim()}, Company: ${company.trim()}`,
      }, null as any);

      gtmEvent("post_job_intent", { job_title: jobTitle.trim(), company: company.trim() });

      if (isAuthenticated) {
        // Send them straight to job creation pre-filled
        navigate(`/jobs/create?title=${encodeURIComponent(jobTitle.trim())}&company=${encodeURIComponent(company.trim())}`);
      } else {
        // Collect intent, send to signup pre-filled as employer
        navigate(`/signup?role=employer&email=${encodeURIComponent(email.trim())}&jobTitle=${encodeURIComponent(jobTitle.trim())}&company=${encodeURIComponent(company.trim())}`);
      }
    } catch {
      // Even if lead capture fails, still route them forward
      if (isAuthenticated) {
        navigate(`/jobs/create?title=${encodeURIComponent(jobTitle.trim())}`);
      } else {
        navigate(`/signup?role=employer&email=${encodeURIComponent(email.trim())}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation onMenuClick={() => {}} onSidebarToggle={() => {}} sidebarCollapsed={true} />

      <div className="pt-16">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-background via-background to-primary/5 py-16 px-4 sm:px-6 lg:px-8">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[400px] w-[700px] rounded-full bg-primary/5 blur-3xl" />
          </div>

          <div className="relative max-w-5xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
            {/* Left — copy */}
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary mb-6">
                <Briefcase className="w-3.5 h-3.5" />
                Free job posting — no credit card
              </div>
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-5">
                Post a job.<br />
                <span className="text-primary">Hire with AI.</span>
              </h1>
              <p className="text-lg text-muted-foreground mb-8">
                Your AI CHRO writes the job description, screens applicants, and surfaces the best candidates — so you spend time interviewing, not sorting.
              </p>

              <ul className="space-y-3">
                {PERKS.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-3 text-sm text-foreground">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <Icon className="w-3.5 h-3.5 text-primary" />
                    </div>
                    {text}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right — form */}
            <Card className="shadow-xl border-border/60">
              <CardContent className="pt-6 pb-6">
                <h2 className="text-xl font-semibold mb-1">Post your first job free</h2>
                <p className="text-sm text-muted-foreground mb-6">Takes less than 2 minutes. AI writes the description.</p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="jobTitle">Job title</Label>
                    <Input
                      id="jobTitle"
                      placeholder="e.g. Senior Software Engineer"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="company">Company name</Label>
                    <Input
                      id="company"
                      placeholder="e.g. Acme Corp"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      required
                    />
                  </div>

                  {!isAuthenticated && (
                    <div className="space-y-1.5">
                      <Label htmlFor="email">Work email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required={!isAuthenticated}
                      />
                    </div>
                  )}

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full gap-2"
                    disabled={loading || !jobTitle.trim() || !company.trim() || (!isAuthenticated && !email.trim())}
                  >
                    {loading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Setting up…</>
                    ) : (
                      <>Post Job Free <ArrowRight className="w-4 h-4" /></>
                    )}
                  </Button>

                  <p className="text-xs text-center text-muted-foreground">
                    Free forever for 1 active posting. No credit card required.
                  </p>
                </form>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Social proof strip */}
        <section className="border-y border-border bg-muted/30 py-6 px-4">
          <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
            <span className="flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" /> Trusted by 500+ companies</span>
            <span className="flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> 10,000+ active job seekers</span>
            <span className="flex items-center gap-2"><Zap className="w-4 h-4 text-primary" /> Average 48h time-to-first-applicant</span>
            <span className="flex items-center gap-2"><Brain className="w-4 h-4 text-primary" /> AI screens every applicant</span>
          </div>
        </section>

        {/* How it works */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-10">How it works</h2>
            <div className="grid sm:grid-cols-3 gap-8">
              {[
                { step: "1", title: "Describe the role", body: "Enter the job title and company. Your AI CHRO writes a compelling, bias-free job description in seconds." },
                { step: "2", title: "Go live instantly", body: "Your listing is published to hired.video and syndicated to our partner job boards — active in under 2 minutes." },
                { step: "3", title: "AI ranks applicants", body: "Every application is scored and ranked by your AI CHRO. You interview the top matches, skip the stack of CVs." },
              ].map(({ step, title, body }) => (
                <div key={step} className="text-center">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold text-lg flex items-center justify-center mx-auto mb-4">
                    {step}
                  </div>
                  <h3 className="font-semibold mb-2">{title}</h3>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>

            <div className="text-center mt-10">
              <Button size="lg" className="gap-2" onClick={() => document.getElementById("jobTitle")?.focus()}>
                Post Your Job Free <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </section>
      </div>

      <Footer />
    </div>
  );
}
