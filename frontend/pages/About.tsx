import {
  Video,
  Sparkles,
  ArrowRight,
  Heart,
  Brain,
  Zap,
  Globe,
  Award,
  Shield,
  TrendingUp,
  CheckCircle2,
  Star,
  MessageCircle,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import MarketingFAQ from "@/components/MarketingFAQ";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import PeopleCard from "@/components/PeopleCard";
import { AppShell } from "@/components/AppShell";
import { userService } from "@/lib/services/user-service";
import type { UserMetadata } from "@/types/people";

export default function About() {
  const location = useLocation();
  const { t } = useTranslation();
  // SEO for about page
  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("labels.aboutUs"), url: "/about" }]);
  const { isAuthenticated } = useAuth();

  const values = [
    {
      icon: Heart,
      title: t("marketing.about.values.passion.title"),
      description: t("marketing.about.values.passion.desc"),
    },
    {
      icon: Brain,
      title: t("marketing.about.values.innovation.title"),
      description: t("marketing.about.values.innovation.desc"),
    },
    {
      icon: Shield,
      title: t("marketing.about.values.trust.title"),
      description: t("marketing.about.values.trust.desc"),
    },
    {
      icon: Globe,
      title: t("marketing.about.values.global.title"),
      description: t("marketing.about.values.global.desc"),
    },
  ];

  const [teamMembers, setTeamMembers] = useState<UserMetadata[]>([]);

  useEffect(() => {
    userService.getUserBySlug("seanhogg").then((profile) => {
      const member: UserMetadata = {
        id: profile.id || "",
        slug: profile.slug || "seanhogg",
        firstName: profile.firstName || "",
        lastName: profile.lastName || "",
        fullName: `${profile.firstName || ""} ${profile.lastName || ""}`.trim(),
        avatar: profile.profilePicture || undefined,
        headline: profile.currentRole || profile.bio || "",
        location: profile.location || "",
        role: profile.role || "",
        visibility: "public",
        status: "active",
        createdAt: profile.createdAt || new Date().toISOString(),
        updatedAt: profile.updatedAt || new Date().toISOString(),
        lastActiveAt: profile.updatedAt || new Date().toISOString(),
        profileViews: profile.profileViews || 0,
        connectionCount: 0,
        followerCount: 0,
        emailConfirmed: profile.isVerified || false,
        isPro: profile.isPro || false,
        openToWork: profile.openToWork || false,
        currentPosition: profile.currentRole || undefined,
        currentCompany: profile.currentCompany || undefined,
      };
      setTeamMembers([member]);
    }).catch(() => {
      // Failed to load team member — render nothing
    });
  }, []);

  const stats = [
    { number: "50K+", label: t("marketing.about.stats.activeUsers") },
    { number: "1M+", label: t("marketing.about.stats.videosCreated") },
    { number: "500+", label: t("marketing.about.stats.companies") },
    { number: "95%", label: t("marketing.about.stats.satisfaction") },
  ];

  return (
    <AppShell bgClassName="bg-background">
<div>
          {/* Hero Section */}
          <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
            <div className="text-center">
              <div className="inline-flex items-center space-x-2 mb-6">
                <div className="relative">
                  <Video className="h-12 w-12 text-primary" />
                  <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                </div>
                <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  Hired.video
                </span>
              </div>
              <h1 className="text-5xl md:text-6xl font-bold mb-6">
                {t("marketing.about.heroTitle1")}{" "}
                <span className="bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  {t("marketing.about.heroTitle2")}
                </span>
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                {t("marketing.about.heroSubtitle")}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                  >
                    {t("actions.joinMission")}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="text-lg px-8">
                  <MessageCircle className="mr-2 h-5 w-5" />
                  {t("labels.contactUs")}
                </Button>
              </div>
            </div>
          </section>

          {/* Stats Section */}
          <section className="py-16 px-4 sm:px-6 lg:px-8 border-b border-border">
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                {stats.map((stat, index) => (
                  <div key={index} className="text-center">
                    <div className="text-4xl md:text-5xl font-bold text-primary mb-2">
                      {stat.number}
                    </div>
                    <div className="text-muted-foreground font-medium">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Mission Section */}
          <section className="py-20 px-4 sm:px-6 lg:px-8">
            <div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                <div>
                  <h2 className="text-3xl md:text-4xl font-bold mb-6">
                    {t("marketing.about.missionTitle")}
                  </h2>
                  <p className="text-lg text-muted-foreground mb-6">
                    {t("marketing.about.missionPara1")}
                  </p>
                  <p className="text-lg text-muted-foreground mb-8">
                    {t("marketing.about.missionPara2")}
                  </p>
                  <div className="flex items-center gap-4">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                    <span className="text-lg font-medium">
                      {t("marketing.about.missionPoint1")}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-3">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                    <span className="text-lg font-medium">
                      {t("marketing.about.missionPoint2")}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-3">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                    <span className="text-lg font-medium">
                      {t("marketing.about.missionPoint3")}
                    </span>
                  </div>
                </div>
                <div className="relative">
                  <div className="w-full h-96 bg-gradient-to-br from-brand-purple/20 to-brand-blue/20 rounded-2xl flex items-center justify-center">
                    <Video className="h-24 w-24 text-primary" />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Values Section */}
          <section className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/20">
            <div>
              <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  {t("marketing.about.valuesTitle")}
                </h2>
                <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                  {t("marketing.about.valuesSubtitle")}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {values.map((value, index) => (
                  <Card key={index} className="text-center">
                    <CardHeader>
                      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <value.icon className="h-8 w-8 text-primary" />
                      </div>
                      <CardTitle className="text-lg">{value.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground text-sm">
                        {value.description}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          {/* Team Section */}
          <section className="py-20 px-4 sm:px-6 lg:px-8">
            <div>
              <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  {t("marketing.about.teamTitle")}
                </h2>
                <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                  {t("marketing.about.teamSubtitle")}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {teamMembers.map((member) => (
                  <PeopleCard key={member.id} person={member} />
                ))}
              </div>
            </div>
          </section>

          {/* Technology Section */}
          <section className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/20">
            <div className="text-center">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                {t("marketing.about.techTitle")}
              </h2>
              <p className="text-xl text-muted-foreground mb-12 max-w-3xl mx-auto">
                {t("marketing.about.techSubtitle")}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <Card>
                  <CardHeader>
                    <Brain className="h-12 w-12 text-primary mx-auto mb-4" />
                    <CardTitle>{t("marketing.about.tech.matching.title")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      {t("marketing.about.tech.matching.desc")}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <Video className="h-12 w-12 text-primary mx-auto mb-4" />
                    <CardTitle>{t("marketing.about.tech.video.title")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      {t("marketing.about.tech.video.desc")}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <Shield className="h-12 w-12 text-primary mx-auto mb-4" />
                    <CardTitle>{t("marketing.about.tech.security.title")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      {t("marketing.about.tech.security.desc")}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          {/* FAQ Section */}
          <MarketingFAQ
            schemaId="about"
            heading={t("marketing.about.faqHeading")}
            subheading={t("marketing.about.faqSubheading")}
            items={[
              { question: t("faq.about.whatQ"), answer: t("faq.about.whatA") },
              { question: t("faq.about.foundedQ"), answer: t("faq.about.foundedA") },
              { question: t("faq.about.availableQ"), answer: t("faq.about.availableA") },
              { question: t("faq.about.moneyQ"), answer: t("faq.about.moneyA") },
              { question: t("faq.about.privacyQ"), answer: t("faq.about.privacyA") },
              { question: t("faq.about.hiringQ"), answer: t("faq.about.hiringA") },
              { question: t("faq.about.contactQ"), answer: t("faq.about.contactA") },
            ]}
          />

          {/* CTA Section */}
          <section className="py-20 px-4 sm:px-6 lg:px-8">
            <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-12 rounded-2xl">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                {t("marketing.about.ctaTitle")}
              </h2>
              <p className="text-xl text-muted-foreground mb-8">
                {t("marketing.about.ctaSubtitle")}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                  >
                    {t("actions.getStartedToday")}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/pricing">
                  <Button size="lg" variant="outline" className="text-lg px-8">
                    {t("actions.viewPricing")}
                  </Button>
                </Link>
              </div>
            </div>
          </section>
</div>
</AppShell>
  );
}
