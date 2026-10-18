import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  recruiterService,
  type TalentPoolEntry,
  type AddInteractionRequest,
} from "@/lib/services/recruiter-service";
import {
  EMPTY_INTERACTION_FORM,
  type InteractionForm,
} from "@/components/people/people-helpers";

/** Log-interaction sheet state for a Talent Pool entry. */
export function useLogInteraction(onSaved: () => void) {
  const { t } = useTranslation();
  const [selectedCandidate, setSelectedCandidate] = useState<TalentPoolEntry | null>(null);
  const [interactionSheetOpen, setInteractionSheetOpen] = useState(false);
  const [interactionForm, setInteractionForm] = useState<InteractionForm>(EMPTY_INTERACTION_FORM);

  const handleAddInteraction = (candidate: TalentPoolEntry) => {
    setSelectedCandidate(candidate);
    setInteractionForm(EMPTY_INTERACTION_FORM);
    setInteractionSheetOpen(true);
  };

  const handleSaveInteraction = async () => {
    if (!selectedCandidate) return;

    try {
      const request: AddInteractionRequest = {
        talentPoolId: selectedCandidate.id,
        interactionType: interactionForm.interactionType,
        subject: interactionForm.subject,
        notes: interactionForm.notes,
        outcome: interactionForm.outcome,
        durationMinutes: interactionForm.durationMinutes,
        requiresFollowUp: interactionForm.requiresFollowUp,
        followUpDate: interactionForm.followUpDate,
      };
      await recruiterService.addInteraction(request);
      toast.success(t("messages.interactionLogged"));
      setInteractionSheetOpen(false);
      setSelectedCandidate(null);
      onSaved();
    } catch (error) {
      console.error("Failed to log interaction:", error);
      toast.error(t("messages.failedToLogInteraction"));
    }
  };

  return {
    interactionSheetOpen,
    setInteractionSheetOpen,
    interactionForm,
    setInteractionForm,
    handleAddInteraction,
    handleSaveInteraction,
  };
}
