import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SubmitToJobForm, UserJobOption } from "@/components/people/people-helpers";

/** Confirm removing a candidate from the recruiter's Talent Pool. */
export function RemoveCandidateDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("actions.removeFromTalentPoolPrompt")}</AlertDialogTitle>
          <AlertDialogDescription>{t("messages.removeFromTalentPoolWarning")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t("actions.remove")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Submit a Talent Pool candidate to one of the viewer's jobs. */
export function SubmitToJobDialog({
  open,
  onOpenChange,
  candidateName,
  form: submitForm,
  onFormChange: setSubmitForm,
  availableJobs,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName: string | undefined;
  form: SubmitToJobForm;
  onFormChange: (form: SubmitToJobForm) => void;
  availableJobs: UserJobOption[];
  submitting: boolean;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("actions.submitCandidateToJob")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("messages.submitToJobDescription", { name: candidateName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="job-select">{t("fields.jobSelectModal.label")}</Label>
            <Select value={submitForm.jobId} onValueChange={(value) => setSubmitForm({ ...submitForm, jobId: value })}>
              <SelectTrigger id="job-select">
                <SelectValue placeholder={t("fields.jobSelectModal.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {availableJobs.map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    {job.title} - {job.company?.name || t("labels.unknownCompany")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="cover-letter">{t("labels.coverLetter")}</Label>
            <Textarea
              id="cover-letter"
              value={submitForm.coverLetter}
              onChange={(e) => setSubmitForm({ ...submitForm, coverLetter: e.target.value })}
              placeholder={t("fields.coverLetter.placeholder")}
              rows={4}
            />
          </div>
          <div>
            <Label htmlFor="recruiter-notes">{t("labels.recruiterNotesInternal")}</Label>
            <Textarea
              id="recruiter-notes"
              value={submitForm.recruiterNotes}
              onChange={(e) => setSubmitForm({ ...submitForm, recruiterNotes: e.target.value })}
              placeholder={t("fields.recruiterNotes.placeholder")}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="proposed-salary">{t("labels.proposedSalary")}</Label>
              <Input
                id="proposed-salary"
                type="number"
                value={submitForm.proposedSalary}
                onChange={(e) => setSubmitForm({ ...submitForm, proposedSalary: e.target.value })}
                placeholder={t("fields.proposedSalary.placeholder")}
              />
            </div>
            <div>
              <Label htmlFor="start-date">{t("labels.availableStartDate")}</Label>
              <Input
                id="start-date"
                type="date"
                value={submitForm.availableStartDate}
                onChange={(e) => setSubmitForm({ ...submitForm, availableStartDate: e.target.value })}
              />
            </div>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>{t("actions.cancel")}</AlertDialogCancel>
          <Button onClick={onSubmit} disabled={submitting || !submitForm.jobId}>
            {submitting ? t("status.submitting") : t("actions.submitCandidate")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
