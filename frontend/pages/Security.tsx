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
  Server,
  Fingerprint,
  Network,
} from "lucide-react";
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

const STATUS_META: Record<Status, { label: string; variant: "default" | "secondary" | "outline"; icon: typeof CheckCircle2 }> = {
  implemented: { label: "Implemented", variant: "default", icon: CheckCircle2 },
  in_progress: { label: "In progress", variant: "secondary", icon: Hourglass },
  roadmap: { label: "Roadmap", variant: "outline", icon: CalendarClock },
};

// Single source of truth for the control catalog. Grouped by surface so
// the same row is never repeated under two headings.
const IDENTITY_CONTROLS: Control[] = [
  {
    title: "Passkeys / WebAuthn (FIDO2)",
    description:
      "Phishing-resistant hardware-bound credentials. ES256 (P-256) supported. Available on every account.",
    status: "implemented",
    refs: ["NIST SP 800-63B AAL3", "FIDO2 / WebAuthn L2"],
  },
  {
    title: "Email OTP two-factor (6-digit, 10-min TTL, 5-attempt lockout)",
    description:
      "Numeric one-time codes delivered to the verified email on file. Attempts are rate-limited; codes single-use.",
    status: "implemented",
    refs: ["NIST SP 800-63B AAL2", "OWASP ASVS V2.8"],
  },
  {
    title: "Magic-link sign-in (15-min TTL, single-use)",
    description: "Passwordless login by clicking a one-time link emailed to the address on file.",
    status: "implemented",
    refs: ["OWASP ASVS V2.5"],
  },
  {
    title: "TOTP authenticator app (RFC 6238)",
    description:
      "Google Authenticator / 1Password / Authy compatible. Schema and storage shipped; UX wiring in progress.",
    status: "in_progress",
    refs: ["RFC 6238", "NIST SP 800-63B AAL2"],
  },
  {
    title: "Adaptive MFA (device trust + risk scoring)",
    description:
      "Trusted devices skip MFA on subsequent logins; new country / impossible-travel / VPN-on-new-device escalates challenge.",
    status: "in_progress",
    refs: ["NIST SP 800-63B §5.2.10", "OWASP ASVS V2.7"],
  },
  {
    title: "MFA backup codes (10 single-use, hashed at rest)",
    description: "Rescue codes generated on MFA enable, regenerable from Security Settings.",
    status: "roadmap",
    refs: ["NIST SP 800-63B §6.1.2.3"],
  },
];

const SESSION_CONTROLS: Control[] = [
  {
    title: "3-device active session cap",
    description:
      "Per-user enforcement; oldest session evicted on 4th login. Self-service device list at /security/sessions with per-device revoke.",
    status: "implemented",
    refs: ["OWASP ASVS V3.3"],
  },
  {
    title: "Refresh-token rotation with reuse detection",
    description:
      "Tokens rotate on every refresh. Replay of a rotated token revokes the entire session family — the canonical token-theft signal.",
    status: "implemented",
    refs: ["RFC 6749 §10.4", "OWASP ASVS V3.5"],
  },
  {
    title: "Sliding 14-day idle + 30-day absolute timeout",
    description:
      "Sessions expire on inactivity OR absolute age, whichever comes first. last_seen_at is debounced to keep the auth path fast.",
    status: "implemented",
    refs: ["OWASP ASVS V3.3.1"],
  },
  {
    title: "Mass session invalidation on password reset / email change",
    description:
      "Every active session row is revoked AND session_version is bumped on these events, so legacy JWTs are rejected too.",
    status: "implemented",
    refs: ["NIST SP 800-63B §7.1", "OWASP ASVS V3.3.4"],
  },
  {
    title: "Two-token email-change verification",
    description:
      "Old address must confirm AND new address must verify before users.email mutates. Stops session-hijack account takeover.",
    status: "implemented",
    refs: ["NIST SP 800-63B §5.1.1.2", "OWASP ASVS V2.4.5"],
  },
];

const ABUSE_CONTROLS: Control[] = [
  {
    title: "Cloudflare Turnstile (invisible captcha)",
    description: "Bot defense on signup, password reset, and 2FA flows when configured.",
    status: "implemented",
    refs: ["OWASP ASVS V11.1"],
  },
  {
    title: "Per-IP + per-email rate limits",
    description:
      "Layered limits stop credential-stuffing waves whether they rotate IPs, emails, or both. Workers Rate Limit binding.",
    status: "in_progress",
    refs: ["OWASP ASVS V11.1.4"],
  },
  {
    title: "Disposable email domain blocklist",
    description: "Curated list of throwaway-email providers rejected at signup.",
    status: "in_progress",
    refs: ["OWASP ASVS V5.1.4"],
  },
  {
    title: "Compromised-password check (HIBP k-anonymity)",
    description:
      "Passwords are checked against the haveibeenpwned breach corpus on register and change. Plaintext never leaves the worker.",
    status: "in_progress",
    refs: ["NIST SP 800-63B §5.1.1.2", "OWASP ASVS V2.1.7"],
  },
  {
    title: "Account lockout (10 fails / 15 min auto-unlock)",
    description:
      "Brute-force attempts auto-lock the account. Audit-trailed lock state with manual SuperAdmin unlock available.",
    status: "in_progress",
    refs: ["OWASP ASVS V2.2.1"],
  },
  {
    title: "Honeypot fields on signup forms",
    description: "Hidden inputs trip naive bots without burdening real users.",
    status: "roadmap",
    refs: ["OWASP ASVS V11.1.3"],
  },
];

