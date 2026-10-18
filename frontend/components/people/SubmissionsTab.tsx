import { Calendar, Clock, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { statusLabelKey } from "@shared/statuses";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import CandidatePacketGenerator from "@/components/recruit/CandidatePacketGenerator";
import type { SubmissionDTO } from "@/lib/services/submission-service";
import { formatPeopleDate } from "@/components/people/people-helpers";
import { PeopleCardListSkeleton, PeopleTabEmptyCard } from "@/components/people/PeopleTabStates";

type BadgeVariant = "default" | "destructive" | "secondary" | "outline";

function submissionBadgeVariant(status: SubmissionDTO["status"]): BadgeVariant {
  if (status === "placed") return "default";
  if (status === "rejected" || status === "withdrawn") return "destructive";
  if (status === "interviewing") return "secondary";
  return "outline";
}

/** Hiring-side Submissions tab body (/people?tab=submissions). */
export default function SubmissionsTab({
  submissions,
  isLoading,
  onGoToTalentPool,
}: {
  submissions: SubmissionDTO[];
  isLoading: boolean;
  onGoToTalentPool: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      {isLoading ? (
        <PeopleCardListSkeleton />
      ) : submissions.length === 0 ? (
        <PeopleTabEmptyCard
          icon={FileText}
          title={t("messages.noSubmissionsYet")}
          description={t("messages.submitFromTalentPool")}
          actionLabel={t("actions.goToTalentPool")}
          onAction={onGoToTalentPool}
        />
      ) : (
        <div className="space-y-4">
          {/* #243 — bundle selected submissions into a print-ready
              packet for the hiring manager (optional anonymize). */}
          <div className="flex justify-end">
            <CandidatePacketGenerator
              submissions={submissions.map((s) => ({
                id: s.id,
                candidateName: s.candidateName,
                jobTitle: s.jobTitle,
              }))}
            />
          </div>
          {submissions.map((submission) => (
            <SubmissionCard key={submission.id} submission={submission} />
          ))}
        </div>
      )}
    </div>
  );
}

function SubmissionCard({ submission }: { submission: SubmissionDTO }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">
              {submission.candidateName} → {submission.jobTitle}
            </CardTitle>
            <CardDescription>
              {submission.companyName} • {t("messages.people.submittedDate", { date: formatPeopleDate(submission.submittedAt) })}
            </CardDescription>
          </div>
          <Badge variant={submissionBadgeVariant(submission.status)}>
            {t(statusLabelKey("submission", submission.status), { defaultValue: submission.status })}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          {submission.proposedSalary && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t("labels.proposedSalaryColon")}</span>
              <span className="font-medium">${submission.proposedSalary.toLocaleString()}</span>
            </div>
          )}
          {submission.availableStartDate && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t("labels.availableColon")}</span>
              <span>{formatPeopleDate(submission.availableStartDate)}</span>
            </div>
          )}
          {submission.interviewDate && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t("labels.interviewColon")}</span>
              <span>{formatPeopleDate(submission.interviewDate)}</span>
            </div>
          )}
          {submission.statusNotes && (
            <div className="mt-2 p-2 bg-muted rounded-md">
              <p className="text-xs text-muted-foreground">{t("labels.notesColon")}</p>
              <p className="text-sm">{submission.statusNotes}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
