/**
 * Contact inquiry kinds — the one registry the contact form, the slide-out
 * panel and the API payload share. Copy is exposed as i18n keys
 * (`contactForm.inquiry.<type>.*`), never literals.
 */

export const CONTACT_INQUIRY_TYPES = ["general", "sales", "demo", "nonprofit_discount", "support"] as const;

export type ContactInquiryType = (typeof CONTACT_INQUIRY_TYPES)[number];

export interface ContactPanelPreset {
  /** Inquiry kind — drives the lead `source` and the admin notification.
   *  When set, the type picker is hidden. */
  inquiryType?: ContactInquiryType;
  /** Panel header copy (already translated). Defaults per inquiry type. */
  title?: string;
  /** Panel subhead (already translated). Defaults per inquiry type. */
  description?: string;
  /** Pre-fills the subject field (already translated). */
  subject?: string;
  /** Subject renders read-only — for CTAs whose context is unambiguous. */
  subjectLocked?: boolean;
  /** Pre-fills the message body (already translated). */
  prefillMessage?: string;
  /** Submit button label override (already translated). */
  submitLabel?: string;
}

export type InquiryCopyField = "title" | "description" | "subject" | "submit" | "option";

export function inquiryKey(type: ContactInquiryType, field: InquiryCopyField): string {
  return `contactForm.inquiry.${type}.${field}`;
}
