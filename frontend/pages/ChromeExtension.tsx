import { useSEO, useBreadcrumbs } from "@/lib/seo";
import MarketingFAQ from "@/components/MarketingFAQ";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/AppShell";
import {
  Chrome,
  Zap,
  Target,
  FileText,
  CheckCircle2,
  ArrowRight,
  Download,
  Briefcase,
  Users,
  LayoutGrid,
  Building2,
  MessageSquare,
  Search,
  UserPlus,
  ListChecks,
  TrendingUp,
  Shield,
} from "lucide-react";
import { TIER_COPY, TIER_NAME } from "@shared/tier-copy";

const JOBSEEKER_STORE_URL =
  "https://chromewebstore.google.com/detail/hired.video-job-seeker/ohjmknhokdkgfmgbblflmliefoegciol";
const RECRUITER_STORE_URL =
  "https://chromewebstore.google.com/detail/hiredvideo-recruiter/edijibmdaiaaegdbbpbjdhojeaahkbkn";

const JOB_SITES = [
  "LinkedIn",
  "Indeed",
  "Glassdoor",
  "ZipRecruiter",
  "Monster",
  "CareerBuilder",
  "Dice",
  "SimplyHired",
  "Lever",
  "Greenhouse",
  "Workday",
  "Wellfound",
  "Built In",
];

