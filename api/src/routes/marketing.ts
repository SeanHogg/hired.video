import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  CONTACT_INQUIRY_TYPES,
  createLead,
  listLeads,
  submitContactInquiry,
  updateLeadStatus,
} from "../services/marketing/leads.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import { createIpRateLimiter } from "../middleware/rateLimiter.js";
import { validateJson } from "./helpers/validate.js";

export const marketingRoutes = new Hono<AppEnv>();

// POST /contact and POST /leads accept signed-out visitors (app.ts
// MARKETING_PUBLIC_WRITE_ROUTE → optional-auth). Anonymous submissions are
// IP-capped so the public mailbox can't be used to flood admin inboxes or
// send receipt emails at scale; signed-in callers skip the cap.
const anonSubmissionLimiter = createIpRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxAttempts: 10,
  message: "Too many submissions from this network. Please try again later or email info@hired.video.",
});

const anonSubmissionGate: MiddlewareHandler<AppEnv> = async (c, next) =>
  c.var.userId ? next() : anonSubmissionLimiter(c, next);

const CreateLeadSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  company: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Campaign CRUD lives in the canonical engine: CampaignService, surfaced at
// /api/admin/campaigns (SuperAdmin) and /api/communication/email-campaigns
// (user-facing). The duplicate stub endpoints that used to live here had no
// consumers and were removed in migration 0204's consolidation.

// ─── Leads ────────────────────────────────────────────────────────────────────

// Lead rows carry visitor PII (name, email, message) — SuperAdmin triage only.
marketingRoutes.get("/leads", superAdminMiddleware, async (c) => {
  // Optional ?source=contact_panel — when present matches `source LIKE
  // 'contact_panel:%'` so the SuperAdmin Contact Inquiries page can ask for
  // just the in-app inquiry submissions without dragging in landing-page
  // lead-magnet capture. ?status filters by triage state.
  const url = new URL(c.req.url);
  const leads = await listLeads({
    sourcePrefix: url.searchParams.get("source"),
    status: url.searchParams.get("status"),
  });
  return c.json(success(leads), 200);
});

marketingRoutes.post("/leads", anonSubmissionGate, validateJson(CreateLeadSchema, undefined, { emptyBody: null }), async (c) => {
  // This endpoint is public-ish — allows unauthenticated lead capture from landing pages.
  const lead = await createLead(c.req.valid("json"));
  return c.json(success(lead), 201);
});

// ─── Contact Panel ────────────────────────────────────────────────────────────
//
// Single endpoint behind every "Contact us" / "Talk to us" / "Request a demo"
// CTA across the app — Pricing, About hero, Help-tab contact options, etc. The
// frontend uses one shared <ContactPanel> slide-out form per the DRY rule
// (`feedback_extract_on_duplication`). All inquiries land in `marketing_leads`
// (source = "contact_panel:<inquiryType>") so the existing /api/marketing/leads
// admin list already covers triage, and every super_admin gets a real-time
// notification (services/marketing/leads.ts).

const ContactInquirySchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  company: z.string().max(255).optional(),
  phone: z.string().max(64).optional(),
  inquiryType: z.enum(CONTACT_INQUIRY_TYPES).default("general"),
  subject: z.string().min(1).max(255),
  message: z.string().min(1).max(5000),
  page: z.string().max(255).optional(),
  role: z.string().max(64).optional(),
});

marketingRoutes.post("/contact", anonSubmissionGate, validateJson(ContactInquirySchema, undefined, { emptyBody: null }), async (c) => {
  // Public — anyone can submit a contact inquiry. Authed users get name/email
  // prefilled client-side from the auth context but the server still trusts
  // whatever the form submits (the contact form is a freeform mailbox, not an
  // identity assertion).
  const id = await submitContactInquiry(c.req.valid("json"));
  return c.json(success({ id }), 201);
});

const LeadStatusSchema = z.object({ status: z.string().min(1) });

marketingRoutes.patch("/leads/:id/status", superAdminMiddleware, validateJson(LeadStatusSchema, () => error("VALIDATION_ERROR", "status is required")), async (c) => {
  const updated = await updateLeadStatus(c.req.param("id"), c.req.valid("json").status);
  if (!updated) return c.json(error("NOT_FOUND", "Lead not found"), 404);
  return c.json(success(updated), 200);
});
