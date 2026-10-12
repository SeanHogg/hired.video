// /pricing comparison table — Core platform, browser extensions, AI Studio, reviews & salary rows.
// Rows are split across PricingRows* files so no single file grows past
// ~400 lines; the row shape lives in ./pricing-table-rows.

import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Briefcase,
  Building2,
  Chrome,
  Download,
  FileText,
  Globe,
  LayoutGrid,
  ListChecks,
  Mail,
  Mic,
  Palette,
  Phone,
  Send,
  Share2,
  Shield,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Users,
  Video,
  Wand2,
  Zap,
} from "lucide-react";
import { TIER_COPY } from "@shared/tier-copy";
import { listShippableKindPitches } from "@/lib/studio/kind-marketing";
import { USER_ROLES, type UserRole } from "@/lib/auth";
import { FeatureRow, SectionRow, PersonaGatedRow } from "./pricing-table-rows";

export default function PricingRowsCreate({ persona }: { persona: UserRole }) {
  const { t } = useTranslation();
  return (
    <>
          {/* Core Platform Features */}
          <SectionRow label={t("marketing.pricing.section.corePlatform")} />
          <FeatureRow
            icon={Briefcase}
            label={t("marketing.pricing.feature.ats")}
            free
            pro
          />
          <FeatureRow
            icon={FileText}
            label={t("marketing.pricing.feature.jobPostings")}
            free={
              persona === USER_ROLES.JOB_SEEKER
                ? false
                : t("marketing.pricing.value.unlimited")
            }
            pro={
              persona === USER_ROLES.RECRUITER
                ? t("marketing.pricing.value.unlimitedExclusive")
                : persona === USER_ROLES.EMPLOYER
                  ? t("marketing.pricing.value.unlimited")
                  : false
            }
          />
          <FeatureRow
            icon={Users}
            label={t("marketing.pricing.feature.teamSize")}
            free={
              persona === USER_ROLES.JOB_SEEKER
                ? "1"
                : t("marketing.pricing.value.upTo2")
            }
            pro={
              persona === USER_ROLES.JOB_SEEKER
                ? "1"
                : t("marketing.pricing.value.unlimited")
            }
          />
          <FeatureRow
            icon={Users}
            label={t("marketing.pricing.feature.adminUsers")}
            free="1"
            pro={
              persona === USER_ROLES.JOB_SEEKER
                ? "1"
                : t("marketing.pricing.value.unlimited")
            }
          />
          <FeatureRow
            icon={Users}
            label={t("marketing.pricing.feature.applicantsContacts")}
            free={t("marketing.pricing.value.unlimited")}
            pro={t("marketing.pricing.value.unlimited")}
          />

          {/* Browser Extensions */}
          <SectionRow label={t("marketing.pricing.section.browserExtensions")} />
          <FeatureRow
            icon={Chrome}
            label={t("marketing.pricing.feature.jobSeekerExtension")}
            free
            pro
          />
          <PersonaGatedRow
            icon={Chrome}
            label={t("marketing.pricing.feature.recruiterExtension")}
            free
            pro
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <FeatureRow
            icon={Target}
            label={t("marketing.pricing.feature.oneClickJobTracking")}
            free
            pro
          />
          <FeatureRow
            icon={Zap}
            label={t("marketing.pricing.feature.autoDetectJobBanners")}
            free
            pro
          />
          <FeatureRow
            icon={Target}
            label={t("marketing.pricing.feature.matchScoringInExt")}
            free={t("marketing.pricing.value.includedTokens")}
            pro={t("marketing.pricing.value.unlimited")}
          />
          <FeatureRow
            icon={Sparkles}
            label={t("marketing.pricing.feature.tailoringInExt")}
            free={t("marketing.pricing.value.includedTokens")}
            pro={t("marketing.pricing.value.unlimited")}
          />
          <PersonaGatedRow
            icon={Users}
            label={t("marketing.pricing.feature.candidateExtract")}
            free={t("marketing.pricing.value.includedTokens")}
            pro={t("marketing.pricing.value.unlimited")}
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <PersonaGatedRow
            icon={Building2}
            label={t("marketing.pricing.feature.companyExtract")}
            free={t("marketing.pricing.value.includedTokens")}
            pro={t("marketing.pricing.value.unlimited")}
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <PersonaGatedRow
            icon={Mail}
            label={t("messages.pricing.feature.enrichmentOnCapture")}
            free
            pro
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <PersonaGatedRow
            icon={ListChecks}
            label={t("messages.pricing.feature.bulkCapture")}
            free
            pro
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <PersonaGatedRow
            icon={Phone}
            label={t("messages.pricing.feature.clickToCall")}
            free={t("messages.pricing.value.requiresPhoneNumber")}
            pro={t("messages.pricing.value.callMinutesIncluded")}
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <PersonaGatedRow
            icon={Users}
            label={t("messages.pricing.feature.listsCallQueues")}
            free
            pro
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <PersonaGatedRow
            icon={Send}
            label={t("messages.pricing.feature.outreachEnrollment")}
            free
            pro
            visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
            currentPersona={persona}
          />
          <FeatureRow
            icon={Wand2}
            label={t("messages.pricing.feature.interactivePicker")}
            free
            pro
          />
          <FeatureRow
            icon={FileText}
            label={t("marketing.pricing.feature.appTracking")}
            free
            pro
          />

          {/* AI Studio — multi-format (video / comics / games /
              podcasts / voice / animation). Section header reads
              from MEDIA_KIND_UI labels via listShippableKindPitches
              so adding a kind ripples into the per-kind capability
              rows below automatically. Each row uses the shared
              <FeatureRow> helper (DRY anchor for the whole
              comparison table) — adding a feature is one line. */}
          <SectionRow label={t("headings.pricing.section.aiStudioMulti")} />

          <FeatureRow
            icon={Sparkles}
            label={t("messages.pricing.feature.scriptStoryboard")}
            free
            pro
          />
          <FeatureRow
            icon={Sparkles}
            label={t("messages.pricing.feature.aiDraftsMulti")}
            free={t("messages.pricing.value.unlimitedTokenGated")}
            pro={t("marketing.pricing.value.unlimited")}
          />
          <FeatureRow
            icon={Share2}
            label={t("messages.pricing.feature.publishedProjects")}
            free={t("marketing.pricing.value.onePublished")}
            pro={t("marketing.pricing.value.unlimited")}
          />
          <FeatureRow
            icon={LayoutGrid}
            label={t("messages.pricing.feature.builtinTemplatesMulti")}
            free={t("messages.pricing.value.basicTemplatesMulti")}
            pro={TIER_COPY.proCollectionLabel(
              t("messages.pricing.value.fullLibraryPremium"),
            )}
          />

          {/* Per-kind capability rows — one per shippable
              mediaKind, driven by `KIND_MARKETING` so adding a
              7th kind ripples here automatically. The blurb
              comes from the kind-marketing SoT used by the
              /studio landing page (single source of truth for
              "what does this kind do"). */}
          {listShippableKindPitches().map((pitch) => (
            <FeatureRow
              key={pitch.kind}
              icon={pitch.icon}
              label={t(pitch.titleKey)}
              free
              pro={t("messages.pricing.value.allTemplatesProExport")}
            />
          ))}

          <FeatureRow
            icon={Zap}
            label={t("messages.pricing.feature.animatedScenesMulti")}
            free={t("marketing.pricing.value.minimalOnly")}
            pro={t("marketing.pricing.value.minimalModerateCinematic")}
          />
          <FeatureRow
            icon={Palette}
            label={t("marketing.pricing.feature.brandKits")}
            free={false}
            pro
            upgradeId="brand-kit"
          />
          <FeatureRow
            icon={Download}
            label={t("messages.pricing.feature.export1080video")}
            free
            pro
          />
          <FeatureRow
            icon={Download}
            label={t("messages.pricing.feature.export4kComic")}
            free={false}
            pro
          />
          <FeatureRow
            icon={Video}
            label={t("marketing.pricing.feature.verticalExport")}
            free={false}
            pro
          />
          <FeatureRow
            icon={Shield}
            label={t("marketing.pricing.feature.watermark")}
            free={t("marketing.pricing.value.brandedWatermark")}
            pro={t("marketing.pricing.value.watermarkFree")}
          />
          <FeatureRow
            icon={Mic}
            label={t("marketing.pricing.feature.voiceCloning")}
            free={false}
            pro
            upgradeId="voice-clone"
          />
          <FeatureRow
            icon={Mic}
            label={t("marketing.pricing.feature.voiceMarketplace")}
            free={t("marketing.pricing.value.oneFreeVoice")}
            pro={t("marketing.pricing.value.fullMarketplace")}
          />
          <FeatureRow
            icon={Share2}
            label={t("messages.pricing.feature.oneClickPublishing")}
            free={false}
            pro
          />
          <FeatureRow
            icon={Sparkles}
            label={t("marketing.pricing.feature.linkedinPostAi")}
            free={false}
            pro
          />
          <FeatureRow
            icon={Share2}
            label={t("marketing.pricing.feature.publicShareLink")}
            free
            pro
          />
          <FeatureRow
            icon={BarChart3}
            label={t("messages.pricing.feature.viewAnalyticsMulti")}
            free={t("marketing.pricing.value.basicViewsOnly")}
            pro={t("marketing.pricing.value.advancedAnalytics")}
          />

          {/* Reviews & Salary Insights — cross-persona surface
              that closes the Glassdoor / Indeed-salary parity
              gap. Every persona sees the same rows: job
              seekers research employers, employers manage
              their reputation, recruiters cite real pay
              bands when sourcing. */}
          <SectionRow label={t("headings.pricing.section.reviewsSalary")} />
          <FeatureRow
            icon={Star}
            label={t("messages.pricing.feature.browseReviews")}
            free
            pro
          />
          <FeatureRow
            icon={Star}
            label={t("messages.pricing.feature.writeReview")}
            free={false}
            pro
          />
          <FeatureRow
            icon={TrendingUp}
            label={t("messages.pricing.feature.salaryGuidesRole")}
            free
            pro
          />
          <FeatureRow
            icon={Globe}
            label={t("messages.pricing.feature.salaryGuidesCity")}
            free
            pro
          />
          <FeatureRow
            icon={TrendingUp}
            label={t("messages.pricing.feature.salaryNegotiation")}
            free={false}
            pro
          />
          <FeatureRow
            icon={FileText}
            label={t("marketing.pricing.feature.resumeOptimization")}
            free={t("messages.pricing.value.aiPowered3PerMo")}
            pro={t("marketing.pricing.value.aiPoweredUnlimited")}
          />
          <FeatureRow
            icon={Download}
            label={t("marketing.pricing.feature.atsExport")}
            free
            pro
          />

    </>
  );
}
