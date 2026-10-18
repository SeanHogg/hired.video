import { useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { alertDialog } from "@/lib/dialogs";
import {
  jobBoardService,
  type JobBoardPostingDTO,
  type JobBoardStatsDTO,
} from "@/lib/services/job-board-service";

/** "Post job to boards" dialog state + submit. */
export function useJobBoardPostForm({
  jobBoardPostings,
  setJobBoardPostings,
  setJobBoardStats,
}: {
  jobBoardPostings: JobBoardPostingDTO[];
  setJobBoardPostings: Dispatch<SetStateAction<JobBoardPostingDTO[]>>;
  setJobBoardStats: Dispatch<SetStateAction<JobBoardStatsDTO | null>>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>([]);
  const [expirationDate, setExpirationDate] = useState<string>("");

  const cancel = () => {
    setOpen(false);
    setSelectedJobId("");
    setSelectedBoardIds([]);
    setExpirationDate("");
  };

  const toggleBoard = (boardId: string, checked: boolean) => {
    if (checked) {
      setSelectedBoardIds([...selectedBoardIds, boardId]);
    } else {
      setSelectedBoardIds(
        selectedBoardIds.filter((id) => id !== boardId)
      );
    }
  };

  const submit = async () => {
    if (!selectedJobId || selectedBoardIds.length === 0) {
      await alertDialog({ title: t("dialogs.outreach.errorTitle"), description: t("errors.selectJobBoard") });
      return;
    }

    try {
      const newPostings = await jobBoardService.postJobToBoards({
        jobId: selectedJobId,
        boardIds: selectedBoardIds,
        expirationDate: expirationDate || null,
      });

      setJobBoardPostings([...jobBoardPostings, ...newPostings]);
      setOpen(false);
      setSelectedJobId("");
      setSelectedBoardIds([]);
      setExpirationDate("");

      // Refresh stats
      const stats = await jobBoardService.getJobBoardStats();
      setJobBoardStats(stats);
    } catch (err) {
      console.error("Failed to post job to boards:", err);
      await alertDialog({ title: t("dialogs.outreach.errorTitle"), description: t("errors.postToBoardsFailed") });
    }
  };

  return {
    open,
    setOpen,
    selectedJobId,
    setSelectedJobId,
    selectedBoardIds,
    toggleBoard,
    expirationDate,
    setExpirationDate,
    cancel,
    submit,
  };
}

export type JobBoardPostFormState = ReturnType<typeof useJobBoardPostForm>;