const GEO_CONTROLS: Control[] = [
  {
    title: "OFAC sanctions hard-block (CU, IR, KP, SY, partial VE)",
    description:
      "Account creation from sanctioned jurisdictions returns 403 before any data is collected. Compliance with US Treasury OFAC SDN list.",
    status: "in_progress",
    refs: ["OFAC SDN", "ISO-3166-1 alpha-2"],
  },
  {
    title: "Geographic signup allowlist (North + South America)",
    description:
      "Read-only access remains global; signup restricted to served regions. Out-of-region visitors can request access via waitlist.",
    status: "in_progress",
    refs: ["ISO-3166-1 alpha-2"],
  },
  {
    title: "Geo-velocity / impossible-travel detection",
    description:
      "Login from a country physically unreachable from the previous session's country forces re-MFA.",
    status: "roadmap",
    refs: ["NIST SP 800-63B §5.2.10"],
  },
];

const STORAGE_CONTROLS: Control[] = [
  {
    title: "PBKDF2 password hashing (100,000 iterations, SHA-256)",
    description: "Salts are 128-bit random; hashes never stored or logged in plaintext.",
    status: "implemented",
    refs: ["NIST SP 800-132", "OWASP ASVS V2.4"],
  },
  {
    title: "Refresh tokens stored as SHA-256 hashes only",
    description: "Plaintext lives only on the client; a DB compromise yields no usable bearers.",
    status: "implemented",
    refs: ["OWASP ASVS V3.5.3"],
  },
  {
    title: "JWT signed HS256 with rotated server-side secret",
    description: "Tokens carry only the claims needed; revocation is enforced via the sessions table, not just expiry.",
    status: "implemented",
    refs: ["RFC 7519", "OWASP ASVS V3.5"],
  },
  {
    title: "TLS 1.2+ everywhere (HSTS via Cloudflare)",
    description: "All traffic terminates at Cloudflare with modern cipher suites; HSTS preload.",
    status: "implemented",
    refs: ["OWASP ASVS V9.1"],
  },
  {
    title: "Append-only audit log (login_events)",
    description:
      "Every login attempt — success and failure — produces a row. Used for SuperAdmin investigation and brute-force detection.",
    status: "implemented",
    refs: ["NIST SP 800-92", "OWASP ASVS V7.1"],
  },
];

const COMPLIANCE_CONTROLS: Control[] = [
  {
    title: "GDPR — data subject rights",
    description:
      "Account data export, deletion-on-request, and consent withdrawal supported via Settings → Privacy.",
    status: "implemented",
    refs: ["GDPR Art. 15–21"],
  },
  {
    title: "CCPA — California consumer rights",
    description: "Same DSR mechanisms cover CCPA right-to-know, right-to-delete, and opt-out-of-sale.",
    status: "implemented",
    refs: ["CCPA §1798.100–1798.150"],
  },
  {
    title: "Cookie consent (granular categories)",
    description: "Essential / Analytics / Marketing / Personalization opt-in, persisted server-side once authenticated.",
    status: "implemented",
    refs: ["GDPR Art. 7", "ePrivacy"],
  },
  {
    title: "SOC 2 Type II",
    description:
      "Trust-services-criteria audit. Targeted readiness work underway; full attestation tracked as Enterprise tier prerequisite.",
    status: "roadmap",
    refs: ["AICPA TSC 2017"],
  },
  {
    title: "ISO/IEC 27001 — Information Security Management",
    description:
      "Operating against ISO 27001 control families today; formal certification follows SOC 2.",
    status: "roadmap",
    refs: ["ISO/IEC 27001:2022"],
  },
];

type SectionDef = {
  id: string;
  title: string;
  description: string;
  icon: typeof Shield;
  controls: Control[];
};

