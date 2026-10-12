/**
 * Region-specific privacy sections for the dynamic Privacy / Terms / Cookie
 * pages. Each component self-gates via JurisdictionSection (DRY) — consumers
 * mount them all unconditionally; the matching ones render, the rest
 * return null. New jurisdictions plug in by adding a component here.
 *
 * The "viewing as" selector at the top of the page is the only thing that
 * lets a visitor see a section that wouldn't normally apply to them — used
 * for legal review + regulator inspection + user self-service.
 *
 * Translation: copy uses `useTranslation()` with stable keys under
 * `privacy.regional.<jurisdiction>.*`. The default English string passes
 * through until the locale catalogue fills in.
 */

import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  LegalSection,
  LegalSectionContent,
  LegalSectionDescription,
  LegalSectionHeader,
  LegalSectionTitle,
} from "./LegalDocument";
import { JurisdictionSection } from "./JurisdictionSection";

const PRIVACY_OFFICER_MAILBOX = "privacy@hired.video";

function PrivacyOfficerLink({ children }: { children: React.ReactNode }) {
  return (
    <a href={`mailto:${PRIVACY_OFFICER_MAILBOX}`} className="underline hover:text-foreground">
      {children}
    </a>
  );
}

/** California — CCPA / CPRA. Applies to California residents only.
 *  Spelled out at jurisdiction granularity (US-CA) so a Texas user reading
 *  the same page doesn't get a California-only block prepended. */
export function USCaliforniaRightsSection() {
  const { t } = useTranslation();
  return (
    <JurisdictionSection patterns={["US-CA"]}>
      <LegalSection>
        <LegalSectionHeader>
          <LegalSectionTitle>{t("privacy.regional.usCA.title", "Your California Privacy Rights (CCPA / CPRA)")}</LegalSectionTitle>
          <LegalSectionDescription>
            {t(
              "privacy.regional.usCA.intro",
              "As a California resident, you have specific rights under the California Consumer Privacy Act and the California Privacy Rights Act.",
            )}
          </LegalSectionDescription>
        </LegalSectionHeader>
        <LegalSectionContent className="space-y-3 text-sm text-muted-foreground">
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>{t("privacy.regional.usCA.right.know", "Right to know what categories of personal information we collect and how we use them.")}</li>
            <li>{t("privacy.regional.usCA.right.access", "Right to access the specific pieces of personal information we hold about you.")}</li>
            <li>{t("privacy.regional.usCA.right.delete", "Right to request deletion of your personal information (subject to legal exceptions).")}</li>
            <li>{t("privacy.regional.usCA.right.correct", "Right to correct inaccurate personal information.")}</li>
            <li>{t("privacy.regional.usCA.right.optOut", "Right to opt out of the sale or sharing of personal information for targeted advertising.")}</li>
            <li>{t("privacy.regional.usCA.right.limit", "Right to limit the use of sensitive personal information.")}</li>
            <li>{t("privacy.regional.usCA.right.nondiscrimination", "Right to non-discrimination for exercising any of these rights.")}</li>
          </ul>
          <p>
            {t("privacy.regional.usCA.howTo", "To exercise these rights, use our")}{" "}
            <a href="/privacy/opt-out" className="underline hover:text-foreground">
              {t("privacy.regional.usCA.optOutLink", "Do Not Sell or Share My Personal Information")}
            </a>{" "}
            {t("privacy.regional.usCA.page", "page or email")}{" "}
            <PrivacyOfficerLink>{PRIVACY_OFFICER_MAILBOX}</PrivacyOfficerLink>.
          </p>
          <p>
            {t(
              "privacy.regional.usCA.gpc",
              "We honor the Global Privacy Control (GPC) browser signal as an opt-out of sale and sharing.",
            )}
          </p>
          <p className="text-xs">
            {t(
              "privacy.regional.usCA.responseTime",
              "We respond to verifiable consumer requests within 45 days (subject to a 45-day extension where reasonably necessary).",
            )}
          </p>
        </LegalSectionContent>
      </LegalSection>
    </JurisdictionSection>
  );
}

