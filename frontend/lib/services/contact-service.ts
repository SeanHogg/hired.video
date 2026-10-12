/**
 * Typed client for `POST /api/marketing/contact` — writes a
 * `marketing_leads` row, notifies SuperAdmins (bell + push + email) and
 * emails the submitter a receipt (api/src/routes/marketing.ts).
 */
import { apiClient } from "@/lib/api-client";
import type { ContactInquiryType } from "@/lib/contact/contact-inquiry";

export interface ContactInquiryInput {
  name: string;
  email: string;
  company?: string;
  phone?: string;
  inquiryType: ContactInquiryType;
  subject: string;
  message: string;
  /** Page the visitor submitted from. */
  page?: string;
  role?: string;
}

export async function submitContactInquiry(input: ContactInquiryInput): Promise<void> {
  await apiClient.post("/api/marketing/contact", input);
}
