import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  recruiterService,
  type TalentPoolEntry,
  type UpdateTalentPoolRequest,
} from "@/lib/services/recruiter-service";
import {
  EMPTY_EDIT_CANDIDATE_FORM,
  editFormFromCandidate,
  type EditCandidateForm,
} from "@/components/people/people-helpers";

/** Edit-candidate sheet state (form + tag input) for a Talent Pool entry. */
export function useEditCandidate(onSaved: () => void) {
  const { t } = useTranslation();
  const [selectedCandidate, setSelectedCandidate] = useState<TalentPoolEntry | null>(null);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditCandidateForm>(EMPTY_EDIT_CANDIDATE_FORM);
  const [tagInput, setTagInput] = useState("");

  const handleEditCandidate = (candidate: TalentPoolEntry) => {
    setSelectedCandidate(candidate);
    setEditForm(editFormFromCandidate(candidate));
    setEditSheetOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedCandidate) return;

    try {
      const request: UpdateTalentPoolRequest = {
        relationshipStrength: editForm.relationshipStrength,
        tags: editForm.tags,
        poolName: editForm.poolName,
        status: editForm.status,
        notes: editForm.notes,
        currentCompany: editForm.currentCompany,
        currentTitle: editForm.currentTitle,
        desiredSalary: editForm.desiredSalary,
        preferredLocations: editForm.preferredLocations,
        contactFrequency: editForm.contactFrequency,
        nextFollowUpAt: editForm.nextFollowUpAt,
      };
      await recruiterService.updateTalentPoolEntry(selectedCandidate.id, request);
      toast.success(t("messages.candidateUpdated"));
      setEditSheetOpen(false);
      setSelectedCandidate(null);
      onSaved();
    } catch (error) {
      console.error("Failed to update candidate:", error);
      toast.error(t("messages.failedToUpdateCandidate"));
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !editForm.tags.includes(tagInput.trim())) {
      setEditForm({
        ...editForm,
        tags: [...editForm.tags, tagInput.trim()],
      });
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setEditForm({
      ...editForm,
      tags: editForm.tags.filter((t) => t !== tag),
    });
  };

  return {
    editSheetOpen,
    setEditSheetOpen,
    editForm,
    setEditForm,
    tagInput,
    setTagInput,
    handleEditCandidate,
    handleSaveEdit,
    handleAddTag,
    handleRemoveTag,
  };
}
