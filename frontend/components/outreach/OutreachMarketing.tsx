import {
  Send,
  Video,
  Sparkles,
  ArrowRight,
  Star,
  MessageSquare,
  Mail,
  Phone,
  Users,
  Target,
  BarChart3,
  Clock,
  Network,
  MessageCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Signed-out Outreach marketing page. */
export function OutreachMarketing() {
  const { t } = useTranslation();
  return (
    <AppShell>
      <div className="px-4 py-16">
            {/* Hero Section */}
            <div className="text-center mb-16">
              <div className="inline-flex items-center space-x-2 mb-6">
                <div className="relative">
                  <Send className="h-12 w-12 text-primary" />
                  <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                </div>
                <span className="text-4xl font-bold text-primary">
                  {t("labels.smartOutreach")}
                </span>
              </div>
              <h1 className="text-5xl font-bold mb-6">
                {t("messages.connectEngageFollowUp")}
              </h1>
              <p className="text-xl text-muted-foreground mb-8">
                {t("messages.outreachValueProp")}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="text-lg px-8 bg-primary hover:bg-primary/90"
                  >
                    {t("actions.startNetworkingToday")}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/login">
                  <Button
                    size="lg"
                    variant="outline"
                    className="text-lg px-8"
                  >
                    {t("actions.signIn")}
                  </Button>
                </Link>
              </div>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 mb-12 sm:mb-16">
              <Card className="border-brand-primary/20 hover:border-brand-primary/40 transition-colors">
                <CardHeader>
                  <MessageSquare className="h-10 w-10 text-brand-primary mb-4" />
                  <CardTitle>{t("headings.smartMessaging")}</CardTitle>
                  <CardDescription>
                    {t("messages.smartMessagingDesc")}
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                <CardHeader>
                  <BarChart3 className="h-10 w-10 text-brand-blue mb-4" />
                  <CardTitle>{t("headings.engagementTracking")}</CardTitle>
                  <CardDescription>
                    {t("messages.engagementTrackingDesc")}
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                <CardHeader>
                  <Clock className="h-10 w-10 text-primary mb-4" />
                  <CardTitle>{t("headings.followUpAutomation")}</CardTitle>
                  <CardDescription>
                    {t("messages.followUpAutomationDesc")}
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>

            {/* Persona-specific Benefits */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                {t("headings.outreachForEveryProfessional")}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <Card className="text-center">
                  <CardHeader>
                    <Users className="h-12 w-12 mx-auto text-green-600 mb-4" />
                    <CardTitle>{t("labels.jobSeekers")}</CardTitle>
                    <CardDescription>
                      {t("messages.jobSeekersOutreachDesc")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm text-left">
                      <div className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-yellow-500" />
                        {t("labels.outreachLinkedinConnReq")}
                      </div>
                      <div className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-yellow-500" />
                        {t("labels.outreachInformationalInterview")}
                      </div>
                      <div className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-yellow-500" />
                        {t("labels.outreachThankYouFollowUp")}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="text-center">
                  <CardHeader>
                    <Target className="h-12 w-12 mx-auto text-primary mb-4" />
                    <CardTitle>{t("labels.recruiters")}</CardTitle>
                    <CardDescription>
                      {t("messages.recruitersOutreachDesc")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm text-left">
                      <div className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-yellow-500" />
                        {t("labels.outreachCandidateSourcingMsg")}
                      </div>
                      <div className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-yellow-500" />
                        {t("labels.outreachInterviewInvitation")}
                      </div>
                      <div className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-yellow-500" />
                        {t("labels.outreachTalentPipeline")}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="text-center">
                  <CardHeader>
                    <Network className="h-12 w-12 mx-auto text-primary mb-4" />
                    <CardTitle>{t("labels.employers")}</CardTitle>
                    <CardDescription>
                      {t("messages.employersOutreachDesc")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm text-left">
                      <div className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-yellow-500" />
                        {t("labels.outreachPartnershipProposals")}
                      </div>
                      <div className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-yellow-500" />
                        {t("labels.outreachVendorOutreach")}
                      </div>
                      <div className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-yellow-500" />
                        {t("labels.outreachClientRelationship")}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Communication Channels */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                {t("headings.multiChannelCommunication")}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="text-center">
                  <CardHeader>
                    <Mail className="h-8 w-8 mx-auto text-primary mb-2" />
                    <CardTitle className="text-lg">{t("fields.email.label")}</CardTitle>
                    <CardDescription className="text-sm">
                      {t("labels.commsEmailChannelDesc")}
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="text-center">
                  <CardHeader>
                    <MessageCircle className="h-8 w-8 mx-auto text-green-600 mb-2" />
                    <CardTitle className="text-lg">{t("labels.commsLinkedinChannel")}</CardTitle>
                    <CardDescription className="text-sm">
                      {t("labels.commsLinkedinChannelDesc")}
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="text-center">
                  <CardHeader>
                    <Phone className="h-8 w-8 mx-auto text-primary mb-2" />
                    <CardTitle className="text-lg">{t("fields.phone.label")}</CardTitle>
                    <CardDescription className="text-sm">
                      {t("labels.commsPhoneChannelDesc")}
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="text-center">
                  <CardHeader>
                    <Video className="h-8 w-8 mx-auto text-red-600 mb-2" />
                    <CardTitle className="text-lg">{t("labels.commsVideoChannel")}</CardTitle>
                    <CardDescription className="text-sm">
                      {t("labels.commsVideoChannelDesc")}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </div>

            {/* Final CTA */}
            <div className="text-center p-8 rounded-2xl bg-accent/50">
              <h3 className="text-2xl font-bold mb-4">
                {t("messages.outreachClosingPrompt")}
              </h3>
              <p className="text-muted-foreground mb-6">
                {t("messages.outreachClosingDesc")}
              </p>
              <Link to="/signup">
                <Button
                  size="lg"
                  className="bg-primary hover:bg-primary/90"
                >
                  {t("actions.startOutreachCampaign")}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
    </AppShell>
  );
}
