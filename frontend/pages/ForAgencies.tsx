/**
 * Marketing landing for staffing-agency / recruiting-back-office buyers
 * (#1349 Bullhorn-lite).
 *
 * Follows the AffiliateProgram.tsx canonical pattern per the
 * `[[feedback_new_page_checklist]]` memory: AppShell wrapper, useSEO +
 * useBreadcrumbs, PAGE_SEO entry under `/for-agencies`, MarketingFAQ
 * at the bottom for AI Overview / FAQPage schema eligibility.
 */
import MarketingFAQ from "@/components/MarketingFAQ";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import { Link } from "react-router-dom";
import {
  Briefcase,
  Clock,
  ClipboardCheck,
  DollarSign,
  FileText,
  Plug,
  Send,
  Shield,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";

const FEATURE_BLOCKS = [
  {
    icon: Clock,
    title: "Punch in / out against tasks",
    body: "Workforce members punch time on /tasks. One open entry per user — invariant enforced server-side. Real-time elapsed timer + week table + history view, ready out of the box.",
  },
  {
    icon: ClipboardCheck,
    title: "Weekly timesheet workflow",
    body: "Employees submit weeks, employers approve / reject with required reason, rejected weeks unlock for re-submit. Full audit trail via timesheet_touchpoints — never wonder who approved what.",
  },
  {
    icon: DollarSign,
    title: "Auto-derive invoice + contractor pay",
    body: "Approve a timesheet → invoice line item against the placement's bill rate + contractor payout-ledger accrual against the pay rate. Idempotent on re-approve. Helcim push live; QBO / Xero / Gusto ready to connect.",
  },
  {
    icon: TrendingUp,
    title: "Desk margin reporting",
    body: "Per-placement YTD revenue, contractor pay, gross margin, approved-timesheet count. Sorted by margin descending. Direct drill-through to the placement detail screen.",
  },
  {
    icon: FileText,
    title: "Compliance doc vault",
    body: "I-9, W-9, W-8BEN, COI, BG check, MSA, contract artefacts. Upload to R2, mark signed (native flow) or route through DocuSign. Expiry tracking + nightly cleanup.",
  },
  {
    icon: Plug,
    title: "Integrations on day one",
    body: "Connect QuickBooks Online, Xero, Gusto, DocuSign, Helcim. Workforce derivation pushes invoices outbound automatically. Connect / disconnect from /settings → Workforce.",
  },
];

const PRICING_LINE = "$9.95 per active employee per month, all-in. Same universal seat price as the rest of the platform. Cancel any seat any time — billing reconciles next cycle.";

const FAQ_ITEMS = [
  {
    question: "How is this different from Bullhorn or Vincere?",
    answer:
      "Bullhorn-class platforms charge $99–$200/seat/mo for the same workflow we ship at $9.95 per active employee. We focus on the recruiting-vertical workflow (placements, timesheets, candidate-bound docs, desk margin) and push the generic accounting + payroll work to your existing QuickBooks / Xero / Gusto via outbound connectors. You keep the systems your accountant already runs; we add the placement-and-timesheet layer on top.",
  },
  {
    question: "Do I have to use Helcim for billing?",
    answer:
      "Helcim is the default because it's wired live for invoice push + recurring seat amounts. If you already run QuickBooks Online, Xero, or Gusto, you can connect those instead from Settings → Workforce → Integrations. Each new approved timesheet generates an invoice locally; the configured provider gets the push outbound. The local invoice + payout ledger stays the canonical source so connector retries are safe.",
  },
  {
    question: "How does seat billing actually work?",
    answer:
      "Every active employee in your workspace counts as one $9.95/mo seat. When you invite an employee and they accept, the seat count goes up + your subscription amount updates. When you deactivate an employee from the roster, the seat count drops and the next cycle bills less. No multi-tier confusion, no per-feature add-ons.",
  },
  {
    question: "Can my employees use the rest of the platform?",
    answer:
      "Yes. Employees get a full dashboard with social features, content posting, and engagement on hired.video — adoption is part of the value, not boxed-in time tracking. They just don't show up in candidate-discovery surfaces (since they're not on the job market while employed by you).",
  },
  {
    question: "How do timesheets become invoices?",
    answer:
      "Every active contract placement carries a bill rate (what you charge the client) and a pay rate (what you pay the contractor). When an employer approves a weekly timesheet, the workforce service automatically: (1) creates an invoice line item using billable hours × bill rate, (2) records a payout-ledger accrual using total hours × pay rate, (3) emits a billing_events audit row, (4) pushes the invoice through your configured accounting connector. Idempotent on re-approve — no double-billing.",
  },
  {
    question: "Where do compliance documents (I-9, W-9, etc.) live?",
    answer:
      "Documents attach to a placement or to a company-bound employee. Upload the file to our R2 storage, mark signed manually (native flow) or route through DocuSign for a full audit trail. Each doc has a kind enum (i9 / w9 / w8ben / coi / bg_check / msa / sow / offer_letter / nda / other), optional expiry, and pending → signed → expired → revoked status. Expired docs flag automatically on the nightly cron.",
  },
  {
    question: "Can I print or export timesheets and invoices?",
    answer:
      "Yes. Every timesheet and invoice has a print URL that returns an A4-styled print-ready HTML page — your browser converts it to PDF via Print → Save as PDF. Click the printer icon next to any timesheet row in the approval queue, the My Timesheets list, or a placement's Timesheets tab.",
  },
  {
    question: "What about commission splits?",
    answer:
      "Already supported. The placements aggregate carries a placementSplits child table for commission % across recruiters, sourcers, and managers. Set the split when you create the placement; the commission engine fans out per row so a 50/50 placement shows the correct half on each recruiter's commission ledger.",
  },
  {
    question: "Do I need a separate account for my employees?",
    answer:
      "No — invite-only flow. From Settings → Account & Billing, invite an employee by email with role=employee. They get an email link; if they're new they sign up with that same email first, then accept — which links them to your workspace via user_company_role_associations. They sign in with their own credentials; nothing shared.",
  },
  {
    question: "How do I see how my recruiters are performing?",
    answer:
      "The Workforce → Desk margin section shows per-placement YTD revenue, contractor pay, and gross margin, grouped by recruiter on the placement. Click any row to drill into the placement detail screen — Overview / Documents / Timesheets / Margin tabs. Sources from approved-timesheet derivations only, so the numbers always match what was actually invoiced.",
  },
];

export default function ForAgencies() {
  useSEO("/for-agencies");
  useBreadcrumbs([{ name: "For agencies", url: "/for-agencies" }]);

  return (
    <AppShell bgClassName="bg-background">
      <main className="max-w-6xl mx-auto px-4 md:px-6">
        {/* Hero */}
        <section className="py-12 md:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                <Briefcase className="h-4 w-4" />
                For staffing & recruiting agencies
              </div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
                Bullhorn-class back-office at one tenth the price.
              </h1>
              <p className="text-muted-foreground text-lg">
                Place candidates, capture time, approve timesheets, derive invoices,
                track desk margin, manage compliance docs — all inside the same
                platform your recruiters already use to source.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button size="lg" asChild>
                  <Link to="/signup?role=employer">
                    Start free <ArrowRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/guides/workforce">Read the guide</Link>
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{PRICING_LINE}</p>
            </div>

            <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
              <CardHeader>
                <CardTitle className="text-lg">What you get out of the box</CardTitle>
                <CardDescription>Phases 0 through 4, live in production.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {[
                  "Invite-only employee role + workspace binding",
                  "Punch in / out + week aggregation",
                  "Submit / approve / reject lifecycle + audit log",
                  "Invoice + payout ledger derivation on approve",
                  "Desk margin reporting per placement",
                  "Placement detail screen with 4 tabs",
                  "Compliance doc vault on R2",
                  "Helcim push live · QBO / Xero / Gusto / DocuSign ready",
                  "Print → PDF for every timesheet + invoice",
                ].map((line) => (
                  <div key={line} className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                    <span>{line}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Features grid */}
        <section className="py-10 border-t">
          <h2 className="text-3xl font-bold tracking-tight mb-8">Built for agency operators</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURE_BLOCKS.map((f) => {
              const Icon = f.icon;
              return (
                <Card key={f.title}>
                  <CardHeader>
                    <Icon className="h-6 w-6 text-primary mb-2" />
                    <CardTitle className="text-lg">{f.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{f.body}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Workflow story */}
        <section className="py-10 border-t">
          <h2 className="text-3xl font-bold tracking-tight mb-8">A typical week</h2>
          <ol className="space-y-6">
            {[
              {
                step: "Monday",
                icon: Send,
                title: "Contractor punches in",
                body: "Employee opens /tasks → Timesheet, hits Punch in, adds optional notes, flags billable. The active row appears with a live elapsed timer.",
              },
              {
                step: "Friday",
                icon: Clock,
                title: "Contractor submits the week",
                body: "Punch in / out entries accumulate over the week. On Friday the employee clicks Submit week — totals freeze, the entries lock, and the employer's approval queue lights up.",
              },
              {
                step: "Monday morning",
                icon: ClipboardCheck,
                title: "Employer approves",
                body: "Recruiter or employer reviews the queue in /settings → Workforce. One click approves → invoice line item generates against the placement's bill rate, payout ledger accrual against the pay rate, billing_events audit row fires, Helcim invoice goes out.",
              },
              {
                step: "Anytime",
                icon: TrendingUp,
                title: "Margin's already there",
                body: "The Desk margin card already shows revenue, contractor pay, and gross margin updated. Drill into any placement for the per-engagement breakdown.",
              },
            ].map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.step} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                      {i + 1}
                    </div>
                    {i < 3 && <div className="w-px flex-1 bg-border mt-2" />}
                  </div>
                  <div className="flex-1 pb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">{s.step}</span>
                    </div>
                    <h3 className="font-semibold text-lg">{s.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{s.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Trust / safety */}
        <section className="py-10 border-t">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <Shield className="h-8 w-8 text-primary mb-3" />
              <h2 className="text-2xl font-bold mb-2">Money rails stay where they belong</h2>
              <p className="text-muted-foreground">
                We don't run payroll or own ACH. Approved timesheets push outbound
                to your QuickBooks / Xero / Gusto / Helcim setup — the systems
                your accountant already trusts. We're the recruiting layer; your
                GL stays sovereign.
              </p>
            </div>
            <div>
              <FileText className="h-8 w-8 text-primary mb-3" />
              <h2 className="text-2xl font-bold mb-2">Compliance without the spreadsheet</h2>
              <p className="text-muted-foreground">
                I-9 expiry, COI renewal, contract attestation — every doc has a
                kind, status, and expiry. Nightly cron flips overdue docs to
                expired so audits never surprise you. DocuSign integration ready
                when you flip it on.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ — schema.org FAQPage for AI Overview eligibility */}
        <MarketingFAQ
          heading="Frequently Asked Questions"
          subheading="Everything an agency operator wants to know before switching."
          items={FAQ_ITEMS}
          schemaId="for-agencies-faq"
          className="py-10 border-t"
        />

        {/* Final CTA */}
        <section className="py-12 border-t text-center">
          <h2 className="text-3xl font-bold tracking-tight mb-3">Switch your back-office today.</h2>
          <p className="text-muted-foreground mb-6">
            $9.95 per active employee. No per-feature add-ons. No annual contract.
          </p>
          <div className="flex justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/signup?role=employer">
                Start free <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/pricing">See pricing</Link>
            </Button>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
