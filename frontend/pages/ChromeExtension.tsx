import { useTranslation } from "react-i18next";
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
  Phone,
  Mail,
  Send,
  Wand2,
  Bookmark,
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
  "GitHub",
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
  const { t } = useTranslation();
  useSEO("/chrome-extension");
  useBreadcrumbs([{ name: t("labels.chromeExtension.breadcrumb"), url: "/chrome-extension" }]);

  const jobSeekerFeatures = [
    t("messages.chromeExtension.jsFeatTrack"),
    t("messages.chromeExtension.jsFeatScore"),
    t("messages.chromeExtension.jsFeatTailor"),
    t("messages.chromeExtension.jsFeatApplication"),
    t("messages.chromeExtension.jsFeatSidePanel"),
  ];

  const recruiterFeatures = [
    t("messages.chromeExtension.recFeatProfile"),
    t("messages.chromeExtension.recFeatBulk"),
    t("messages.chromeExtension.recFeatOutreach"),
    t("messages.chromeExtension.recFeatPicker"),
    t("messages.chromeExtension.recFeatTags"),
    t("messages.chromeExtension.recFeatWand"),
  ];

  const jobSeekerDetails = [
    {
      id: "track",
      icon: Target,
      title: t("headings.chromeExtension.jsTrack"),
      desc: t("messages.chromeExtension.jsTrack"),
    },
    {
      id: "score",
      icon: TrendingUp,
      title: t("headings.chromeExtension.jsScore"),
      desc: t("messages.chromeExtension.jsScore"),
    },
    {
      id: "tailor",
      icon: FileText,
      title: t("headings.chromeExtension.jsTailor"),
      desc: t("messages.chromeExtension.jsTailor"),
    },
    {
      id: "application",
      icon: ListChecks,
      title: t("headings.chromeExtension.jsApplication"),
      desc: t("messages.chromeExtension.jsApplication"),
    },
    {
      id: "autodetect",
      icon: Zap,
      title: t("headings.chromeExtension.jsAutoDetect"),
      desc: t("messages.chromeExtension.jsAutoDetect"),
    },
    {
      id: "privacy",
      icon: Shield,
      title: t("headings.chromeExtension.jsPrivacy"),
      desc: t("messages.chromeExtension.jsPrivacy"),
    },
  ];

  const recruiterDetails = [
    {
      id: "capture",
      icon: UserPlus,
      title: t("headings.chromeExtension.recCapture"),
      desc: t("messages.chromeExtension.recCapture"),
    },
    {
      id: "bulk",
      icon: ListChecks,
      title: t("headings.chromeExtension.recBulk"),
      desc: t("messages.chromeExtension.recBulk"),
    },
    {
      id: "call",
      icon: Phone,
      title: t("headings.chromeExtension.recCall"),
      desc: t("messages.chromeExtension.recCall"),
    },
    {
      id: "emailSms",
      icon: Mail,
      title: t("headings.chromeExtension.recEmailSms"),
      desc: t("messages.chromeExtension.recEmailSms"),
    },
    {
      id: "picker",
      icon: Target,
      title: t("headings.chromeExtension.recPicker"),
      desc: t("messages.chromeExtension.recPicker"),
    },
    {
      id: "sequences",
      icon: Send,
      title: t("headings.chromeExtension.recSequences"),
      desc: t("messages.chromeExtension.recSequences"),
    },
    {
      id: "trackedJobs",
      icon: Bookmark,
      title: t("headings.chromeExtension.recTrackedJobs"),
      desc: t("messages.chromeExtension.recTrackedJobs"),
    },
    {
      id: "wand",
      icon: Wand2,
      title: t("headings.chromeExtension.recWand"),
      desc: t("messages.chromeExtension.recWand"),
    },
    {
      id: "company",
      icon: Building2,
      title: t("headings.chromeExtension.recCompany"),
      desc: t("messages.chromeExtension.recCompany"),
    },
    {
      id: "talentPool",
      icon: Search,
      title: t("headings.chromeExtension.recTalentPool"),
      desc: t("messages.chromeExtension.recTalentPool"),
    },
    {
      id: "kanban",
      icon: LayoutGrid,
      title: t("headings.chromeExtension.recKanban"),
      desc: t("messages.chromeExtension.recKanban"),
    },
    {
      id: "scoring",
      icon: MessageSquare,
      title: t("headings.chromeExtension.recScoring", { tier: TIER_NAME.pro }),
      desc: t("messages.chromeExtension.recScoring"),
    },
  ];

  return (
    <AppShell bgClassName="bg-background">
<main>
          {/* Hero */}
          <section className="bg-gradient-to-br from-blue-50 via-white to-purple-50 py-16 px-6">
            <div className="text-center">
              <Badge className="mb-4 bg-blue-100 text-blue-800 hover:bg-blue-100">
                <Chrome className="h-4 w-4 mr-1" /> {t("labels.chromeExtensions")}
              </Badge>
              <h1 className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                {t("headings.chromeExtension.hero")}
              </h1>
              <p className="text-xl text-muted-foreground mb-8">
                {t("messages.chromeExtension.hero")}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a href="#job-seeker">
                  <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
                    <Briefcase className="h-5 w-5 mr-2" />
                    {t("actions.chromeExtension.forJobSeekers")}
                  </Button>
                </a>
                <a href="#recruiter">
                  <Button size="lg" variant="outline">
                    <Users className="h-5 w-5 mr-2" />
                    {t("actions.chromeExtension.forRecruiters")}
                  </Button>
                </a>
              </div>
            </div>
          </section>

          {/* Two-plugin split */}
          <section className="py-16 px-6">
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Job Seeker card */}
                <Card id="job-seeker" className="border-blue-200 hover:border-blue-400 transition-colors scroll-mt-20">
                  <CardHeader>
                    <div className="flex items-center justify-between mb-2">
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                        <Briefcase className="h-3 w-3 mr-1" /> {t("labels.chromeExtension.jobSeeker")}
                      </Badge>
                    </div>
                    <CardTitle className="text-2xl">{t("headings.chromeExtension.jobSeekerCard")}</CardTitle>
                    <CardDescription className="text-base">
                      {t("messages.chromeExtension.jobSeekerCard")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="space-y-2">
                      {jobSeekerFeatures.map((feat) => (
                        <li key={feat} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                    <a href={JOBSEEKER_STORE_URL} target="_blank" rel="noopener noreferrer" className="block">
                      <Button className="w-full bg-blue-600 hover:bg-blue-700">
                        <Download className="h-4 w-4 mr-2" />
                        {t("actions.chromeExtension.installJobSeekerExtension")}
                      </Button>
                    </a>
                  </CardContent>
                </Card>

                {/* Recruiter card */}
                <Card id="recruiter" className="border-purple-200 hover:border-purple-400 transition-colors scroll-mt-20">
                  <CardHeader>
                    <div className="flex items-center justify-between mb-2">
                      <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">
                        <Users className="h-3 w-3 mr-1" /> {t("labels.chromeExtension.recruiterEmployer")}
                      </Badge>
                    </div>
                    <CardTitle className="text-2xl">{t("headings.chromeExtension.recruiterCard")}</CardTitle>
                    <CardDescription className="text-base">
                      {t("messages.chromeExtension.recruiterCard")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="space-y-2">
                      {recruiterFeatures.map((feat) => (
                        <li key={feat} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                    <a href={RECRUITER_STORE_URL} target="_blank" rel="noopener noreferrer" className="block">
                      <Button className="w-full bg-purple-600 hover:bg-purple-700">
                        <Download className="h-4 w-4 mr-2" />
                        {t("actions.chromeExtension.installRecruiterExtension")}
                      </Button>
                    </a>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          {/* Job Seeker feature detail */}
          <section className="py-16 px-6 bg-muted">
            <div>
              <div className="text-center mb-12">
                <Badge className="mb-3 bg-blue-100 text-blue-800 hover:bg-blue-100">
                  <Briefcase className="h-3 w-3 mr-1" /> {t("labels.chromeExtension.jobSeekerExtension")}
                </Badge>
                <h2 className="text-3xl font-bold">{t("headings.chromeExtension.jobSeekerDetail")}</h2>
                <p className="text-muted-foreground mt-3">
                  {t("messages.chromeExtension.jobSeekerDetail")}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {jobSeekerDetails.map(({ id, icon: Icon, title, desc }) => (
                  <div key={id} className="bg-card p-6 rounded-lg border">
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
            <div>
              <div className="text-center mb-12">
                <Badge className="mb-3 bg-purple-100 text-purple-800 hover:bg-purple-100">
                  <Users className="h-3 w-3 mr-1" /> {t("labels.chromeExtension.recruiterExtension")}
                </Badge>
                <h2 className="text-3xl font-bold">{t("headings.chromeExtension.recruiterDetail")}</h2>
                <p className="text-muted-foreground mt-3">
                  {t("messages.chromeExtension.recruiterDetail")}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {recruiterDetails.map(({ id, icon: Icon, title, desc }) => (
                  <div key={id} className="bg-muted p-6 rounded-lg border">
                    <Icon className="h-8 w-8 text-purple-600 mb-3" />
                    <h3 className="font-semibold mb-2">{title}</h3>
                    <p className="text-sm text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Supported sites */}
          <section className="py-16 px-6 bg-muted">
            <div className="text-center">
              <h2 className="text-3xl font-bold mb-4">{t("headings.chromeExtension.supportedSites")}</h2>
              <p className="text-muted-foreground mb-8">
                {t("messages.chromeExtension.supportedSites")}
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
            subheading={t("messages.chromeExtension.faqSubheading")}
            items={[
              {
                question: t("headings.chromeExtension.faqFreeQ"),
                answer:
                  `${t("messages.chromeExtension.faqFreeA")} ${TIER_COPY.proFeaturesGatedNote()}`,
              },
              {
                question: t("headings.chromeExtension.faqLoxoQ"),
                answer: t("messages.chromeExtension.faqLoxoA"),
              },
              {
                question: t("headings.chromeExtension.faqCallQ"),
                answer: t("messages.chromeExtension.faqCallA"),
              },
              {
                question: t("headings.chromeExtension.faqSitesQ"),
                answer: t("messages.chromeExtension.faqSitesA"),
              },
              {
                question: t("headings.chromeExtension.faqAccountQ"),
                answer: t("messages.chromeExtension.faqAccountA"),
              },
              {
                question: t("headings.chromeExtension.faqScoreQ"),
                answer: t("messages.chromeExtension.faqScoreA"),
              },
              {
                question: t("headings.chromeExtension.faqPrivacyQ"),
                answer: t("messages.chromeExtension.faqPrivacyA"),
              },
              {
                question: t("headings.chromeExtension.faqBrowserQ"),
                answer: t("messages.chromeExtension.faqBrowserA"),
              },
            ]}
          />

          {/* Final CTA */}
          <section className="py-16 px-6 bg-gradient-to-r from-blue-600 to-purple-600">
            <div className="text-center text-white">
              <h2 className="text-3xl font-bold mb-4">{t("headings.chromeExtension.finalCta")}</h2>
              <p className="text-xl mb-8 opacity-90">
                {t("messages.chromeExtension.finalCta")}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a href={JOBSEEKER_STORE_URL} target="_blank" rel="noopener noreferrer">
                  <Button size="lg" variant="secondary" className="text-blue-600">
                    <Chrome className="h-5 w-5 mr-2" />
                    {t("actions.chromeExtension.installJobSeeker")}
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </Button>
                </a>
                <a href={RECRUITER_STORE_URL} target="_blank" rel="noopener noreferrer">
                  <Button size="lg" variant="secondary" className="text-purple-600">
                    <Chrome className="h-5 w-5 mr-2" />
                    {t("actions.chromeExtension.installRecruiter")}
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
