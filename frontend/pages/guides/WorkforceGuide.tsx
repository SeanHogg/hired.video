/**
 * Workforce & Timesheet how-to (#1349 #1476). Step-by-step walkthrough
 * of the agency back-office — invite → punch → submit → approve →
 * invoice → margin → docs. Mirrors the GettingStarted.tsx pattern
 * (AppShell + useSEO + useBreadcrumbs + numbered-step cards).
 */
import {
  ArrowLeft,
  ArrowRight,
  UserPlus,
  Clock,
  Send,
  ClipboardCheck,
  DollarSign,
  FileText,
  Plug,
  Printer,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";

const STEPS = [
  {
    number: 1,
    title: "Invite your first employee",
    icon: UserPlus,
    content: `Open Settings → Account & Billing and use the team invite flow. Enter the employee's email and pick role = employee. They get a magic-link invite; on accept, they're bound to your workspace via a user_company_role_associations row and your seat count increments. Each active employee bills at $9.95 / month on your next cycle.`,
    cta: { label: "Open Settings", to: "/settings?tab=account-billing" },
  },
  {
    number: 2,
    title: "Capture time — employee punches in / out",
    icon: Clock,
    content: `Once accepted, the employee opens /tasks → Timesheet. They tap Punch in (with optional notes + billable flag), the entry stays open with a live elapsed timer. Tap Punch out to close it; duration auto-computes. At-most-one open entry per user is enforced server-side, so accidental double-punch is impossible.`,
    cta: { label: "Tasks · Events · Timesheet", to: "/tasks?surface=timesheet" },
  },
  {
    number: 3,
    title: "Submit the week",
    icon: Send,
    content: `On Friday (or any time after punch-out), the employee hits Submit week from the Timesheet tab. Closed entries aggregate into total + billable hours, the entries lock to the new timesheet row, and a snapshot freezes for the approver. Rejected weeks unlock back to draft for re-submit.`,
  },
  {
    number: 4,
    title: "Approve from /settings → Workforce",
    icon: ClipboardCheck,
    content: `Employers see the approval queue in Settings → Workforce. Each pending timesheet shows the employee, week range, total + billable hours, and a Print button. Approve → instant; Reject → required reason dialog. Reject unlocks the entries so the employee can fix + re-submit.`,
    cta: { label: "Open Workforce settings", to: "/settings?tab=workforce" },
  },
  {
    number: 5,
    title: "Invoices + contractor pay derive automatically",
    icon: DollarSign,
    content: `Approval triggers derivation: invoice line item using billable hours × the placement's billRateHourly, payout-ledger accrual using total hours × payRateHourly. A billing_events audit row captures the full payload. Helcim push goes outbound immediately (when HELCIM_API_TOKEN is configured) — QBO / Xero / Gusto stubs are in place and activate when you connect them under Integrations.`,
  },
  {
    number: 6,
    title: "Track desk margin per placement",
    icon: TrendingUp,
    content: `Desk margin in /settings → Workforce shows year-to-date revenue, contractor pay, and gross margin per placement, sorted by margin descending. Click any row to drill into the placement detail screen at /recruiter/placements/:id — Overview / Documents / Timesheets / Margin tabs.`,
  },
  {
    number: 7,
    title: "Compliance docs — upload, sign, expire",
    icon: FileText,
    content: `Open a placement detail → Documents, click New document, pick the kind (i9 / w9 / w8ben / coi / bg_check / msa / sow / offer_letter / nda). Upload the file directly to R2 storage; mark signed manually (native flow) or route through DocuSign once connected. Expiry dates are tracked; a nightly cron flips overdue docs to expired automatically.`,
  },
  {
    number: 8,
    title: "Connect QuickBooks / Xero / Gusto / DocuSign",
    icon: Plug,
    content: `Settings → Workforce → Integrations lists every supported provider. Connect handshake is per-provider OAuth (lands as each provider's client ID is configured). Once connected, every approved timesheet pushes outbound to the right module — QBO invoice creation, Gusto contractor payment, DocuSign envelope. The local invoice + payout ledger remains the canonical source so any failed push retries safely.`,
  },
  {
    number: 9,
    title: "Print → Save as PDF anywhere",
    icon: Printer,
    content: `Every timesheet and invoice has a Print button (printer icon) in the UI. Clicking opens a server-rendered A4-styled HTML page that auto-fires the browser's print dialog — choose Save as PDF and you're done. Works the same on Mac, Windows, and Linux. No client-side PDF library required.`,
  },
];

export default function WorkforceGuide() {
  useSEO("/guides/workforce");
  useBreadcrumbs([
    { name: "Help", url: "/help" },
    { name: "Guides", url: "/guides/getting-started" },
    { name: "Workforce & Timesheets", url: "/guides/workforce" },
  ]);

  return (
    <AppShell bgClassName="bg-background">
      <main className="max-w-4xl mx-auto px-4 md:px-6 py-10">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link to="/help">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Help
          </Link>
        </Button>

        <header className="mb-10">
          <h1 className="text-4xl font-bold tracking-tight">Workforce & Timesheets — complete guide</h1>
          <p className="text-muted-foreground text-lg mt-2">
            Everything you need to run a staffing-agency back-office on
            hired.video — from inviting your first employee to closing the
            month with desk-margin reports.
          </p>
        </header>

        <ol className="space-y-6">
          {STEPS.map((s) => {
            const Icon = s.icon;
            return (
              <li key={s.number}>
                <Card>
                  <CardHeader>
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold shrink-0">
                        {s.number}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <CardTitle className="text-xl">{s.title}</CardTitle>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed">{s.content}</p>
                    {s.cta && (
                      <Button size="sm" variant="outline" asChild className="mt-4">
                        <Link to={s.cta.to}>
                          {s.cta.label} <ArrowRight className="h-3 w-3 ml-1" />
                        </Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>

        <section className="mt-12 p-6 border rounded-lg bg-muted/30">
          <h2 className="text-2xl font-bold mb-2">Want a quick tour first?</h2>
          <p className="text-muted-foreground mb-4">
            The marketing landing page walks through every feature with a
            "typical week" timeline and the full FAQ.
          </p>
          <Button asChild>
            <Link to="/for-agencies">
              See For Agencies page <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </section>
      </main>
    </AppShell>
  );
}
