// JobPipelineCard — single candidate card on the pipeline kanban. The
// per-card icon strip (Email, Phone/SMS, Resume, LinkedIn, AI compose)
// mirrors the Loxo pattern; "Find Contact" enrichment is deferred to v2.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail, Phone, FileText, Linkedin, MoreHorizontal, MapPin, Clock, Trash2, Sparkles, ClipboardCheck, Briefcase } from "lucide-react";
import { initials } from "@/lib/format";
import { daysSince } from "@/lib/utils/datetime";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PIPELINE_STAGES,
  jobPipelineService,
  type PipelineEntry,
  type PipelineStage,
} from "@/lib/services/job-pipeline-service";
import PersonalizeMessageDialog from "@/components/recruit/PersonalizeMessageDialog";
import SendScreeningDialog from "@/components/jobs/SendScreeningDialog";
import AssignActivityButton from "@/components/activities/AssignActivityButton";
import { PitchSheetButton } from "@/components/pitch/PitchPlayer";

/** Fire-and-forget touchpoint log — never blocks the click handler. */
function logTouchpointSafe(jobId: string, entryId: string, type: "email" | "sms") {
  void jobPipelineService.logTouchpoint(jobId, entryId, type).catch(() => {
    // Touchpoint capture is best-effort; UI click already happened.
  });
}

interface JobPipelineCardProps {
  entry: PipelineEntry;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onMoveStage: (id: string, next: PipelineStage) => void;
  onRemove: (id: string) => void;
}

export default function JobPipelineCard({
  entry,
  selected,
  onToggleSelect,
  onMoveStage,
  onRemove,
}: JobPipelineCardProps) {
  const { t } = useTranslation();
  const [composeOpen, setComposeOpen] = useState(false);
  const [screeningOpen, setScreeningOpen] = useState(false);

  return (
    <div className="rounded-lg border bg-card p-3 hover:shadow-md transition-shadow space-y-2">
      <div className="flex items-start gap-2">
        <Avatar className="w-9 h-9">
          {entry.candidateAvatarUrl && <AvatarImage src={entry.candidateAvatarUrl} alt={entry.candidateName} />}
          <AvatarFallback className="text-xs">{initials(entry.candidateName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm truncate">{entry.candidateName}</p>
          </div>
          {/* Cross-job board (#405): label which job this card belongs to. On a
              per-job board `jobTitle` is absent, so this row simply doesn't render. */}
          {entry.jobTitle && (
            <p className="text-xs text-primary truncate inline-flex items-center gap-1">
              <Briefcase className="w-3 h-3" />
              {t("labels.forJob", { job: entry.jobTitle })}
            </p>
          )}
          {entry.candidateLocation && (
            <p className="text-xs text-muted-foreground truncate">{entry.candidateLocation}</p>
          )}
        </div>
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(entry.id)}
          aria-label={t("labels.selectAriaName", { name: entry.candidateName })}
        />
      </div>

      {/* Inline actions: mailto/tel/resume/LinkedIn open in new tab. SMS uses
          the sms: scheme which Android + iOS both honour. Buttons are
          disabled when the corresponding contact field is empty. */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          asChild={Boolean(entry.candidateEmail)}
          disabled={!entry.candidateEmail}
          title={entry.candidateEmail ?? t("labels.noEmailOnFile")}
        >
          {entry.candidateEmail ? (
            <a
              href={`mailto:${entry.candidateEmail}`}
              onClick={() => logTouchpointSafe(entry.jobId, entry.id, "email")}
            >
              <Mail className="w-3.5 h-3.5" />
            </a>
          ) : (
            <Mail className="w-3.5 h-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          asChild={Boolean(entry.candidatePhone)}
          disabled={!entry.candidatePhone}
          title={entry.candidatePhone ? t("labels.smsTo", { phone: entry.candidatePhone }) : t("labels.noPhoneOnFile")}
        >
          {entry.candidatePhone ? (
            <a
              href={`sms:${entry.candidatePhone}`}
              onClick={() => logTouchpointSafe(entry.jobId, entry.id, "sms")}
            >
              <Phone className="w-3.5 h-3.5" />
            </a>
          ) : (
            <Phone className="w-3.5 h-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          asChild={Boolean(entry.candidateResumeUrl)}
          disabled={!entry.candidateResumeUrl}
          title={entry.candidateResumeUrl ? t("actions.viewResume") : t("labels.noResumeOnFile")}
        >
          {entry.candidateResumeUrl ? (
            <a href={entry.candidateResumeUrl} target="_blank" rel="noopener noreferrer">
              <FileText className="w-3.5 h-3.5" />
            </a>
          ) : (
            <FileText className="w-3.5 h-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          asChild={Boolean(entry.candidateLinkedinUrl)}
          disabled={!entry.candidateLinkedinUrl}
          title={entry.candidateLinkedinUrl ? t("labels.linkedinProfile") : t("labels.noLinkedinOnFile")}
        >
          {entry.candidateLinkedinUrl ? (
            <a href={entry.candidateLinkedinUrl} target="_blank" rel="noopener noreferrer">
              <Linkedin className="w-3.5 h-3.5" />
            </a>
          ) : (
            <Linkedin className="w-3.5 h-3.5" />
          )}
        </Button>
        {/* #2133 — the candidate's video pitch (self-gates when none). */}
        <PitchSheetButton pitch={entry.candidatePitch} name={entry.candidateName} />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setComposeOpen(true)}
          title={t("labels.aiComposeOutreach")}
        >
          <Sparkles className="w-3.5 h-3.5" />
        </Button>

        <div className="flex-1" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" title={t("labels.moveOrRemove")}>
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>{t("labels.moveToStage")}</DropdownMenuLabel>
            {PIPELINE_STAGES.filter((s) => s !== entry.stage).map((s) => (
              <DropdownMenuItem key={s} onClick={() => onMoveStage(entry.id, s)}>
                {t(`pipelineStage.${s}`)}
              </DropdownMenuItem>
            ))}
            {entry.jobApplicationId && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setScreeningOpen(true)}>
                  <ClipboardCheck className="w-3.5 h-3.5 mr-2" />
                  {t("actions.sendScreening", "Send screening")}
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onRemove(entry.id)}
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" />
              {t("actions.remove")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Hired → put them to work. AssignActivityButton self-gates on the
          viewer's role; we only surface it once the candidate is hired and
          has a linked account to own the activity. */}
      {entry.stage === "hired" && entry.candidateUserId && (
        <AssignActivityButton
          className="w-full"
          worker={{ userId: entry.candidateUserId, name: entry.candidateName }}
        />
      )}

      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-[10px] uppercase tracking-wide bg-muted px-1.5 py-0.5 rounded">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {t("labels.inStage", { days: daysSince(entry.stageChangedAt) })}
        </span>
        {entry.candidateLocation && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3 h-3" />
          </span>
        )}
      </div>

      <PersonalizeMessageDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        recipientName={entry.candidateName}
        recipientEmail={entry.candidateEmail}
        recipientLocation={entry.candidateLocation}
      />

      <SendScreeningDialog
        applicationId={entry.jobApplicationId}
        candidateName={entry.candidateName}
        open={screeningOpen}
        onOpenChange={setScreeningOpen}
      />
    </div>
  );
}