/** Canada — PIPEDA (federal). Applies to all Canadian residents. Quebec
 *  Law 25 is layered on top via QuebecLaw25Section. */
export function PIPEDARightsSection() {
  const { t } = useTranslation();
  return (
    <JurisdictionSection patterns={["CA-*", "CA"]}>
      <LegalSection>
        <LegalSectionHeader>
          <LegalSectionTitle>{t("privacy.regional.pipeda.title", "Your Rights Under PIPEDA (Canada)")}</LegalSectionTitle>
          <LegalSectionDescription>
            {t(
              "privacy.regional.pipeda.intro",
              "Under Canada's Personal Information Protection and Electronic Documents Act (PIPEDA), you have the following rights regarding personal information held by hired.video.",
            )}
          </LegalSectionDescription>
        </LegalSectionHeader>
        <LegalSectionContent className="space-y-3 text-sm text-muted-foreground">
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>{t("privacy.regional.pipeda.right.consent", "Right to be informed about and consent to the collection, use and disclosure of your personal information.")}</li>
            <li>{t("privacy.regional.pipeda.right.access", "Right to access your personal information and be informed of how it has been used and to whom it has been disclosed.")}</li>
            <li>{t("privacy.regional.pipeda.right.correction", "Right to challenge the accuracy of your personal information and have it corrected.")}</li>
            <li>{t("privacy.regional.pipeda.right.withdraw", "Right to withdraw consent at any time, subject to legal or contractual restrictions and reasonable notice.")}</li>
            <li>{t("privacy.regional.pipeda.right.complaint", "Right to file a complaint with the Office of the Privacy Commissioner of Canada.")}</li>
          </ul>
          <p>
            <strong>{t("privacy.regional.pipeda.officerLabel", "Privacy Officer:")}</strong>{" "}
            {t("privacy.regional.pipeda.officerName", "Our designated Privacy Officer can be reached at")}{" "}
            <PrivacyOfficerLink>{PRIVACY_OFFICER_MAILBOX}</PrivacyOfficerLink>.{" "}
            {t(
              "privacy.regional.pipeda.officerResponse",
              "We will respond to access and correction requests within 30 days as required by PIPEDA.",
            )}
          </p>
          <p>
            {t(
              "privacy.regional.pipeda.crossBorder",
              "Your personal information may be stored and processed on servers located in the United States. We maintain contractual and technical safeguards to ensure a comparable level of protection consistent with PIPEDA's accountability principle.",
            )}
          </p>
          <p className="text-xs">
            {t("privacy.regional.pipeda.regulator", "Regulator:")}{" "}
            <a
              href="https://www.priv.gc.ca/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground inline-flex items-center gap-0.5"
            >
              Office of the Privacy Commissioner of Canada
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </p>
        </LegalSectionContent>
      </LegalSection>
    </JurisdictionSection>
  );
}

/** Quebec — Law 25 (in force). Stricter than PIPEDA: named Privacy
 *  Officer (mandatory + must be publicly designated), mandatory consent for
 *  biometric/sensitive data, automated-decision disclosure, French parity. */
