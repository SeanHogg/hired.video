/**
 * /security — public CISO-facing marketing page that documents which
 * security controls hired.video implements, against which standards.
 *
 * Single source of truth for all "is hired.video secure?" claims. The
 * Trust badges in the footer, RFP responses, and any sales collateral
 * should link here rather than duplicating control lists.
 *
 * Honesty rule: every "Implemented" item must point to code/policy
 * that actually exists today. "In progress" = work has started.
 * "Roadmap" = committed but not started. Don't promote roadmap items
 * upward without a corresponding ship in main.
 */

import { Link, useLocation } from "react-router-dom";
import {
  Shield,
  Lock,
  KeyRound,
  Globe,
  ScanEye,
  AlertTriangle,
  CheckCircle2,
  Hourglass,
  CalendarClock,
  FileText,
  Mail,
  Fingerprint,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Status = "implemented" | "in_progress" | "roadmap";

type Control = {
  title: string;
  description: string;
  status: Status;
  refs: string[];
};

const STATUS_META: Record<Status, { labelKey: string; variant: "default" | "secondary" | "outline"; icon: typeof CheckCircle2 }> = {
  implemented: { labelKey: "labels.security.statusImplemented", variant: "default", icon: CheckCircle2 },
  in_progress: { labelKey: "labels.security.statusInProgress", variant: "secondary", icon: Hourglass },
  roadmap: { labelKey: "labels.security.statusRoadmap", variant: "outline", icon: CalendarClock },
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

type SectionDef = {
  id: string;
  title: string;
  description: string;
  icon: typeof Shield;
  controls: Control[];
};

function buildSections(t: TFunction): SectionDef[] {
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

function buildStandards(t: TFunction): { acronym: string; name: string; level: string }[] {
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

function StatusBadge({ status }: { status: Status }) {
  const { t } = useTranslation();
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant} className="gap-1 text-xs">
      <Icon className="h-3 w-3" />
      {t(meta.labelKey)}
    </Badge>
  );
}

function ControlCard({ control }: { control: Control }) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base leading-tight">{control.title}</CardTitle>
          <StatusBadge status={control.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <CardDescription className="text-sm leading-relaxed">
          {control.description}
        </CardDescription>
        <div className="flex flex-wrap gap-1.5">
          {control.refs.map((r) => (
            <span
              key={r}
              className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded"
            >
              {r}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ section }: { section: SectionDef }) {
  const Icon = section.icon;
  return (
    <section id={section.id} className="py-12 px-4 sm:px-6 lg:px-8 scroll-mt-24">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Icon className="h-6 w-6 text-primary" />
          <h2 className="text-2xl md:text-3xl font-bold">{section.title}</h2>
        </div>
        <p className="text-muted-foreground mb-8 max-w-3xl">{section.description}</p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {section.controls.map((c) => (
            <ControlCard key={c.title} control={c} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Security() {
  const location = useLocation();
  const { t } = useTranslation();
  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("headings.security.breadcrumb"), url: "/security" }]);

  const sections = buildSections(t);
  const standards = buildStandards(t);

  const counts = sections.reduce(
    (acc, s) => {
      for (const c of s.controls) acc[c.status] += 1;
      return acc;
    },
    { implemented: 0, in_progress: 0, roadmap: 0 } as Record<Status, number>,
  );

  return (
    <AppShell bgClassName="bg-background">
<div>
          {/* Hero */}
          <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 mb-6">
                <Shield className="h-12 w-12 text-primary" />
                <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  {t("headings.security.heroBrand")}
                </span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold mb-6">
                {t("headings.security.heroTitleLead")}{" "}
                <span className="bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  {t("headings.security.heroTitleHighlight")}
                </span>
              </h1>
              <p className="text-xl text-muted-foreground mb-8">
                {t("messages.security.heroSubtitle")}
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <Button asChild size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90">
                  <Link to="/security/sessions">{t("actions.security.manageSessions")}</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/contact">{t("actions.security.requestQuestionnaire")}</Link>
                </Button>
              </div>

              {/* Status counts */}
              <div className="grid grid-cols-3 gap-4 mt-12 max-w-2xl mx-auto">
                <div className="p-4 rounded-lg border bg-card">
                  <div className="text-3xl font-bold text-primary">{counts.implemented}</div>
                  <div className="text-sm text-muted-foreground mt-1">{t("labels.security.statusImplemented")}</div>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                  <div className="text-3xl font-bold">{counts.in_progress}</div>
                  <div className="text-sm text-muted-foreground mt-1">{t("labels.security.statusInProgress")}</div>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                  <div className="text-3xl font-bold">{counts.roadmap}</div>
                  <div className="text-sm text-muted-foreground mt-1">{t("labels.security.statusRoadmap")}</div>
                </div>
              </div>
            </div>
          </section>

          {/* Standards strip */}
          <section className="py-12 px-4 sm:px-6 lg:px-8 border-y">
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-6 text-center">
                {t("headings.security.standardsStrip")}
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {standards.map((s) => (
                  <div key={s.acronym} className="p-4 rounded-lg border bg-card text-center">
                    <div className="font-bold text-sm">{s.acronym}</div>
                    <div className="text-xs text-muted-foreground mt-1">{s.name}</div>
                    <div className="text-[11px] text-primary font-medium mt-2">{s.level}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Quick nav */}
          <section className="py-8 px-4 sm:px-6 lg:px-8 border-b">
            <div className="flex flex-wrap gap-2 justify-center">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="text-sm px-3 py-1.5 rounded-full border hover:bg-accent transition"
                >
                  {s.title}
                </a>
              ))}
            </div>
          </section>

          {sections.map((s) => (
            <Section key={s.id} section={s} />
          ))}

          {/* Disclosure */}
          <section className="py-16 px-4 sm:px-6 lg:px-8 bg-muted/30 border-t">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="h-6 w-6 text-primary" />
                <h2 className="text-2xl font-bold">{t("headings.security.disclosure")}</h2>
              </div>
              <p className="text-muted-foreground mb-6">
                {t("messages.security.disclosureLead")}{" "}
                <a className="text-primary underline" href="mailto:security@hired.video">
                  security@hired.video
                </a>{" "}
                {t("messages.security.disclosureBody")}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="outline">
                  <a href="mailto:security@hired.video">
                    <Mail className="h-4 w-4 mr-2" />
                    security@hired.video
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/privacy">
                    <FileText className="h-4 w-4 mr-2" />
                    {t("actions.security.privacyPolicy")}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/terms">
                    <FileText className="h-4 w-4 mr-2" />
                    {t("actions.security.termsOfService")}
                  </Link>
                </Button>
              </div>
            </div>
          </section>
</div>
</AppShell>
  );
}