export default function ChromeExtension() {
  useSEO("/chrome-extension");
  useBreadcrumbs([{ name: "Chrome Extension", url: "/chrome-extension" }]);
  return (
    <AppShell bgClassName="bg-background">
<main>
          {/* Hero */}
          <section className="bg-gradient-to-br from-blue-50 via-white to-purple-50 py-16 px-6">
            <div className="max-w-6xl mx-auto text-center">
              <Badge className="mb-4 bg-blue-100 text-blue-800 hover:bg-blue-100">
                <Chrome className="h-4 w-4 mr-1" /> Chrome Extensions
              </Badge>
              <h1 className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Work Smarter on Every Job Board
              </h1>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
                Two purpose-built Chrome extensions — one for job seekers, one for recruiters and companies.
                Capture jobs, candidates, and companies from LinkedIn, Indeed, Glassdoor, Workday and more without
                leaving the page you're on.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a href="#job-seeker">
                  <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
                    <Briefcase className="h-5 w-5 mr-2" />
                    For Job Seekers
                  </Button>
                </a>
                <a href="#recruiter">
                  <Button size="lg" variant="outline">
                    <Users className="h-5 w-5 mr-2" />
                    For Recruiters & Companies
                  </Button>
                </a>
              </div>
            </div>
          </section>

          {/* Two-plugin split */}
          <section className="py-16 px-6">
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Job Seeker card */}
                <Card id="job-seeker" className="border-blue-200 hover:border-blue-400 transition-colors scroll-mt-20">
                  <CardHeader>
                    <div className="flex items-center justify-between mb-2">
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                        <Briefcase className="h-3 w-3 mr-1" /> Job Seeker
                      </Badge>
                      <Badge variant="secondary">v2.1</Badge>
                    </div>
                    <CardTitle className="text-2xl">hired.video — Job Seeker</CardTitle>
                    <CardDescription className="text-base">
                      Track jobs, score your resume against any posting, and generate AI-tailored resume variations
                      without leaving the job site.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="space-y-2">
                      {[
                        "One-click job tracking from any board",
                        "AI match score vs. your master resume",
                        "Auto-tailored resume per job posting",
                        "Application tracking — which resume went where",
                        "Side-panel UI with auto-detect banners",
                      ].map((feat) => (
                        <li key={feat} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                    <a href={JOBSEEKER_STORE_URL} target="_blank" rel="noopener noreferrer" className="block">
                      <Button className="w-full bg-blue-600 hover:bg-blue-700">
                        <Download className="h-4 w-4 mr-2" />
                        Install Job Seeker Extension
                      </Button>
                    </a>
                  </CardContent>
                </Card>

                {/* Recruiter card */}
                <Card id="recruiter" className="border-purple-200 hover:border-purple-400 transition-colors scroll-mt-20">
                  <CardHeader>
                    <div className="flex items-center justify-between mb-2">
                      <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">
                        <Users className="h-3 w-3 mr-1" /> Recruiter & Employer
                      </Badge>
                      <Badge variant="secondary">v1.0</Badge>
                    </div>
                    <CardTitle className="text-2xl">hired.video — Recruiter</CardTitle>
                    <CardDescription className="text-base">
                      Source candidates from LinkedIn and Indeed, build a searchable talent pool, and move candidates
                      through a visual hiring pipeline — all from the browser.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="space-y-2">
                      {[
                        "Extract candidate profiles from LinkedIn & Indeed",
                        "Extract company pages from LinkedIn & Glassdoor",
                        "Searchable talent pool with tags and notes",
                        "Kanban pipeline — Sourced → Contacted → Offer → Placed",
                        "AI candidate ↔ job matching and scoring",
                        "In-extension candidate messaging",
                      ].map((feat) => (
                        <li key={feat} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                    <a href={RECRUITER_STORE_URL} target="_blank" rel="noopener noreferrer" className="block">
                      <Button className="w-full bg-purple-600 hover:bg-purple-700">
                        <Download className="h-4 w-4 mr-2" />
                        Install Recruiter Extension
                      </Button>
                    </a>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          {/* Job Seeker feature detail */}
          <section className="py-16 px-6 bg-gray-50">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-12">
                <Badge className="mb-3 bg-blue-100 text-blue-800 hover:bg-blue-100">
                  <Briefcase className="h-3 w-3 mr-1" /> Job Seeker Extension
                </Badge>
                <h2 className="text-3xl font-bold">Find a Job, Score It, Tailor Your Resume</h2>
                <p className="text-muted-foreground mt-3 max-w-2xl mx-auto">
                  The side panel watches the page you're on. When it detects a job posting, you're one click away
                  from tracking it, scoring it against your resume, and generating a tailored variation.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    icon: Target,
                    title: "Track This Job",
                    desc: "Extracts the full job posting from any board and saves it to your tracked jobs list with one click.",
                  },
                  {
                    icon: TrendingUp,
                    title: "Resume Match Score",
                    desc: "AI analyzes your master resume against the job and returns a match score with specific recommendations.",
                  },
                  {
                    icon: FileText,
                    title: "AI Resume Tailoring",
                    desc: "Generates a resume variation optimized for the job's keywords and requirements — download as PDF or Word.",
                  },
                  {
                    icon: ListChecks,
                    title: "Application Tracking",
                    desc: "Mark which resume variation you sent to which job — finally know what's actually working.",
                  },
                  {
                    icon: Zap,
                    title: "Auto-Detect Banners",
                    desc: "Browse normally. When the extension sees a job, a banner appears with title, company, and a one-click score button.",
                  },
                  {
                    icon: Shield,
                    title: "Your Data Stays Yours",
                    desc: "All resumes and applications live in your hired.video account — no scraping, no third-party sharing.",
                  },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="bg-white p-6 rounded-lg border">
                    <Icon className="h-8 w-8 text-blue-600 mb-3" />
                    <h3 className="font-semibold mb-2">{title}</h3>
                    <p className="text-sm text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Recruiter feature detail */}
          <section className="py-16 px-6">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-12">
                <Badge className="mb-3 bg-purple-100 text-purple-800 hover:bg-purple-100">
                  <Users className="h-3 w-3 mr-1" /> Recruiter Extension
                </Badge>
                <h2 className="text-3xl font-bold">Source, Track, and Place Candidates Without Leaving the Browser</h2>
                <p className="text-muted-foreground mt-3 max-w-2xl mx-auto">
                  Five tabs in one side panel: Now (active page), Pipeline (kanban), Candidates (searchable pool),
                  Companies, and Settings. Everything syncs to your hired.video recruiter workspace.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    icon: UserPlus,
                    title: "Profile Extraction",
                    desc: "Detects candidate profiles on LinkedIn and Indeed. Click Extract to parse name, title, company, and location into your talent pool.",
                  },
                  {
                    icon: Building2,
                    title: "Company Extraction",
                    desc: "Detects company pages on LinkedIn and Glassdoor. Pulls name, industry, size, location, and website into your company database.",
                  },
                  {
                    icon: Search,
                    title: "Searchable Talent Pool",
                    desc: "Every extracted candidate becomes searchable by name, title, company, or custom tags. Attach notes and match scores.",
                  },
                  {
                    icon: LayoutGrid,
                    title: "Pipeline Kanban",
                    desc: "Visualize candidates across six stages — Sourced, Contacted, Screening, Interview, Offer, Placed — with counts per column.",
                  },
                  {
                    icon: Target,
                    title: "Candidate ↔ Job Matching",
                    desc: `Score candidates against your open jobs, or score open jobs against your talent pool. AI-powered, ${TIER_NAME.pro} tier.`,
                  },
                  {
                    icon: MessageSquare,
                    title: "Candidate Messaging",
                    desc: "Send outreach from the candidate detail pane. Messages are logged against the candidate's interaction history.",
                  },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="bg-gray-50 p-6 rounded-lg border">
                    <Icon className="h-8 w-8 text-purple-600 mb-3" />
                    <h3 className="font-semibold mb-2">{title}</h3>
                    <p className="text-sm text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Supported sites */}
          <section className="py-16 px-6 bg-gray-50">
            <div className="max-w-6xl mx-auto text-center">
              <h2 className="text-3xl font-bold mb-4">Works Everywhere Your Workflow Lives</h2>
              <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
                Both extensions auto-detect jobs, profiles, and companies across 16+ major sites — and fall back to
                generic detection for everything else.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {JOB_SITES.map((site) => (
                  <Badge key={site} variant="secondary" className="px-4 py-2 text-base">
                    <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                    {site}
                  </Badge>
                ))}
              </div>
            </div>
          </section>

          {/* FAQ */}
          <MarketingFAQ
            schemaId="chrome-extension"
            subheading="Everything people ask before installing the hired.video Chrome extensions."
            items={[
              {
                question: "Is the Chrome extension free?",
                answer:
                  `Yes. Both the Job Seeker and Recruiter extensions are free to install from the Chrome Web Store. The Job Seeker extension includes one-click job tracking, resume match scoring, and AI resume tailoring; the Recruiter extension includes profile and company extraction, talent pool search, and pipeline kanban. ${TIER_COPY.proFeaturesGatedNote()}`,
              },
              {
                question: "Which job boards are supported?",
                answer:
                  "The extensions auto-detect jobs, profiles, and companies on LinkedIn, Indeed, Glassdoor, ZipRecruiter, Monster, CareerBuilder, Dice, SimplyHired, Lever, Greenhouse, Workday, Wellfound, Built In, and generic fallbacks for most other sites. 16+ boards total.",
              },
              {
                question: "Do I need a hired.video account to use the extension?",
                answer:
                  "Yes — the extension syncs your tracked jobs, scored resumes, and talent pool to your hired.video account. Create a free account at hired.video/signup if you don't already have one. Everything persists across devices.",
              },
              {
                question: "How does the AI match score work?",
                answer:
                  "When you click Score on a job posting, the extension sends the job description to hired.video's AI, which compares it against your master resume — skills, experience level, keywords, and required qualifications. You get a score and a list of specific gaps to improve.",
              },
              {
                question: "Is my browsing data private?",
                answer:
                  "The extension only activates on job board and profile pages, and it only sends data to hired.video when you explicitly click Track, Score, or Extract. We don't track your general browsing, we don't share data with third parties, and we don't inject ads. Read the privacy policy for full details.",
              },
              {
                question: "Does the extension work on Edge, Firefox, or Safari?",
                answer:
                  "The extensions are built for Chrome and Chromium-based browsers (Brave, Edge, Arc, Opera). A Firefox version is on the roadmap. Safari is not currently supported.",
              },
            ]}
          />

          {/* Final CTA */}
          <section className="py-16 px-6 bg-gradient-to-r from-blue-600 to-purple-600">
            <div className="max-w-4xl mx-auto text-center text-white">
              <h2 className="text-3xl font-bold mb-4">Pick the Extension That Fits Your Role</h2>
              <p className="text-xl mb-8 opacity-90">
                Job seekers get tailored resumes. Recruiters get a talent pipeline. Both without ever leaving the job board.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a href={JOBSEEKER_STORE_URL} target="_blank" rel="noopener noreferrer">
                  <Button size="lg" variant="secondary" className="text-blue-600">
                    <Chrome className="h-5 w-5 mr-2" />
                    Install Job Seeker
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </Button>
                </a>
                <a href={RECRUITER_STORE_URL} target="_blank" rel="noopener noreferrer">
                  <Button size="lg" variant="secondary" className="text-purple-600">
                    <Chrome className="h-5 w-5 mr-2" />
                    Install Recruiter
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </Button>
                </a>
              </div>
            </div>
          </section>
        </main>
</AppShell>
  );
}
