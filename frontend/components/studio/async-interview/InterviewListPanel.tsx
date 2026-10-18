import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Loader2, Users, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDeadline, statusColor, statusLabel } from "./helpers";
import { CopyInviteButton, ResendInviteButton } from "./InviteButtons";
import { InterviewResponses } from "./InterviewResponses";
import { useInterviewList } from "./useInterviewList";

function StatusCard({ className, children }: { className: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className={className}>{children}</CardContent>
    </Card>
  );
}

export function InterviewListPanel() {
  const { t } = useTranslation();
  const {
    interviews,
    loading,
    error,
    selectedId,
    responses,
    loadingResponses,
    fetchInterviews,
    viewResponses,
  } = useInterviewList();

  if (loading) {
    return (
      <StatusCard className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">
          {t("studio.asyncInterview.loadingInterviews")}
        </span>
      </StatusCard>
    );
  }

  if (error) {
    return (
      <StatusCard className="py-8 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="ghost" size="sm" className="mt-2" onClick={fetchInterviews}>
          {t("actions.tryAgain")}
        </Button>
      </StatusCard>
    );
  }

  if (interviews.length === 0) {
    return (
      <StatusCard className="py-12 text-center">
        <Users className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <p className="mt-3 text-sm text-muted-foreground">
          {t("studio.asyncInterview.emptyState")}
        </p>
      </StatusCard>
    );
  }

  return (
    <div className="space-y-3">
      {interviews.map((iv) => (
        <Card key={iv.id}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-medium">{iv.title}</h3>
                  <Badge
                    variant="secondary"
                    className={statusColor(iv.status)}
                  >
                    {statusLabel(t, iv.status)}
                  </Badge>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Video className="h-3 w-3" />
                    {t("studio.asyncInterview.questionCount", { count: iv.questions.length })}
                  </span>
                  {iv.deadline && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDeadline(t, iv.deadline)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {iv.inviteUrl && (
                  <CopyInviteButton url={iv.inviteUrl} />
                )}
                <ResendInviteButton
                  interviewId={iv.id}
                  status={iv.status}
                  onResent={fetchInterviews}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => viewResponses(iv.id)}
                >
                  {selectedId === iv.id
                    ? t("studio.asyncInterview.hideResponses")
                    : t("studio.asyncInterview.viewResponses")}
                </Button>
              </div>
            </div>

            {selectedId === iv.id && (
              <InterviewResponses
                interview={iv}
                responses={responses}
                loading={loadingResponses}
              />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
