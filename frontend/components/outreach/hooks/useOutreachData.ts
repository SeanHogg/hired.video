import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { communicationService } from "@/lib/services/communication-service";
import { jobBoardService, type JobBoardDTO, type JobBoardPostingDTO, type JobBoardStatsDTO } from "@/lib/services/job-board-service";
import { jobService, type JobSummary } from "@/lib/services/job-service";
import { advertisingService, type JobBoost, type AdvertisingStats } from "@/lib/services/advertising-service";
import { studioService, type StudioProject, type VideoCampaign } from "@/lib/services/studio-service";
import type { CampaignDTO } from "@shared/campaigns";
import type {
  EmailTemplateDTO,
  CommunicationTrackingDTO,
  ExternalContactDTO,
  CommunicationStats,
} from "@/types/communication";
import { isPublishedStudioProject } from "@/components/outreach/outreach-helpers";

type TeamMember = {
  id: string;
  userProfile?: {
    id: string;
    firstName: string;
    lastName: string;
    role?: string;
  };
};

/** Every Outreach data set, loaded in one fan-out once the user is signed in. */
export function useOutreachData() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [emailTemplates, setEmailTemplates] = useState<EmailTemplateDTO[]>([]);
  const [emailCampaigns, setEmailCampaigns] = useState<CampaignDTO[]>([]);
  const [communicationTracking, setCommunicationTracking] = useState<CommunicationTrackingDTO[]>([]);
  const [externalContacts, setExternalContacts] = useState<ExternalContactDTO[]>([]);
  const [communicationStats, setCommunicationStats] = useState<CommunicationStats | null>(null);
  const [_teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // Job Board state
  const [jobBoards, setJobBoards] = useState<JobBoardDTO[]>([]);
  const [jobBoardPostings, setJobBoardPostings] = useState<JobBoardPostingDTO[]>([]);
  const [jobBoardStats, setJobBoardStats] = useState<JobBoardStatsDTO | null>(null);
  const [userJobs, setUserJobs] = useState<JobSummary[]>([]);
  const [postingFilters, setPostingFilters] = useState({
    jobId: "all",
    boardId: "all",
    status: "all",
  });

  // Advertising state
  const [adStats, setAdStats] = useState<AdvertisingStats | null>(null);
  const [activeBoosts, setActiveBoosts] = useState<JobBoost[]>([]);

  // Published content state
  const [publishedProjects, setPublishedProjects] = useState<StudioProject[]>([]);
  const [studioProjects, setStudioProjects] = useState<StudioProject[]>([]);
  const [videoCampaigns, setVideoCampaigns] = useState<VideoCampaign[]>([]);

  // Load data on component mount
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [
          templatesData,
          campaignsData,
          trackingData,
          contactsData,
          statsData,
          teamData,
          jobBoardsData,
          jobBoardPostingsData,
          jobBoardStatsData,
          userJobsData,
          adStatsData,
          boostsData,
          studioProjectsData,
          videoCampaignsData,
        ] = await Promise.all([
          communicationService.getEmailTemplates(),
          communicationService.getEmailCampaigns(),
          communicationService.getCommunicationTracking(),
          communicationService.getExternalContacts(),
          communicationService.getCommunicationStats().catch(() => null),
          communicationService.getTeamMembers().catch(() => []),
          jobBoardService.getAvailableJobBoards().catch(() => []),
          jobBoardService.getJobBoardPostings().catch(() => []),
          jobBoardService.getJobBoardStats().catch(() => null),
          jobService.getUserJobs().catch(() => []),
          advertisingService.getStats().catch(() => null),
          advertisingService.getBoosts().catch(() => []),
          studioService.getProjects().then((r) => r.data ?? []).catch(() => [] as StudioProject[]),
          studioService.getCampaigns().then((r) => r.data ?? []).catch(() => [] as VideoCampaign[]),
        ]);

        setEmailTemplates(templatesData);
        setEmailCampaigns(campaignsData);
        setCommunicationTracking(trackingData);
        setExternalContacts(contactsData);
        setCommunicationStats(statsData);
        setTeamMembers(teamData);
        setJobBoards(jobBoardsData);
        setJobBoardPostings(jobBoardPostingsData);
        setJobBoardStats(jobBoardStatsData);
        setUserJobs(userJobsData);
        setAdStats(adStatsData);
        setActiveBoosts(boostsData);
        setStudioProjects(studioProjectsData);
        setPublishedProjects(studioProjectsData.filter(isPublishedStudioProject));
        setVideoCampaigns(videoCampaignsData);
      } catch (err) {
        console.error("Failed to load outreach data:", err);
        setError(
          err instanceof Error ? err.message : t("errors.failedLoadOutreachData"),
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [isAuthenticated, user]);

  return {
    isLoading,
    error,
    setError,
    emailTemplates,
    setEmailTemplates,
    emailCampaigns,
    communicationTracking,
    externalContacts,
    setExternalContacts,
    communicationStats,
    jobBoards,
    jobBoardPostings,
    setJobBoardPostings,
    jobBoardStats,
    setJobBoardStats,
    userJobs,
    postingFilters,
    setPostingFilters,
    adStats,
    setAdStats,
    activeBoosts,
    setActiveBoosts,
    publishedProjects,
    studioProjects,
    videoCampaigns,
    setVideoCampaigns,
  };
}

export type OutreachData = ReturnType<typeof useOutreachData>;