export function QuebecLaw25Section() {
  const { t } = useTranslation();
  return (
    <JurisdictionSection patterns={["CA-QC"]}>
      <LegalSection>
        <LegalSectionHeader>
          <LegalSectionTitle>{t("privacy.regional.quebecLaw25.title", "Quebec — Additional Rights Under Law 25")}</LegalSectionTitle>
          <LegalSectionDescription>
            {t(
              "privacy.regional.quebecLaw25.intro",
              "Residents of Quebec benefit from additional protections under An Act respecting the protection of personal information in the private sector (Law 25 / RLRQ c P-39.1).",
            )}
          </LegalSectionDescription>
        </LegalSectionHeader>
        <LegalSectionContent className="space-y-3 text-sm text-muted-foreground">
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>{t("privacy.regional.quebecLaw25.right.namedOfficer", "Right to direct contact with our publicly-designated Person in Charge of Protection of Personal Information.")}</li>
            <li>{t("privacy.regional.quebecLaw25.right.portability", "Right to receive your personal information in a structured, commonly used technological format (data portability).")}</li>
            <li>{t("privacy.regional.quebecLaw25.right.deindexation", "Right to request de-indexation or cessation of dissemination of personal information that contravenes the law or a court order.")}</li>
            <li>{t("privacy.regional.quebecLaw25.right.automatedDecision", "Right to be informed when a decision is based exclusively on automated processing of your personal information, and to request human review.")}</li>
            <li>{t("privacy.regional.quebecLaw25.right.biometric", "Right to refuse the collection of biometric data (including voice prints used for voice-cloning features); explicit consent is required before any such collection.")}</li>
          </ul>
          <p>
            <strong>{t("privacy.regional.quebecLaw25.officerLabel", "Person in Charge of Protection of Personal Information:")}</strong>{" "}
            {t(
              "privacy.regional.quebecLaw25.officerBody",
              "As required by Law 25 § 8.1, our designated officer for Quebec residents is reachable at",
            )}{" "}
            <PrivacyOfficerLink>{PRIVACY_OFFICER_MAILBOX}</PrivacyOfficerLink>.
          </p>
          <p>
            {t(
              "privacy.regional.quebecLaw25.crossBorderAssessment",
              "We have conducted an assessment of the protections offered for personal information communicated outside Quebec (United States) and apply contractual safeguards equivalent to Quebec standards.",
            )}
          </p>
          <p className="text-xs">
            {t("privacy.regional.quebecLaw25.regulator", "Regulator:")}{" "}
            <a
              href="https://www.cai.gouv.qc.ca/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground inline-flex items-center gap-0.5"
            >
              Commission d'accès à l'information du Québec
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </p>
        </LegalSectionContent>
      </LegalSection>
    </JurisdictionSection>
  );
}

/** Mexico — LFPDPPP. ARCO rights, regulator INAI. Scaffolded for Phase 2;
 *  copy is the LFPDPPP-required baseline so the page is functional today. */
export function MexicoARCOSection() {
  const { t } = useTranslation();
  return (
    <JurisdictionSection patterns={["MX"]}>
      <LegalSection>
        <LegalSectionHeader>
          <LegalSectionTitle>{t("privacy.regional.mxARCO.title", "Tus Derechos ARCO (Mexico — LFPDPPP)")}</LegalSectionTitle>
          <LegalSectionDescription>
            {t(
              "privacy.regional.mxARCO.intro",
              "Under Mexico's Federal Law on Protection of Personal Data Held by Private Parties (LFPDPPP), you have the right to Access, Rectify, Cancel, and Oppose (ARCO) the processing of your personal data.",
            )}
          </LegalSectionDescription>
        </LegalSectionHeader>
        <LegalSectionContent className="space-y-3 text-sm text-muted-foreground">
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>{t("privacy.regional.mxARCO.right.access", "Acceso — request access to your personal data and information about how it is processed.")}</li>
            <li>{t("privacy.regional.mxARCO.right.rectify", "Rectificación — request correction of inaccurate or incomplete personal data.")}</li>
            <li>{t("privacy.regional.mxARCO.right.cancel", "Cancelación — request that we cease processing your personal data when it is no longer required.")}</li>
            <li>{t("privacy.regional.mxARCO.right.oppose", "Oposición — object to the processing of your personal data for specific purposes.")}</li>
            <li>{t("privacy.regional.mxARCO.right.revokeConsent", "Right to revoke previously granted consent at any time.")}</li>
          </ul>
          <p>
            <strong>{t("privacy.regional.mxARCO.designatedPersonLabel", "Persona Designada:")}</strong>{" "}
            {t(
              "privacy.regional.mxARCO.designatedPersonBody",
              "As required by LFPDPPP Art. 30, our designated person for ARCO requests from Mexican residents is reachable at",
            )}{" "}
            <PrivacyOfficerLink>{PRIVACY_OFFICER_MAILBOX}</PrivacyOfficerLink>.
          </p>
          <p>
            {t(
              "privacy.regional.mxARCO.crossBorder",
              "Your personal data may be transferred to and stored in the United States. By creating an account you are notified of and consent to this transfer.",
            )}
          </p>
          <p className="text-xs">
            {t("privacy.regional.mxARCO.regulator", "Regulator:")}{" "}
            <a
              href="https://home.inai.org.mx/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground inline-flex items-center gap-0.5"
            >
              Instituto Nacional de Transparencia, Acceso a la Información y Protección de Datos Personales (INAI)
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </p>
        </LegalSectionContent>
      </LegalSection>
    </JurisdictionSection>
  );
}

