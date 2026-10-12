// /security control catalog — SSoT for every "is hired.video secure?" claim.
// Honesty rule: "implemented" must point to code/policy that exists today.
import {
  Shield,
  Lock,
  KeyRound,
  Globe,
  ScanEye,
  CheckCircle2,
  Hourglass,
  CalendarClock,
  FileText,
  Fingerprint,
} from "lucide-react";
import type { TFunction } from "i18next";

export type Status = "implemented" | "in_progress" | "roadmap";

export type Control = {
  title: string;
  description: string;
  status: Status;
  refs: string[];
};

export const STATUS_META: Record<Status, { labelKey: string; chipClass: string; icon: typeof CheckCircle2 }> = {
  implemented: {
    labelKey: "labels.security.statusImplemented",
    chipClass: "bg-brand-green/15 text-brand-green-text",
    icon: CheckCircle2,
  },
  in_progress: { labelKey: "labels.security.statusInProgress", chipClass: "bg-accent text-accent-foreground", icon: Hourglass },
  roadmap: { labelKey: "labels.security.statusRoadmap", chipClass: "bg-muted text-muted-foreground", icon: CalendarClock },
};

// Single source of truth for the control catalog. Grouped by surface so
// the same row is never repeated under two headings. Built inside the
// component as a factory so display text can call t().
function buildIdentityControls(t: TFunction): Control[] {
  return [
    {
      title: t("headings.security.identityPasskeys"),
      description: t("messages.security.identityPasskeys"),
      status: "implemented",
      refs: ["NIST SP 800-63B AAL3", "FIDO2 / WebAuthn L2"],
    },
    {
      title: t("headings.security.identityEmailOtp"),
      description: t("messages.security.identityEmailOtp"),
      status: "implemented",
      refs: ["NIST SP 800-63B AAL2", "OWASP ASVS V2.8"],
    },
    {
      title: t("headings.security.identityMagicLink"),
      description: t("messages.security.identityMagicLink"),
      status: "implemented",
      refs: ["OWASP ASVS V2.5"],
    },
    {
      title: t("headings.security.identityTotp"),
      description: t("messages.security.identityTotp"),
      status: "in_progress",
      refs: ["RFC 6238", "NIST SP 800-63B AAL2"],
    },
    {
      title: t("headings.security.identityAdaptiveMfa"),
      description: t("messages.security.identityAdaptiveMfa"),
      status: "in_progress",
      refs: ["NIST SP 800-63B §5.2.10", "OWASP ASVS V2.7"],
    },
    {
      title: t("headings.security.identityBackupCodes"),
      description: t("messages.security.identityBackupCodes"),
      status: "roadmap",
      refs: ["NIST SP 800-63B §6.1.2.3"],
    },
  ];
}

function buildSessionControls(t: TFunction): Control[] {
  return [
    {
      title: t("headings.security.sessionDeviceCap"),
      description: t("messages.security.sessionDeviceCap"),
      status: "implemented",
      refs: ["OWASP ASVS V3.3"],
    },
    {
      title: t("headings.security.sessionRefreshRotation"),
      description: t("messages.security.sessionRefreshRotation"),
      status: "implemented",
      refs: ["RFC 6749 §10.4", "OWASP ASVS V3.5"],
    },
    {
      title: t("headings.security.sessionIdleTimeout"),
      description: t("messages.security.sessionIdleTimeout"),
      status: "implemented",
      refs: ["OWASP ASVS V3.3.1"],
    },
    {
      title: t("headings.security.sessionMassInvalidation"),
      description: t("messages.security.sessionMassInvalidation"),
      status: "implemented",
      refs: ["NIST SP 800-63B §7.1", "OWASP ASVS V3.3.4"],
    },
    {
      title: t("headings.security.sessionEmailChange"),
      description: t("messages.security.sessionEmailChange"),
      status: "implemented",
      refs: ["NIST SP 800-63B §5.1.1.2", "OWASP ASVS V2.4.5"],
    },
  ];
}

function buildAbuseControls(t: TFunction): Control[] {
  return [
    {
      title: t("headings.security.abuseTurnstile"),
      description: t("messages.security.abuseTurnstile"),
      status: "implemented",
      refs: ["OWASP ASVS V11.1"],
    },
    {
      title: t("headings.security.abuseRateLimits"),
      description: t("messages.security.abuseRateLimits"),
      status: "in_progress",
      refs: ["OWASP ASVS V11.1.4"],
    },
    {
      title: t("headings.security.abuseDisposableEmail"),
      description: t("messages.security.abuseDisposableEmail"),
      status: "in_progress",
      refs: ["OWASP ASVS V5.1.4"],
    },
    {
      title: t("headings.security.abuseCompromisedPassword"),
      description: t("messages.security.abuseCompromisedPassword"),
      status: "in_progress",
      refs: ["NIST SP 800-63B §5.1.1.2", "OWASP ASVS V2.1.7"],
    },
    {
      title: t("headings.security.abuseAccountLockout"),
      description: t("messages.security.abuseAccountLockout"),
      status: "in_progress",
      refs: ["OWASP ASVS V2.2.1"],
    },
    {
      title: t("headings.security.abuseHoneypot"),
      description: t("messages.security.abuseHoneypot"),
      status: "roadmap",
      refs: ["OWASP ASVS V11.1.3"],
    },
  ];
}

