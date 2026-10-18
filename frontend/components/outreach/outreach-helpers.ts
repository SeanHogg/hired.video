/**
 * Pure helpers / constants for the Outreach page (pages/Outreach.tsx):
 * tab vocabulary, blank form values, entity → form mappers and the
 * client-side search filters used by the Templates/Campaigns/Contacts tabs.
 */
import type { CampaignDTO } from "@shared/campaigns";
import {
  EmailTemplateCategory,
  EmailTemplateTargetRole,
  type CreateEmailTemplateRequest,
  type CreateExternalContactRequest,
  type EmailTemplateDTO,
  type ExternalContactDTO,
} from "@/types/communication";
import {
  StudioProjectStatus,
  type StudioProject,
  type VideoCampaign,
} from "@/lib/services/studio-service";

export type OutreachTab =
  | "dashboard" | "inbox" | "content" | "templates" | "campaigns"
  | "tracking" | "contacts" | "job-boards" | "advertise" | "performance";

export const VALID_OUTREACH_TABS: ReadonlySet<OutreachTab> = new Set([
  "dashboard", "inbox", "content", "templates", "campaigns",
  "tracking", "contacts", "job-boards", "advertise", "performance",
]);

export function parseOutreachTab(tabParam: string | null): OutreachTab {
  return tabParam && VALID_OUTREACH_TABS.has(tabParam as OutreachTab)
    ? (tabParam as OutreachTab)
    : "dashboard";
}

export const EMPTY_TEMPLATE_FORM: CreateEmailTemplateRequest = {
  name: "",
  description: "",
  subject: "",
  body: "",
  category: EmailTemplateCategory.General,
  targetRole: EmailTemplateTargetRole.All,
};

export const EMPTY_CONTACT_FORM: CreateExternalContactRequest = {
  email: "",
  firstName: "",
  lastName: "",
  jobTitle: "",
  companyName: "",
  phone: "",
  linkedInUrl: "",
  location: "",
  notes: "",
};

export interface VideoCampaignForm {
  name: string;
  description: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
}

export const EMPTY_VIDEO_CAMPAIGN_FORM: VideoCampaignForm = {
  name: "", description: "", utmSource: "", utmMedium: "", utmCampaign: "",
};

export function templateToForm(template: EmailTemplateDTO): CreateEmailTemplateRequest {
  return {
    name: template.name,
    description: template.description || "",
    subject: template.subject,
    body: template.body,
    category: template.category,
    targetRole: template.targetRole,
  };
}

export function contactToForm(contact: ExternalContactDTO): CreateExternalContactRequest {
  return {
    email: contact.email,
    firstName: contact.firstName || "",
    lastName: contact.lastName || "",
    jobTitle: contact.jobTitle || "",
    companyName: contact.companyName || "",
    phone: contact.phone || "",
    linkedInUrl: contact.linkedInUrl || "",
    location: contact.location || "",
    notes: contact.notes || "",
  };
}

/** Studio projects that count as "published content" on the My Content tab. */
export function isPublishedStudioProject(p: StudioProject): boolean {
  return p.status === StudioProjectStatus.Published || p.status === StudioProjectStatus.Exported || p.status === StudioProjectStatus.Completed;
}

export function filterTemplates(templates: EmailTemplateDTO[], search: string): EmailTemplateDTO[] {
  return templates.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.description && t.description.toLowerCase().includes(search.toLowerCase())) ||
    t.subject.toLowerCase().includes(search.toLowerCase())
  );
}

function matchesNameOrDescription(
  item: { name: string; description?: string | null },
  search: string,
): boolean {
  return !search || item.name.toLowerCase().includes(search.toLowerCase()) ||
    Boolean(item.description && item.description.toLowerCase().includes(search.toLowerCase()));
}

export function filterCampaigns(
  videoCampaigns: VideoCampaign[],
  emailCampaigns: CampaignDTO[],
  search: string,
): { video: VideoCampaign[]; email: CampaignDTO[] } {
  return {
    video: videoCampaigns.filter((vc) => matchesNameOrDescription(vc, search)),
    email: emailCampaigns.filter((ec) => matchesNameOrDescription(ec, search)),
  };
}

export function filterContacts(contacts: ExternalContactDTO[], search: string): ExternalContactDTO[] {
  return contacts.filter((c) =>
    !search ||
    `${c.firstName} ${c.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    (c.companyName && c.companyName.toLowerCase().includes(search.toLowerCase())) ||
    (c.jobTitle && c.jobTitle.toLowerCase().includes(search.toLowerCase()))
  );
}
