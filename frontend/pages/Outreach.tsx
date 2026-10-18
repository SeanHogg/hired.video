import { Loader2, MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useSharedCommHub } from "@/providers/CommHubProvider";
import { AdvertiseTab } from "@/components/outreach/tabs/AdvertiseTab";
import { CampaignsTab } from "@/components/outreach/tabs/CampaignsTab";
import { ContactsTab } from "@/components/outreach/tabs/ContactsTab";
import { ContentTab } from "@/components/outreach/tabs/ContentTab";
import { DashboardTab } from "@/components/outreach/tabs/DashboardTab";
import { InboxTab } from "@/components/outreach/tabs/InboxTab";
import { JobBoardsTab } from "@/components/outreach/tabs/JobBoardsTab";
import { PerformanceTab } from "@/components/outreach/tabs/PerformanceTab";
import { TemplatesTab } from "@/components/outreach/tabs/TemplatesTab";
import { TrackingTab } from "@/components/outreach/tabs/TrackingTab";
import { OutreachMarketing } from "@/components/outreach/OutreachMarketing";
import { buildOutreachTabs } from "@/components/outreach/outreach-tabs";
import { VideoCampaignDialog } from "@/components/outreach/dialogs/VideoCampaignDialog";
import { EmailTemplateSheet } from "@/components/outreach/dialogs/EmailTemplateSheet";
import { ExternalContactDialog } from "@/components/outreach/dialogs/ExternalContactDialog";
import { JobBoardPostDialog } from "@/components/outreach/dialogs/JobBoardPostDialog";
import { BoostJobDialog } from "@/components/outreach/dialogs/BoostJobDialog";
import { useOutreachTab } from "@/components/outreach/hooks/useOutreachTab";
import { useOutreachData } from "@/components/outreach/hooks/useOutreachData";
import { useOutreachListFilters } from "@/components/outreach/hooks/useOutreachListFilters";
import { useFeaturedProfileInterest } from "@/components/outreach/hooks/useFeaturedProfileInterest";
import { useTemplateEditor } from "@/components/outreach/hooks/useTemplateEditor";
import { useContactEditor } from "@/components/outreach/hooks/useContactEditor";
import { useJobBoardPostForm } from "@/components/outreach/hooks/useJobBoardPostForm";
import { useJobBoost } from "@/components/outreach/hooks/useJobBoost";
import { useVideoCampaignForm } from "@/components/outreach/hooks/useVideoCampaignForm";
import { useAuth } from "@/lib/auth";
import { jobBoardService } from "@/lib/services/job-board-service";
import { advertisingService } from "@/lib/services/advertising-service";
import { studioService } from "@/lib/services/studio-service";

/**
 * Outreach — thin container. Signed-out visitors get the marketing page;
 * signed-in users get the tabbed dashboard. Tab bodies live in
 * components/outreach/tabs, dialogs in components/outreach/dialogs and the
 * page state/data in components/outreach/hooks.
 */