/** EU / EEA + UK — GDPR rights. Layered on top of the base notice. UK
 *  GDPR is treated identically here since the substantive rights match;
 *  divergence is tracked under #1152 for the EU phase. */
export function GDPRRightsSection() {
  const { t } = useTranslation();
  return (
    <JurisdictionSection patterns={["EEA-*", "EEA", "UK"]}>
      <LegalSection>
        <LegalSectionHeader>
          <LegalSectionTitle>{t("privacy.regional.gdpr.title", "Your Rights Under the GDPR")}</LegalSectionTitle>
          <LegalSectionDescription>
            {t(
              "privacy.regional.gdpr.intro",
              "If you are located in the European Economic Area or the United Kingdom, the General Data Protection Regulation (GDPR) gives you the following rights regarding your personal data.",
            )}
          </LegalSectionDescription>
        </LegalSectionHeader>
        <LegalSectionContent className="space-y-3 text-sm text-muted-foreground">
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>{t("privacy.regional.gdpr.right.access", "Right of access (Art. 15) — obtain confirmation of and a copy of the personal data we hold about you.")}</li>
            <li>{t("privacy.regional.gdpr.right.rectification", "Right to rectification (Art. 16) — have inaccurate personal data corrected.")}</li>
            <li>{t("privacy.regional.gdpr.right.erasure", "Right to erasure / 'right to be forgotten' (Art. 17) — have your personal data deleted under specified conditions.")}</li>
            <li>{t("privacy.regional.gdpr.right.restriction", "Right to restriction of processing (Art. 18).")}</li>
            <li>{t("privacy.regional.gdpr.right.portability", "Right to data portability (Art. 20) — receive your data in a structured, commonly used, machine-readable format.")}</li>
            <li>{t("privacy.regional.gdpr.right.object", "Right to object to processing (Art. 21), including for direct marketing.")}</li>
            <li>{t("privacy.regional.gdpr.right.automated", "Right not to be subject to a decision based solely on automated processing, including profiling (Art. 22).")}</li>
            <li>{t("privacy.regional.gdpr.right.complaint", "Right to lodge a complaint with a supervisory authority.")}</li>
          </ul>
          <p>
            <strong>{t("privacy.regional.gdpr.dpoLabel", "Data Protection Officer:")}</strong>{" "}
            <PrivacyOfficerLink>{PRIVACY_OFFICER_MAILBOX}</PrivacyOfficerLink>.{" "}
            {t(
              "privacy.regional.gdpr.dpoResponse",
              "We respond to data subject requests within one month, extendable by two further months for complex requests, in line with Art. 12(3).",
            )}
          </p>
          <p className="text-xs">
            {t(
              "privacy.regional.gdpr.transferBasis",
              "Personal data transfers to the United States rely on the EU-US Data Privacy Framework where applicable and, where not, on Standard Contractual Clauses approved by the European Commission.",
            )}
          </p>
        </LegalSectionContent>
      </LegalSection>
    </JurisdictionSection>
  );
}