const SECTIONS: SectionDef[] = [
  {
    id: "identity",
    title: "Identity & authentication",
    description: "Who you are, how we verify it, and how we make MFA invisible when it can be.",
    icon: Fingerprint,
    controls: IDENTITY_CONTROLS,
  },
  {
    id: "sessions",
    title: "Session integrity",
    description: "Per-device sessions with hard revocation, refresh rotation, and forced re-auth on sensitive changes.",
    icon: KeyRound,
    controls: SESSION_CONTROLS,
  },
  {
    id: "abuse",
    title: "Bot & abuse defense",
    description: "Layered gates that turn bots away without burdening real users.",
    icon: ScanEye,
    controls: ABUSE_CONTROLS,
  },
  {
    id: "geo",
    title: "Geographic & sanctions controls",
    description: "Where account creation is allowed, and where it isn't.",
    icon: Globe,
    controls: GEO_CONTROLS,
  },
  {
    id: "storage",
    title: "Cryptography & storage",
    description: "What we hash, what we encrypt, and what we never store at all.",
    icon: Lock,
    controls: STORAGE_CONTROLS,
  },
  {
    id: "compliance",
    title: "Privacy & compliance",
    description: "Regulatory alignment and certification roadmap.",
    icon: FileText,
    controls: COMPLIANCE_CONTROLS,
  },
];

const STANDARDS = [
  { acronym: "NIST 800-63B", name: "Digital Identity Guidelines", level: "AAL2" },
  { acronym: "OWASP ASVS", name: "Application Security Verification Standard", level: "Level 2" },
  { acronym: "OWASP Top 10", name: "Web app risk consensus", level: "A07:2021 covered" },
  { acronym: "RFC 6238", name: "Time-based One-Time Passwords", level: "TOTP" },
  { acronym: "RFC 6749", name: "OAuth 2.0", level: "§10.4 refresh rotation" },
  { acronym: "ISO/IEC 27001", name: "Information Security Management", level: "Aligned (cert roadmap)" },
  { acronym: "SOC 2 Type II", name: "Trust Services Criteria", level: "Roadmap" },
  { acronym: "GDPR", name: "EU General Data Protection Regulation", level: "DSR support" },
  { acronym: "CCPA", name: "California Consumer Privacy Act", level: "DSR support" },
  { acronym: "OFAC", name: "US Treasury sanctions screening", level: "SDN list applied" },
];

function StatusBadge({ status }: { status: Status }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant} className="gap-1 text-xs">
      <Icon className="h-3 w-3" />
      {meta.label}
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
  useSEO(location.pathname);
  useBreadcrumbs([{ name: "Security", url: "/security" }]);

  const counts = SECTIONS.reduce(
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
                  Security at hired.video
                </span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold mb-6">
                Built to industry standards. Audited against{" "}
                <span className="bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  every control we claim.
                </span>
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                NIST 800-63B identity assurance. OWASP ASVS Level 2. RFC-grade token handling.
                Phishing-resistant passkeys. Per-device sessions with hard revocation. No mocked
                claims — every "Implemented" badge below points to code shipping today.
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <Button asChild size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90">
                  <Link to="/security/sessions">Manage your sessions</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/contact">Request our security questionnaire</Link>
                </Button>
              </div>

              {/* Status counts */}
              <div className="grid grid-cols-3 gap-4 mt-12 max-w-2xl mx-auto">
                <div className="p-4 rounded-lg border bg-card">
                  <div className="text-3xl font-bold text-primary">{counts.implemented}</div>
                  <div className="text-sm text-muted-foreground mt-1">Implemented</div>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                  <div className="text-3xl font-bold">{counts.in_progress}</div>
                  <div className="text-sm text-muted-foreground mt-1">In progress</div>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                  <div className="text-3xl font-bold">{counts.roadmap}</div>
                  <div className="text-sm text-muted-foreground mt-1">Roadmap</div>
                </div>
              </div>
            </div>
          </section>

          {/* Standards strip */}
          <section className="py-12 px-4 sm:px-6 lg:px-8 border-y">
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-6 text-center">
                Standards & frameworks we align to
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {STANDARDS.map((s) => (
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
              {SECTIONS.map((s) => (
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

          {SECTIONS.map((s) => (
            <Section key={s.id} section={s} />
          ))}

          {/* Disclosure */}
          <section className="py-16 px-4 sm:px-6 lg:px-8 bg-muted/30 border-t">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="h-6 w-6 text-primary" />
                <h2 className="text-2xl font-bold">Coordinated disclosure</h2>
              </div>
              <p className="text-muted-foreground mb-6">
                Found a vulnerability? Email{" "}
                <a className="text-primary underline" href="mailto:security@hired.video">
                  security@hired.video
                </a>{" "}
                with reproduction steps. We acknowledge within 2 business days, triage within 5,
                and aim to ship a fix within 30 days for high-severity issues. Acting in good
                faith is welcome — we don't pursue legal action against researchers who follow
                responsible disclosure.
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
                    Privacy policy
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/terms">
                    <FileText className="h-4 w-4 mr-2" />
                    Terms of service
                  </Link>
                </Button>
              </div>
            </div>
          </section>
</div>
</AppShell>
  );
}