export default function Outreach() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const { activeTab, setActiveTab } = useOutreachTab();

  // Reads from the app-wide CommHubProvider — the same instance the header
  // bell + global SignalR subscription use. Polling/fetching for the
  // unfiltered aggregate happens once for the whole app, not per consumer.
  const commHub = useSharedCommHub();

  const { featuredProfileInterest, handleFeaturedProfileInterest } = useFeaturedProfileInterest();
  const data = useOutreachData();
  const lists = useOutreachListFilters(data);
  const templateEditor = useTemplateEditor(data);
  const contactEditor = useContactEditor(data);
  const jobBoardPost = useJobBoardPostForm(data);
  const boost = useJobBoost(data);
  const videoCampaign = useVideoCampaignForm(data);

  // If user is not authenticated, show marketing page
  if (!isAuthenticated || !user) {
    return <OutreachMarketing />;
  }

  // Authenticated user view - Outreach dashboard
  const outreachTabs = buildOutreachTabs(t, commHub.unreadCount);
  const { isLoading, error } = data;

  return (
    <AppShell bgClassName="bg-background">
      <div className="p-4 md:p-6">
          <div className="space-y-6">
            <PageHeader
              tabs={outreachTabs}
              activeTabKey={activeTab}
              sticky
            />

            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mr-2" />
                <span>{t("status.loadingOutreachData")}</span>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                  <MessageCircle className="h-5 w-5 text-red-500 mr-2" />
                  <span className="text-red-700">{error}</span>
                </div>
              </div>
            )}

            {/* Main Content */}
            {!isLoading && !error && (
              <>
                <Tabs value={activeTab}>
                  {/* Dashboard Tab — see DashboardTab component. */}
                  <TabsContent value="dashboard" className="space-y-6">
                    <DashboardTab
                      commHub={commHub}
                      communicationStats={data.communicationStats}
                      communicationTracking={data.communicationTracking}
                      jobBoardStats={data.jobBoardStats}
                      onGoToInbox={() => setActiveTab("inbox")}
                      onOpenTemplateDialog={() => templateEditor.setOpen(true)}
                      onOpenContactDialog={() => contactEditor.setOpen(true)}
                      onOpenJobBoardDialog={() => jobBoardPost.setOpen(true)}
                    />
                  </TabsContent>

                  {/* Inbox Tab — unified messages, notifications, connection
                      requests. The tab owns a filter-aware hub so its chips
                      don't affect the unfiltered bell badge; both surfaces
                      share the same SignalR push channel underneath. */}
                  <TabsContent value="inbox" className="space-y-6">
                    <InboxTab />
                  </TabsContent>

                  {/* My Content Tab — published videos & artifacts */}
                  <TabsContent value="content" className="space-y-6">
                    <ContentTab publishedProjects={data.publishedProjects} />
                  </TabsContent>

                  {/* Templates Tab */}
                  <TabsContent value="templates" className="space-y-6">
                    <TemplatesTab
                      emailTemplates={data.emailTemplates}
                      filteredTemplates={lists.templates.filtered}
                      paginatedTemplates={lists.templates.paginated}
                      search={lists.templates.search}
                      onSearchChange={lists.templates.setSearch}
                      viewMode={lists.templates.viewMode}
                      onViewModeChange={lists.templates.setViewMode}
                      pagination={lists.templates.pagination}
                      onCreate={() => templateEditor.setOpen(true)}
                      onEdit={templateEditor.startEdit}
                      onDelete={templateEditor.handleDeleteTemplate}
                    />
                  </TabsContent>

                  {/* Campaigns Tab — Campaign Manager hierarchy + Video/Email lists. */}
                  <TabsContent value="campaigns" className="space-y-6">
                    <CampaignsTab
                      videoCampaigns={data.videoCampaigns}
                      emailCampaigns={data.emailCampaigns}
                      filteredCampaigns={lists.campaigns.filtered}
                      totalCampaigns={lists.campaigns.total}
                      search={lists.campaigns.search}
                      onSearchChange={lists.campaigns.setSearch}
                      viewMode={lists.campaigns.viewMode}
                      onViewModeChange={lists.campaigns.setViewMode}
                      pagination={lists.campaigns.pagination}
                      onCreateVideoCampaign={videoCampaign.openNew}
                      onDeleteVideoCampaign={async (id) => {
                        await studioService.deleteCampaign(id);
                        data.setVideoCampaigns((prev) => prev.filter((c) => c.id !== id));
                      }}
                      onNavigateTo={(tab) => setActiveTab(tab)}
                      studioProjects={data.studioProjects}
                    />
                  </TabsContent>


                  {/* Tracking Tab */}
                  <TabsContent value="tracking" className="space-y-6">
                    <TrackingTab communicationTracking={data.communicationTracking} />
                  </TabsContent>

                  {/* Contacts Tab */}
                  <TabsContent value="contacts" className="space-y-6">
                    <ContactsTab
                      externalContacts={data.externalContacts}
                      filteredContacts={lists.contacts.filtered}
                      paginatedContacts={lists.contacts.paginated}
                      search={lists.contacts.search}
                      onSearchChange={lists.contacts.setSearch}
                      viewMode={lists.contacts.viewMode}
                      onViewModeChange={lists.contacts.setViewMode}
                      pagination={lists.contacts.pagination}
                      onCreate={() => contactEditor.setOpen(true)}
                      onEdit={contactEditor.startEdit}
                      onDelete={contactEditor.handleDeleteContact}
                    />
                  </TabsContent>

                  {/* Job Boards Tab — see JobBoardsTab component. */}
                  <TabsContent value="job-boards" className="space-y-6">
                    <JobBoardsTab
                      jobBoards={data.jobBoards}
                      jobBoardPostings={data.jobBoardPostings}
                      jobBoardStats={data.jobBoardStats}
                      userJobs={data.userJobs}
                      postingFilters={data.postingFilters}
                      onPostingFiltersChange={data.setPostingFilters}
                      onOpenPostDialog={() => jobBoardPost.setOpen(true)}
                      onRemovePosting={async (id) => {
                        await jobBoardService.removeJobBoardPosting(id);
                        data.setJobBoardPostings((prev) => prev.filter((p) => p.id !== id));
                      }}
                    />
                  </TabsContent>

                  {/* Advertise Tab — see AdvertiseTab component. */}
                  <TabsContent value="advertise" className="space-y-6">
                    <AdvertiseTab
                      adStats={data.adStats}
                      activeBoosts={data.activeBoosts}
                      featuredProfileInterest={featuredProfileInterest}
                      onOpenBoostDialog={() => boost.setOpen(true)}
                      onRequestFeaturedProfile={handleFeaturedProfileInterest}
                      onPauseBoost={async (id) => {
                        const updated = await advertisingService.pauseBoost(id);
                        data.setActiveBoosts((prev) => prev.map((b) => (b.id === id ? updated : b)));
                      }}
                      onResumeBoost={async (id) => {
                        const updated = await advertisingService.resumeBoost(id);
                        data.setActiveBoosts((prev) => prev.map((b) => (b.id === id ? updated : b)));
                      }}
                      onCancelBoost={async (id) => {
                        await advertisingService.cancelBoost(id);
                        data.setActiveBoosts((prev) => prev.filter((b) => b.id !== id));
                      }}
                      onFinishBoostPayment={boost.payJobBoost}
                    />
                  </TabsContent>

                  {/* Performance Tab — cross-placement ad analytics +
                      cross-channel comms context. See PerformanceTab. */}
                  <TabsContent value="performance" className="space-y-6">
                    <PerformanceTab
                      adStats={data.adStats}
                      activeBoosts={data.activeBoosts}
                      communicationStats={data.communicationStats}
                      onGoToAdvertise={() => setActiveTab("advertise")}
                    />
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>
      </div>

      <VideoCampaignDialog state={videoCampaign} publishedProjects={data.publishedProjects} />
      <EmailTemplateSheet state={templateEditor} />
      <ExternalContactDialog state={contactEditor} />
      <JobBoardPostDialog state={jobBoardPost} jobBoards={data.jobBoards} userJobs={data.userJobs} />
      <BoostJobDialog state={boost} userJobs={data.userJobs} />
    </AppShell>
  );
}
