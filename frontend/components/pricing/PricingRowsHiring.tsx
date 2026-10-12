// /pricing comparison table — AI tools, sourcing, recruiting/CRM, People Ops, outreach, AI recruiter rows.
// Rows are split across PricingRows* files so no single file grows past
// ~400 lines; the row shape lives in ./pricing-table-rows.

import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Brain,
  Building2,
  Calendar,
  Clock,
  Download,
  FileText,
  Handshake,
  LayoutGrid,
  MessageCircle,
  Search,
  Send,
  Sparkles,
  Target,
  Users,
  Video,
  Zap,
} from "lucide-react";
import { USER_ROLES, type UserRole } from "@/lib/auth";
import { FeatureRow, SectionRow, PersonaGatedRow } from "./pricing-table-rows";
import { formatTokens } from "@/hooks/use-token-budget";
import { FREE_AI_MONTHLY_TOKENS, PRO_AI_MONTHLY_TOKENS } from "@shared/pricing";

export default function PricingRowsHiring({ persona }: { persona: UserRole }) {
  const { t } = useTranslation();
  return (
    <>
          {/* AI-Powered Tools */}
          <SectionRow label={t("marketing.pricing.section.aiTools")} />
          <FeatureRow
            icon={Brain}
            label={t("marketing.pricing.feature.aiAssistance")}
            free={t("marketing.pricing.value.tokensPerMonth", { tokens: formatTokens(FREE_AI_MONTHLY_TOKENS) })}
            pro={t("marketing.pricing.value.tokensPerMonth", { tokens: formatTokens(PRO_AI_MONTHLY_TOKENS) })}
            upgradeId="ai-tokens"
          />
          <FeatureRow
            icon={Target}
            label={t("marketing.pricing.feature.smartJobMatching")}
            free={t("marketing.pricing.value.basic")}
            pro={t("marketing.pricing.value.aiEnhanced")}
          />
          <FeatureRow
            icon={MessageCircle}
            label={t("marketing.pricing.feature.interviewSimulator")}
            free={t("messages.pricing.value.basic3PerMo")}
            pro={t("marketing.pricing.value.advanced")}
          />
          <FeatureRow
            icon={BarChart3}
            label={t("marketing.pricing.feature.resumeScoring")}
            free={t("messages.pricing.value.basicPreviewOnly")}
            pro={t("marketing.pricing.value.advancedUnlimited")}
          />
          <FeatureRow
            icon={Clock}
            label={t("marketing.pricing.feature.salaryCalculator")}
            free={false}
            pro
          />
          <FeatureRow
            icon={Sparkles}
            label={t("marketing.pricing.feature.resumeTailor")}
            free={t("marketing.pricing.value.variations3PerMo")}
            pro={t("marketing.pricing.value.unlimited")}
          />
          <FeatureRow
            icon={FileText}
            label={t("marketing.pricing.feature.resumeConsolidator")}
            free={false}
            pro
          />
          <FeatureRow
            icon={Zap}
            label={t("marketing.pricing.feature.resumeRoast")}
            free={t("marketing.pricing.value.roasts3PerMo")}
            pro={t("marketing.pricing.value.unlimited")}
          />
          <FeatureRow
            icon={FileText}
            label={t("marketing.pricing.feature.resumeSummarizer")}
            free={t("marketing.pricing.value.summaries5PerMo")}
            pro={t("marketing.pricing.value.unlimited")}
          />
          <FeatureRow
            icon={Target}
            label={t("marketing.pricing.feature.valueProp")}
            free={t("marketing.pricing.value.pitches3PerMo")}
            pro={t("marketing.pricing.value.unlimited")}
          />
          <FeatureRow
            icon={Brain}
            label={t("marketing.pricing.feature.sentimentAnalysis")}
            free={false}
            pro
          />
          <FeatureRow
            icon={FileText}
            label={t("marketing.pricing.feature.pdfParser")}
            free={t("marketing.pricing.value.parses5PerMo")}
            pro={t("marketing.pricing.value.unlimited")}
          />
          <FeatureRow
            icon={MessageCircle}
            label={t("marketing.pricing.feature.careerCoachChat")}
            free={t("marketing.pricing.value.messages20PerMo")}
            pro={t("marketing.pricing.value.unlimited")}
          />
          <FeatureRow
            icon={Sparkles}
            label={t("marketing.pricing.feature.nextBestAction")}
            free={t("marketing.pricing.value.daily")}
            pro={t("marketing.pricing.value.realtime")}
          />

          {/* Sourcing & Talent Pipeline — recruiter / employer */}
          <SectionRow label={t("marketing.pricing.section.sourcingPipeline")} />
          <PersonaGatedRow
            icon={Search}
            label={t("marketing.pricing.feature.talentPool")}
            free={t("marketing.pricing.value.unlimited")}
            pro={t("marketing.pricing.value.unlimited")}
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <PersonaGatedRow
            icon={LayoutGrid}
            label={t("marketing.pricing.feature.kanbanPipeline")}
            free
            pro
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <PersonaGatedRow
            icon={Target}
            label={t("marketing.pricing.feature.candidateJobMatch")}
            free={false}
            pro
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <PersonaGatedRow
            icon={FileText}
            label={t("marketing.pricing.feature.candidateTags")}
            free
            pro
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <PersonaGatedRow
            icon={Search}
            label={t("marketing.pricing.feature.savedSearches")}
            free={t("marketing.pricing.value.upTo3")}
            pro={t("marketing.pricing.value.unlimited")}
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <PersonaGatedRow
            icon={Send}
            label={t("marketing.pricing.feature.candidateMessaging")}
            free={false}
            pro
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <PersonaGatedRow
            icon={Video}
            label={t("marketing.pricing.feature.transcriptSearch")}
            free={false}
            pro
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <PersonaGatedRow
            icon={Download}
            label={t("marketing.pricing.feature.bulkCsv")}
            free={false}
            pro
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <PersonaGatedRow
            icon={Building2}
            label={t("marketing.pricing.feature.companyDatabase")}
            free={t("marketing.pricing.value.upTo50")}
            pro={t("marketing.pricing.value.unlimited")}
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />

          {/* Recruitment & CRM */}
          <SectionRow label={t("marketing.pricing.section.recruitmentCrm")} />
          <PersonaGatedRow
            icon={Users}
            label={t("marketing.pricing.feature.recruitingCrm")}
            free
            pro
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <PersonaGatedRow
            icon={Handshake}
            label={t("marketing.pricing.feature.hiringOnboarding")}
            free={false}
            pro
            visibleFor={[USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <FeatureRow
            icon={Calendar}
            label={t("marketing.pricing.feature.interviewScheduling")}
            free={t("marketing.pricing.value.basic")}
            pro={t("marketing.pricing.value.advancedAutomation")}
          />
          <FeatureRow
            icon={BarChart3}
            label={t("marketing.pricing.feature.performanceMgmt")}
            free={false}
            pro
          />

          {/* People Operations — the embeddable CHRO back-office
              (roster auto-materialized from role associations,
              org chart, 1:1s, segment/team-health analytics).
              Employer-only + Pro: it's the paid post-hire product,
              so every row gates to the employer persona. */}
          <SectionRow label={t("marketing.pricing.section.peopleOps")} />
          <PersonaGatedRow
            icon={Users}
            label={t("marketing.pricing.feature.orgChart")}
            free={false}
            pro
            visibleFor={[USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <PersonaGatedRow
            icon={MessageCircle}
            label={t("marketing.pricing.feature.oneOnOnesReviews")}
            free={false}
            pro
            visibleFor={[USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <PersonaGatedRow
            icon={BarChart3}
            label={t("marketing.pricing.feature.peopleSegments")}
            free={false}
            pro
            visibleFor={[USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />

          {/* Communication & Outreach */}
          <SectionRow label={t("marketing.pricing.section.commsOutreach")} />
          <PersonaGatedRow
            icon={Send}
            label={t("marketing.pricing.feature.outreachCampaigns")}
            free={t("marketing.pricing.value.basic")}
            pro
            visibleFor={[USER_ROLES.RECRUITER]}
            currentPersona={persona}
          />
          <FeatureRow
            icon={MessageCircle}
            label={t("marketing.pricing.feature.messagePersonalization")}
            free={t("messages.pricing.value.basicTemplateOnly")}
            pro={t("marketing.pricing.value.advancedUnlimited")}
          />
          <FeatureRow
            icon={Clock}
            label={t("marketing.pricing.feature.autoFollowups")}
            free={false}
            pro
          />

          {/* AI Recruiter Agent v2 + Live Screening — the
              LinkedIn Hiring Assistant / ZipIntro parity
              rows. PersonaGatedRow keeps the JSX terse vs
              the older hand-rolled persona conditionals. */}
          <PersonaGatedRow
            icon={Brain}
            label={t("messages.pricing.feature.recruiterAgentIntake")}
            free={t("messages.pricing.value.oneRunPerMo")}
            pro={t("marketing.pricing.value.unlimited")}
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <PersonaGatedRow
            icon={Send}
            label={t("messages.pricing.feature.recruiterAgentSourced")}
            free={t("messages.pricing.value.threeCandidatesPerRun")}
            pro={t("messages.pricing.value.upTo50PerRun")}
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <PersonaGatedRow
            icon={Clock}
            label={t("messages.pricing.feature.scheduledFollowups")}
            free={false}
            pro
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <PersonaGatedRow
            icon={Video}
            label={t("messages.pricing.feature.liveScreeningBlocks")}
            free={false}
            pro
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <PersonaGatedRow
            icon={Calendar}
            label={t("messages.pricing.feature.candidateMagicLinks")}
            free={false}
            pro
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <PersonaGatedRow
            icon={Users}
            label={t("marketing.pricing.feature.employeeCommunity")}
            free={false}
            pro
            visibleFor={[USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />

    </>
  );
}