function buildGeoControls(t: TFunction): Control[] {
  return [
    {
      title: t("headings.security.geoOfac"),
      description: t("messages.security.geoOfac"),
      status: "in_progress",
      refs: ["OFAC SDN", "ISO-3166-1 alpha-2"],
    },
    {
      title: t("headings.security.geoAllowlist"),
      description: t("messages.security.geoAllowlist"),
      status: "in_progress",
      refs: ["ISO-3166-1 alpha-2"],
    },
    {
      title: t("headings.security.geoVelocity"),
      description: t("messages.security.geoVelocity"),
      status: "roadmap",
      refs: ["NIST SP 800-63B §5.2.10"],
    },
  ];
}

function buildStorageControls(t: TFunction): Control[] {
  return [
    {
      title: t("headings.security.storagePbkdf2"),
      description: t("messages.security.storagePbkdf2"),
      status: "implemented",
      refs: ["NIST SP 800-132", "OWASP ASVS V2.4"],
    },
    {
      title: t("headings.security.storageRefreshHash"),
      description: t("messages.security.storageRefreshHash"),
      status: "implemented",
      refs: ["OWASP ASVS V3.5.3"],
    },
    {
      title: t("headings.security.storageJwt"),
      description: t("messages.security.storageJwt"),
      status: "implemented",
      refs: ["RFC 7519", "OWASP ASVS V3.5"],
    },
    {
      title: t("headings.security.storageTls"),
      description: t("messages.security.storageTls"),
      status: "implemented",
      refs: ["OWASP ASVS V9.1"],
    },
    {
      title: t("headings.security.storageAuditLog"),
      description: t("messages.security.storageAuditLog"),
      status: "implemented",
      refs: ["NIST SP 800-92", "OWASP ASVS V7.1"],
    },
  ];
}

function buildComplianceControls(t: TFunction): Control[] {
  return [
    {
      title: t("headings.security.complianceGdpr"),
      description: t("messages.security.complianceGdpr"),
      status: "implemented",
      refs: ["GDPR Art. 15–21"],
    },
    {
      title: t("headings.security.complianceCcpa"),
      description: t("messages.security.complianceCcpa"),
      status: "implemented",
      refs: ["CCPA §1798.100–1798.150"],
    },
    {
      title: t("headings.security.complianceCookieConsent"),
      description: t("messages.security.complianceCookieConsent"),
      status: "implemented",
      refs: ["GDPR Art. 7", "ePrivacy"],
    },
    {
      title: t("headings.security.complianceSoc2"),
      description: t("messages.security.complianceSoc2"),
      status: "roadmap",
      refs: ["AICPA TSC 2017"],
    },
    {
      title: t("headings.security.complianceIso27001"),
      description: t("messages.security.complianceIso27001"),
      status: "roadmap",
      refs: ["ISO/IEC 27001:2022"],
    },
  ];
}

export type SectionDef = {
  id: string;
  title: string;
  description: string;
  icon: typeof Shield;
  controls: Control[];
};

export function buildSections(t: TFunction): SectionDef[] {
  return [
    {
      id: "identity",
      title: t("headings.security.sectionIdentity"),
      description: t("messages.security.sectionIdentity"),
      icon: Fingerprint,
      controls: buildIdentityControls(t),
    },
    {
      id: "sessions",
      title: t("headings.security.sectionSessions"),
      description: t("messages.security.sectionSessions"),
      icon: KeyRound,
      controls: buildSessionControls(t),
    },
    {
      id: "abuse",
      title: t("headings.security.sectionAbuse"),
      description: t("messages.security.sectionAbuse"),
      icon: ScanEye,
      controls: buildAbuseControls(t),
    },
    {
      id: "geo",
      title: t("headings.security.sectionGeo"),
      description: t("messages.security.sectionGeo"),
      icon: Globe,
      controls: buildGeoControls(t),
    },
    {
      id: "storage",
      title: t("headings.security.sectionStorage"),
      description: t("messages.security.sectionStorage"),
      icon: Lock,
      controls: buildStorageControls(t),
    },
    {
      id: "compliance",
      title: t("headings.security.sectionCompliance"),
      description: t("messages.security.sectionCompliance"),
      icon: FileText,
      controls: buildComplianceControls(t),
    },
  ];
}

export function buildStandards(t: TFunction): { acronym: string; name: string; level: string }[] {
  return [
    { acronym: "NIST 800-63B", name: t("labels.security.standardNist80063b"), level: "AAL2" },
    { acronym: "OWASP ASVS", name: t("labels.security.standardOwaspAsvs"), level: "Level 2" },
    { acronym: "OWASP Top 10", name: t("labels.security.standardOwaspTop10"), level: t("labels.security.standardOwaspTop10Level") },
    { acronym: "RFC 6238", name: t("labels.security.standardRfc6238"), level: "TOTP" },
    { acronym: "RFC 6749", name: t("labels.security.standardRfc6749"), level: t("labels.security.standardRfc6749Level") },
    { acronym: "ISO/IEC 27001", name: t("labels.security.standardIso27001"), level: t("labels.security.standardIso27001Level") },
    { acronym: "SOC 2 Type II", name: t("labels.security.standardSoc2"), level: t("labels.security.statusRoadmap") },
    { acronym: "GDPR", name: t("labels.security.standardGdpr"), level: t("labels.security.standardGdprLevel") },
    { acronym: "CCPA", name: t("labels.security.standardCcpa"), level: t("labels.security.standardCcpaLevel") },
    { acronym: "OFAC", name: t("labels.security.standardOfac"), level: t("labels.security.standardOfacLevel") },
  ];
}
