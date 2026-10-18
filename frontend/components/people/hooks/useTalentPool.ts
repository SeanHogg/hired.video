import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  recruiterService,
  type TalentPoolEntry,
  type AddToTalentPoolRequest,
  type TalentPoolFilters,
} from "@/lib/services/recruiter-service";
import { isHiringSideRole } from "@/components/people/people-helpers";

/**
 * Recruiter Talent Pool for /people?tab=talent-pool: the entry list (loaded
 * when the tab is active for a hiring-side viewer), add-from-Browse, and the
 * remove-confirmation dialog.
 */
export function useTalentPool({
  activeTab,
  isAuthenticated,
  user,
}: {
  activeTab: string;
  isAuthenticated: boolean;
  user: { role?: string } | null;
}) {
  const { t } = useTranslation();
  const [talentPool, setTalentPool] = useState<TalentPoolEntry[]>([]);
  const [talentPoolLoading, setTalentPoolLoading] = useState(false);
  const [talentPoolFilters] = useState<TalentPoolFilters>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [candidateToDelete, setCandidateToDelete] = useState<string | null>(null);

  const loadTalentPool = async () => {
    try {
      setTalentPoolLoading(true);
      const entries = await recruiterService.getTalentPool(talentPoolFilters);
      setTalentPool(entries);
    } catch (error) {
      console.error("Failed to load talent pool:", error);
      toast.error(t("messages.failedToLoadTalentPool"));
    } finally {
      setTalentPoolLoading(false);
    }
  };

  // Load talent pool when tab changes (for recruiters)
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (isHiringSideRole(user.role) && activeTab === "talent-pool") {
      loadTalentPool();
    }
  }, [activeTab, isAuthenticated, user, talentPoolFilters]);

  const handleAddToTalentPool = async (candidateUserId: string) => {
    try {
      const request: AddToTalentPoolRequest = {
        candidateUserId,
        relationshipStrength: "New",
        status: "Active",
        poolName: "General",
      };
      await recruiterService.addToTalentPool(request);
      toast.success(t("messages.candidateAddedTalentPoolGeneric"));
      if (activeTab === "talent-pool") {
        loadTalentPool();
      }
    } catch (error) {
      console.error("Failed to add to talent pool:", error);
      toast.error(t("messages.failedToAddToTalentPool"));
    }
  };

  const requestRemove = (candidateId: string) => {
    setCandidateToDelete(candidateId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteCandidate = async () => {
    if (!candidateToDelete) return;

    try {
      await recruiterService.removeFromTalentPool(candidateToDelete);
      toast.success(t("messages.candidateRemovedTalentPool"));
      setDeleteDialogOpen(false);
      setCandidateToDelete(null);
      loadTalentPool();
    } catch (error) {
      console.error("Failed to remove candidate:", error);
      toast.error(t("messages.failedToRemoveCandidate"));
    }
  };

  return {
    talentPool,
    talentPoolLoading,
    loadTalentPool,
    handleAddToTalentPool,
    deleteDialogOpen,
    setDeleteDialogOpen,
    requestRemove,
    handleDeleteCandidate,
  };
}
