// /pricing comparison table — Career home, analytics, productivity, engagement/learning, support rows.
// Rows are split across PricingRows* files so no single file grows past
// ~400 lines; the row shape lives in ./pricing-table-rows.

import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Bell,
  Briefcase,
  Calendar,
  CheckSquare,
  Clock,
  Eye,
  Globe,
  GraduationCap,
  LayoutGrid,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Shield,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { INBOX_SYNC_INCLUDED_ACCOUNTS, INBOX_SYNC_EXTRA_ACCOUNT_PRICE } from "@shared/pricing";
import { USER_ROLES, type UserRole } from "@/lib/auth";
import { FeatureRow, SectionRow, PersonaGatedRow } from "./pricing-table-rows";

export default function PricingRowsPlatform({ persona }: { persona: UserRole }) {
  const { t } = useTranslation();
  return (
    <>
          {/* Career Home & Community */}
          <SectionRow label={t("marketing.pricing.section.careerHome")} />
          <FeatureRow
            icon={TrendingUp}
            label={t("marketing.pricing.feature.careerHomeDash")}
            free
            pro
          />
          <FeatureRow
            icon={MessageCircle}
            label={t("marketing.pricing.feature.communityFeed")}
            free
            pro
          />
          <FeatureRow
            icon={Lock}
            label={t("marketing.pricing.feature.privacyControls")}
            free
            pro
          />
          <FeatureRow
            icon={Users}
            label={t("marketing.pricing.feature.professionalNetworking")}
            free={t("marketing.pricing.value.unlimited")}
            pro={t("marketing.pricing.value.unlimited")}
          />
          <FeatureRow
            icon={TrendingUp}
            label={t("marketing.pricing.feature.resilienceTools")}
            free
            pro
          />
          <FeatureRow
            icon={Sparkles}
            label={t("marketing.pricing.feature.creatorStudio")}
            free
            pro
          />
          <FeatureRow
            icon={Briefcase}
            label={t("marketing.pricing.feature.gigMarketplace")}
            free
            pro
          />
          <FeatureRow
            icon={Shield}
            label={t("marketing.pricing.feature.whiteLabel")}
            free={t("marketing.pricing.value.hiredBranded")}
            pro={t("marketing.pricing.value.optOutAvailable")}
          />
          <PersonaGatedRow
            icon={Globe}
            label={t("marketing.pricing.feature.googleForJobs")}
            free
            pro
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />

          {/* Analytics & Reporting */}
          <SectionRow label={t("marketing.pricing.section.analyticsReporting")} />
          <FeatureRow
            icon={Eye}
            label={t("marketing.pricing.feature.viewTracking")}
            free={t("marketing.pricing.value.basic")}
            pro={t("marketing.pricing.value.advancedViewer")}
          />
          <PersonaGatedRow
            icon={LayoutGrid}
            label={t("marketing.pricing.feature.conversionFunnel")}
            free={false}
            pro
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <FeatureRow
            icon={Bell}
            label={t("marketing.pricing.feature.weeklyDigest")}
            free
            pro
          />
          <PersonaGatedRow
            icon={Users}
            label={t("marketing.pricing.feature.teamLeaderboards")}
            free={false}
            pro
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <FeatureRow
            icon={BarChart3}
            label={t("marketing.pricing.feature.dashboardAnalytics")}
            free={t("marketing.pricing.value.basic")}
            pro={t("marketing.pricing.value.advancedInsights")}
          />
          <FeatureRow
            icon={TrendingUp}
            label={t("marketing.pricing.feature.careerProgress")}
            free={false}
            pro
          />
          <PersonaGatedRow
            icon={BarChart3}
            label={t("marketing.pricing.feature.hiringMetrics")}
            free={false}
            pro
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <PersonaGatedRow
            icon={Clock}
            label={t("marketing.pricing.feature.timeToHire")}
            free={false}
            pro
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />

          {/* Productivity Features */}
          <SectionRow label={t("marketing.pricing.section.productivity")} />
          <FeatureRow
            icon={CheckSquare}
            label={t("marketing.pricing.feature.taskManagement")}
            free={t("marketing.pricing.value.basic")}
            pro={t("marketing.pricing.value.advancedAutomation")}
          />
          <FeatureRow
            icon={Calendar}
            label={t("marketing.pricing.feature.calendarIntegration")}
            free={false}
            pro
          />
          <FeatureRow
            icon={Mail}
            label={t("messages.pricing.feature.inboxSyncLabel")}
            free={false}
            pro={
              <>
                {t("messages.pricing.value.mailboxesIncluded", {
                  count: INBOX_SYNC_INCLUDED_ACCOUNTS,
                })}
                <div className="text-xs">
                  {t("messages.pricing.value.perExtraMailbox", {
                    price: INBOX_SYNC_EXTRA_ACCOUNT_PRICE,
                  })}
                </div>
              </>
            }
            upgradeId="inbox-sync"
          />
          <FeatureRow
            icon={Bell}
            label={t("marketing.pricing.feature.smartNotifications")}
            free={t("marketing.pricing.value.basic")}
            pro={t("marketing.pricing.value.aiPrioritized")}
            upgradeId="smart-notifications"
          />

          {/* Engagement, Learning & Discovery — modules that
              competitors don't ship at all (gamification cashout,
              SCORM learning paths, built-in AI/RAG/must-have-skills
              content library, geo-map discovery, per-section
              profile gating). These ride on the same Pro seat —
              no per-module upcharge, no separately-licensed
              LinkedIn-Learning-style SKU. */}
          <SectionRow label={t("headings.pricing.section.engagementLearning")} />
          <FeatureRow
            icon={Trophy}
            label={t("messages.pricing.feature.gamification")}
            free
            pro
          />
          <FeatureRow
            icon={Trophy}
            label={t("messages.pricing.feature.giftCardCashout")}
            free={t("messages.pricing.value.earnPointsOnly")}
            pro={t("messages.pricing.value.fullCashoutRedemption")}
          />
          <FeatureRow
            icon={GraduationCap}
            label={t("messages.pricing.feature.learningLibrary")}
            free={t("messages.pricing.value.browseEnroll")}
            pro={t("messages.pricing.value.browseEnrollAuthoring")}
          />
          <FeatureRow
            icon={GraduationCap}
            label={t("messages.pricing.feature.learningPaths")}
            free={t("messages.pricing.value.browseEnroll")}
            pro={t("messages.pricing.value.authoringAssign")}
          />
          <FeatureRow
            icon={GraduationCap}
            label={t("messages.pricing.feature.scormXapi")}
            free
            pro
          />
          <FeatureRow
            icon={GraduationCap}
            label={t("messages.pricing.feature.classrooms")}
            free={t("messages.pricing.value.joinTrackAssigned")}
            pro={t("messages.pricing.value.createCohortsMonitor")}
          />
          <FeatureRow
            icon={GraduationCap}
            label={t("messages.pricing.feature.verifiableCerts")}
            free={false}
            pro
          />
          <FeatureRow
            icon={MapPin}
            label={t("messages.pricing.feature.geoSearch")}
            free
            pro
          />
          <FeatureRow
            icon={Lock}
            label={t("messages.pricing.feature.sectionVisibility")}
            free
            pro
          />

          {/* Support & Security */}
          <SectionRow label={t("marketing.pricing.section.compliance")} />
          <FeatureRow
            icon={Lock}
            label={t("marketing.pricing.feature.encryption")}
            free
            pro
          />
          <FeatureRow
            icon={Shield}
            label={t("marketing.pricing.feature.gdpr")}
            free
            pro
          />
          <FeatureRow
            icon={Shield}
            label={t("marketing.pricing.feature.soc2")}
            free={t("marketing.pricing.value.inProgress")}
            pro={t("marketing.pricing.value.onRoadmap")}
          />
          <FeatureRow
            icon={Globe}
            label={t("marketing.pricing.feature.dataResidency")}
            free={false}
            pro={t("marketing.pricing.value.onRoadmap")}
          />
          <FeatureRow
            icon={Lock}
            label={t("marketing.pricing.feature.sso")}
            free={false}
            pro={t("marketing.pricing.value.onRoadmap")}
          />
          <FeatureRow
            icon={Shield}
            label={t("marketing.pricing.feature.auditLogs")}
            free={false}
            pro
          />
          <FeatureRow
            icon={MessageCircle}
            label={t("marketing.pricing.feature.customerSupport")}
            free={t("marketing.pricing.value.email48h")}
            pro={t("marketing.pricing.value.priorityChat4h")}
          />
          <FeatureRow
            icon={Users}
            label={t("marketing.pricing.feature.csm")}
            free={false}
            pro={t("marketing.pricing.value.onRoadmap")}
          />
          <FeatureRow
            icon={Globe}
            label={t("marketing.pricing.feature.apiAccess")}
            free={false}
            pro
          />
          <FeatureRow
            icon={Zap}
            label={t("marketing.pricing.feature.customIntegrations")}
            free={false}
            pro
          />
    </>
  );
}
