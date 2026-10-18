import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { JobBoardDTO } from "@/lib/services/job-board-service";
import type { JobSummary } from "@/lib/services/job-service";
import type { JobBoardPostFormState } from "@/components/outreach/hooks/useJobBoardPostForm";
import { UserJobSelect } from "@/components/outreach/dialogs/UserJobSelect";

/** Job Board Posting Dialog — distribute one job to several boards. */
export function JobBoardPostDialog({
  state,
  jobBoards,
  userJobs,
}: {
  state: JobBoardPostFormState;
  jobBoards: JobBoardDTO[];
  userJobs: JobSummary[];
}) {
  const { t } = useTranslation();
  const { selectedJobId, selectedBoardIds } = state;
  return (
    <Dialog open={state.open} onOpenChange={state.setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("actions.postJobToBoards")}</DialogTitle>
          <DialogDescription>
            {t("messages.distributeJobToMore")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="job-select">{t("fields.selectJob.label")}</Label>
            <UserJobSelect
              triggerId="job-select"
              value={selectedJobId}
              onValueChange={state.setSelectedJobId}
              placeholder={t("fields.selectJob.placeholder")}
              userJobs={userJobs}
              emptyValue="no-jobs"
              emptyLabel={t("messages.noJobsAvailable")}
            />
          </div>

          <div>
            <Label htmlFor="expiration-date">{t("fields.expirationDate.label")}</Label>
            <Input
              id="expiration-date"
              type="date"
              value={state.expirationDate}
              onChange={(e) => state.setExpirationDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
            />
          </div>

          <div>
            <Label>{t("fields.selectJobBoards.label")}</Label>
            <div className="grid grid-cols-2 gap-4 mt-2">
              {jobBoards.map((board) => (
                <div key={board.id} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id={`board-${board.id}`}
                    checked={selectedBoardIds.includes(board.id)}
                    onChange={(e) => state.toggleBoard(board.id, e.target.checked)}
                    className="rounded border-border"
                  />
                  <label
                    htmlFor={`board-${board.id}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {board.name}
                    {board.costPerPosting && (
                      <span className="text-muted-foreground ml-2">
                        (${board.costPerPosting})
                      </span>
                    )}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {jobBoards.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>{t("messages.noJobBoardsAvailable")}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={state.cancel}>
            {t("actions.cancel")}
          </Button>
          <Button
            onClick={state.submit}
            disabled={!selectedJobId || selectedBoardIds.length === 0}
          >
            {t("actions.postToCount", { count: selectedBoardIds.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
