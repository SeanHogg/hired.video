import { useState } from "react";
import { usePagination } from "@/components/Pagination";
import type { ViewMode } from "@/lib/hooks/useViewMode";
import type { CampaignDTO } from "@shared/campaigns";
import type { VideoCampaign } from "@/lib/services/studio-service";
import type { EmailTemplateDTO, ExternalContactDTO } from "@/types/communication";
import {
  filterCampaigns,
  filterContacts,
  filterTemplates,
} from "@/components/outreach/outreach-helpers";

/** Search, view mode, and pagination for the Templates/Campaigns/Contacts tabs. */
export function useOutreachListFilters({
  emailTemplates,
  videoCampaigns,
  emailCampaigns,
  externalContacts,
}: {
  emailTemplates: EmailTemplateDTO[];
  videoCampaigns: VideoCampaign[];
  emailCampaigns: CampaignDTO[];
  externalContacts: ExternalContactDTO[];
}) {
  const [templatesSearch, setTemplatesSearch] = useState("");
  const [templatesViewMode, setTemplatesViewMode] = useState<ViewMode>("grid");
  const [campaignsSearch, setCampaignsSearch] = useState("");
  const [campaignsViewMode, setCampaignsViewMode] = useState<ViewMode>("grid");
  const [contactsSearch, setContactsSearch] = useState("");
  const [contactsViewMode, setContactsViewMode] = useState<ViewMode>("grid");

  const filteredTemplates = filterTemplates(emailTemplates, templatesSearch);
  const filteredCampaigns = filterCampaigns(videoCampaigns, emailCampaigns, campaignsSearch);
  const totalCampaigns = filteredCampaigns.video.length + filteredCampaigns.email.length;
  const filteredContacts = filterContacts(externalContacts, contactsSearch);

  const templatesPagination = usePagination(filteredTemplates.length, 12);
  const campaignsPagination = usePagination(totalCampaigns, 12);
  const contactsPagination = usePagination(filteredContacts.length, 12);

  const paginatedTemplates = filteredTemplates.slice(templatesPagination.startIndex, templatesPagination.endIndex);
  const paginatedContacts = filteredContacts.slice(contactsPagination.startIndex, contactsPagination.endIndex);

  return {
    templates: {
      search: templatesSearch,
      setSearch: setTemplatesSearch,
      viewMode: templatesViewMode,
      setViewMode: setTemplatesViewMode,
      filtered: filteredTemplates,
      paginated: paginatedTemplates,
      pagination: templatesPagination,
    },
    campaigns: {
      search: campaignsSearch,
      setSearch: setCampaignsSearch,
      viewMode: campaignsViewMode,
      setViewMode: setCampaignsViewMode,
      filtered: filteredCampaigns,
      total: totalCampaigns,
      pagination: campaignsPagination,
    },
    contacts: {
      search: contactsSearch,
      setSearch: setContactsSearch,
      viewMode: contactsViewMode,
      setViewMode: setContactsViewMode,
      filtered: filteredContacts,
      paginated: paginatedContacts,
      pagination: contactsPagination,
    },
  };
}
