import { useState, type Dispatch, type SetStateAction } from "react";
import { studioService, type VideoCampaign } from "@/lib/services/studio-service";
import {
  EMPTY_VIDEO_CAMPAIGN_FORM,
  type VideoCampaignForm,
} from "@/components/outreach/outreach-helpers";

/** "Create video campaign" dialog state + submit. */
export function useVideoCampaignForm({
  setVideoCampaigns,
}: {
  setVideoCampaigns: Dispatch<SetStateAction<VideoCampaign[]>>;
}) {
  const [open, setOpen] = useState(false);
  const [campaignForm, setCampaignForm] = useState<VideoCampaignForm>(EMPTY_VIDEO_CAMPAIGN_FORM);
  const [campaignVideoSelect, setCampaignVideoSelect] = useState<string[]>([]);
  const [campaignSubmitting, setCampaignSubmitting] = useState(false);

  const openNew = () => {
    setCampaignForm(EMPTY_VIDEO_CAMPAIGN_FORM);
    setCampaignVideoSelect([]);
    setOpen(true);
  };

  const toggleVideo = (projectId: string, checked: boolean) => {
    setCampaignVideoSelect((prev) =>
      checked ? [...prev, projectId] : prev.filter((id) => id !== projectId),
    );
  };

  const submit = async () => {
    setCampaignSubmitting(true);
    try {
      const res = await studioService.createCampaign({
        name: campaignForm.name.trim(),
        description: campaignForm.description || undefined,
        utmSource: campaignForm.utmSource || undefined,
        utmMedium: campaignForm.utmMedium || undefined,
        utmCampaign: campaignForm.utmCampaign || undefined,
        projectIds: campaignVideoSelect,
      });
      if (res.data) {
        const created = res.data;
        setVideoCampaigns((prev) => [created, ...prev]);
      }
      setOpen(false);
    } catch {
      // toast would go here
    } finally {
      setCampaignSubmitting(false);
    }
  };

  return {
    open,
    setOpen,
    campaignForm,
    setCampaignForm,
    campaignVideoSelect,
    toggleVideo,
    campaignSubmitting,
    openNew,
    submit,
  };
}

export type VideoCampaignFormState = ReturnType<typeof useVideoCampaignForm>;
