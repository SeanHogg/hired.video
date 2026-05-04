import MarketingFAQ from "@/components/MarketingFAQ";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { USER_ROLES } from "@shared/user-roles";
import { CheckCircle2, DollarSign, Link as LinkIcon, Shield, Users, Zap, Video, BarChart3 } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";

export default function AffiliateProgram() {
  useSEO("/affiliate-program");
  useBreadcrumbs([{ name: "Affiliate Program", url: "/affiliate-program" }]);  const navigate = useNavigate();
  const { signup, isLoading, isAuthenticated } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email || !password || !firstName || !lastName) {
      setError("Please fill in all required fields.");
      return;
    }

    // Register with the default role (job seeker); affiliate is a service layered on top of any role.
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref") || undefined;
    const ok = await signup(email, password, firstName, lastName, USER_ROLES.JOB_SEEKER, ref, true);
    if (ok) {
      setSuccess("Registration successful! Please confirm your email to continue.");
      setTimeout(() => navigate(`/signup-success?email=${encodeURIComponent(email)}&firstName=${encodeURIComponent(firstName)}`), 1000);
    } else {
      setError("Registration failed. Please verify your details or try again later.");
    }
  };

  return (
    <AppShell bgClassName="bg-background">
<main className="pt-16">
          {/* Hero */}
          <section className="max-w-6xl mx-auto px-6 py-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
              <div className="space-y-6">
                <h1 className="text-4xl font-bold tracking-tight">Partner with hired.video</h1>
                <p className="text-muted-foreground text-lg">
                  Help professionals stand out with AI-powered video and traditional resumes. Earn commissions by sharing a platform that accelerates job searches and improves hiring outcomes.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-start space-x-3">
                    <CheckCircle2 className="h-6 w-6 text-green-600 mt-0.5" />
                    <div>
                      <p className="font-medium">AI-enhanced resume builder</p>
                      <p className="text-sm text-muted-foreground">Guided creation, tailored keyword suggestions, and ATS-ready formats.</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <Video className="h-6 w-6 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium">Video resumes that convert</p>
                      <p className="text-sm text-muted-foreground">Record or upload compelling intros that increase response rates.</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <Users className="h-6 w-6 text-purple-600 mt-0.5" />
                    <div>
                      <p className="font-medium">Collaboration tools</p>
                      <p className="text-sm text-muted-foreground">Share, get feedback, and manage variations with master collections.</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <BarChart3 className="h-6 w-6 text-amber-600 mt-0.5" />
                    <div>
                      <p className="font-medium">Analytics & insights</p>
                      <p className="text-sm text-muted-foreground">Track views, engagement, and the active resume with clarity.</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    size="lg"
                    onClick={() => {
                      if (isAuthenticated) {
                        navigate("/services?tab=dashboard");
                      } else {
                        document.getElementById("affiliate-signup")?.scrollIntoView({ behavior: "smooth" });
                      }
                    }}
                  >
                    {isAuthenticated ? "Go to my dashboard" : "Join the affiliate program"}
                  </Button>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Shield className="h-4 w-4 mr-2" />
                    Fair, transparent payouts
                  </div>
                </div>
              </div>

              {isAuthenticated ? (
                <Card id="affiliate-signup" className="shadow-lg">
                  <CardHeader>
                    <CardTitle>You're already an affiliate</CardTitle>
                    <CardDescription>Your account is enrolled in the affiliate program. Manage your referral link, track conversions, and request payouts from your dashboard.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-start space-x-3">
                      <CheckCircle2 className="h-6 w-6 text-green-600 mt-0.5" />
                      <p className="text-sm text-muted-foreground">
                        Your dashboard lives in <strong>My Services</strong>, alongside any other services you've enabled.
                      </p>
                    </div>
                    <Button className="w-full" onClick={() => navigate("/services?tab=dashboard")}>
                      Go to my affiliate dashboard
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card id="affiliate-signup" className="shadow-lg">
                  <CardHeader>
                    <CardTitle>Become an Affiliate</CardTitle>
                    <CardDescription>Register as an affiliate to get your unique referral link and start earning.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form className="space-y-4" onSubmit={handleRegister}>
                      <div>
                        <label className="text-sm font-medium">First name</label>
                        <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" required />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Last name</label>
                        <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" required />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Email address</label>
                        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Password</label>
                        <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
                        <p className="text-xs text-muted-foreground mt-1">Minimum 8 characters.</p>
                      </div>
                      {error && <p className="text-sm text-red-600">{error}</p>}
                      {success && <p className="text-sm text-green-600">{success}</p>}
                      <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading ? "Creating account..." : "Create affiliate account"}
                      </Button>
                      <div className="text-xs text-center text-muted-foreground">
                        By creating an account, you agree to our{" "}
                        <Link to="/terms" className="text-primary hover:underline">
                          Terms of Service
                        </Link>{" "}
                        and{" "}
                        <Link to="/privacy" className="text-primary hover:underline">
                          Privacy Policy
                        </Link>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              )}
            </div>
          </section>

          {/* Earnings & Payouts */}
          <section className="max-w-6xl mx-auto px-6 py-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><DollarSign className="h-5 w-5 mr-2" /> Commission</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p><strong>25% commission</strong> on the first month subscription fee only (one-time payment per referral).</p>
                  <p>Example: If your referral purchases a $20 plan, you earn $5.</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><Zap className="h-5 w-5 mr-2" /> Payout threshold</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p><strong>$25.00 minimum</strong> required to request a payout.</p>
                  <p>Payout requests are processed as soon as the threshold is met.</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><LinkIcon className="h-5 w-5 mr-2" /> Payments</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p><strong>Timeline:</strong> First-month commission becomes eligible after the initial charge clears.</p>
                  <p><strong>Methods:</strong> We process payouts via standard methods (e.g., PayPal, bank transfer). You’ll set your preferred method in your affiliate settings.</p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Value propositions */}
          <section className="max-w-6xl mx-auto px-6 py-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Great for creators</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Monetize your audience with a product that helps job seekers get noticed faster.
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Built for recruiters</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Recommend modern, shareable resumes to candidates and track engagement.
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Transparent tracking</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Real-time referral attribution and clear dashboard stats.
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Social proof */}
          <section className="max-w-6xl mx-auto px-6 py-6">
            <Card>
              <CardHeader>
                <CardTitle>What affiliates say</CardTitle>
                <CardDescription>Early partners have reported higher click-through with video resumes vs text-only.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-muted-foreground">
                <blockquote className="p-4 bg-muted rounded-md">“hired.video is the first tool my audience asked me to keep recommending.” — Career Coach</blockquote>
                <blockquote className="p-4 bg-muted rounded-md">“Video intros increased recruiter responses. Easy sell.” — Content Creator</blockquote>
                <blockquote className="p-4 bg-muted rounded-md">“The collections feature makes managing resume variants a breeze.” — Staffing Agency</blockquote>
              </CardContent>
            </Card>
          </section>

          {/* FAQ */}
          <MarketingFAQ
            schemaId="affiliate-program"
            subheading="How commissions, payouts, and attribution work on the hired.video affiliate program."
            items={[
              {
                question: "How much do affiliates earn?",
                answer:
                  "You earn 25% commission on the first month of every paid subscription your referrals purchase. One-time payment per referral — for example, if your referral buys a $20/month plan, you earn $5 once when they convert.",
              },
              {
                question: "When do I get paid?",
                answer:
                  "Payouts become eligible as soon as the referred user's first-month subscription charge clears. You can request a payout any time after your balance reaches the $25 minimum threshold.",
              },
              {
                question: "What payment methods do you support?",
                answer:
                  "We support standard payout methods including PayPal and bank transfer. You'll configure your preferred method inside your affiliate settings once your account is approved.",
              },
              {
                question: "How are referrals tracked?",
                answer:
                  "Every affiliate gets a unique referral link with a ?ref= parameter. When someone clicks your link and signs up, the attribution is stored in their account and credited to you at conversion time. Attribution lasts through the browser session, so you don't lose credit if they sign up a few minutes later.",
              },
              {
                question: "Can I promote hired.video on social media?",
                answer:
                  "Absolutely. Affiliates share hired.video on YouTube, LinkedIn, TikTok, newsletters, and blogs. We just ask that you disclose the affiliate relationship per FTC / local guidelines and don't run paid ads that compete with our own brand keywords.",
              },
              {
                question: "Do I need an audience to apply?",
                answer:
                  "No minimum audience size — we approve most applications within 48 hours. Career coaches, content creators, recruiters, HR consultants, and anyone who talks to job seekers are all great fits.",
              },
              {
                question: "Can I refer recruiters and employers, not just job seekers?",
                answer:
                  "Yes. You earn commission on any paid plan — job seeker, recruiter, or employer. Recruiter and employer plans are typically higher-priced, so those referrals can be especially valuable.",
              },
              {
                question: "Is there a referral cap?",
                answer:
                  "No. There's no cap on how much you can earn or how many people you can refer. Top affiliates earn four figures monthly by consistently recommending hired.video to their audience.",
              },
            ]}
          />

          {/* Final CTA */}
          <section className="max-w-6xl mx-auto px-6 py-10">
            <div className="flex flex-col items-center text-center space-y-4">
              <h2 className="text-2xl font-semibold">
                {isAuthenticated ? "Ready to share your link?" : "Ready to start earning?"}
              </h2>
              <p className="text-muted-foreground">
                {isAuthenticated
                  ? "Grab your referral link and track conversions from your dashboard."
                  : "Create your affiliate account and get your unique referral link in minutes."}
              </p>
              <Button
                size="lg"
                onClick={() => {
                  if (isAuthenticated) {
                    navigate("/services?tab=dashboard");
                  } else {
                    document.getElementById("affiliate-signup")?.scrollIntoView({ behavior: "smooth" });
                  }
                }}
              >
                {isAuthenticated ? "Go to my dashboard" : "Join now"}
              </Button>
            </div>
          </section>
        </main>
</AppShell>
  );
}

