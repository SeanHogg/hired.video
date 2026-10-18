import { Briefcase, Building2, Edit, FileText, Phone, Tag, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { publicProfilePath } from "@shared/public-paths";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { TalentPoolEntry } from "@/lib/services/recruiter-service";
import { formatPeopleDate } from "@/components/people/people-helpers";
import { PeopleCardListSkeleton, PeopleTabEmptyCard } from "@/components/people/PeopleTabStates";

interface TalentPoolCandidateActions {
  onSubmitToJob: (candidate: TalentPoolEntry) => void;
  onLogInteraction: (candidate: TalentPoolEntry) => void;
  onEdit: (candidate: TalentPoolEntry) => void;
  onRemove: (candidateId: string) => void;
}

interface TalentPoolTabProps extends TalentPoolCandidateActions {
  talentPool: TalentPoolEntry[];
  isLoading: boolean;
  onBrowse: () => void;
}

/** Recruiter Talent Pool tab body (/people?tab=talent-pool). */
export default function TalentPoolTab({
  talentPool,
  isLoading,
  onBrowse,
  ...actions
}: TalentPoolTabProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      {isLoading ? (
        <PeopleCardListSkeleton />
      ) : talentPool.length === 0 ? (
        <PeopleTabEmptyCard
          icon={Briefcase}
          title={t("messages.noCandidatesInPool")}
          description={t("messages.startAddingFromBrowse")}
          actionLabel={t("actions.browseCandidates")}
          onAction={onBrowse}
        />
      ) : (
        <div className="space-y-4">
          {talentPool.map((candidate) => (
            <TalentPoolCandidateCard key={candidate.id} candidate={candidate} {...actions} />
          ))}
        </div>
      )}
    </div>
  );
}

function TalentPoolCandidateCard({
  candidate,
  onSubmitToJob,
  onLogInteraction,
  onEdit,
  onRemove,
}: TalentPoolCandidateActions & { candidate: TalentPoolEntry }) {
  const { t } = useTranslation();
  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              {candidate.candidateProfilePicture && (
                <img
                  src={candidate.candidateProfilePicture}
                  alt={candidate.candidateName}
                  className="w-12 h-12 rounded-full object-cover"
                />
              )}
              <div>
                <Link
                  to={publicProfilePath(candidate.candidateUserId)}
                  className="text-xl font-semibold hover:text-primary transition-colors"
                >
                  {candidate.candidateName}
                </Link>
                {candidate.candidateTitle && (
                  <p className="text-sm text-muted-foreground">{candidate.candidateTitle}</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="outline">{candidate.relationshipStrength}</Badge>
              <Badge variant="secondary">{candidate.status}</Badge>
              {candidate.poolName && <Badge variant="default">{candidate.poolName}</Badge>}
              {candidate.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  <Tag className="h-3 w-3 mr-1" />
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => onSubmitToJob(candidate)}
              title={t("actions.submitToJob")}
            >
              <FileText className="h-4 w-4 mr-2" />
              {t("actions.submitToJob")}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onLogInteraction(candidate)}
              title={t("actions.logInteraction")}
            >
              <Phone className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(candidate)}
              title={t("actions.edit")}
            >
              <Edit className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRemove(candidate.id)}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              title={t("actions.remove")}
            >
              <Trash2 className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {candidate.currentCompany && (
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span>{candidate.currentCompany}</span>
              {candidate.currentTitle && <span>• {candidate.currentTitle}</span>}
            </div>
          )}
          {candidate.notes && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm font-medium mb-1">{t("labels.notesColon")}</p>
              <p className="text-sm text-muted-foreground">{candidate.notes}</p>
            </div>
          )}
          <div className="flex items-center justify-between pt-3 border-t text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              {candidate.lastContactedAt && (
                <span>{t("labels.lastContactPrefix", { date: formatPeopleDate(candidate.lastContactedAt) })}</span>
              )}
              {candidate.nextFollowUpAt && (
                <span className="text-amber-600 font-medium">
                  {t("labels.followUpPrefix", { date: formatPeopleDate(candidate.nextFollowUpAt) })}
                </span>
              )}
            </div>
            <span>{t("labels.addedDate", { date: formatPeopleDate(candidate.createdAt) })}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
