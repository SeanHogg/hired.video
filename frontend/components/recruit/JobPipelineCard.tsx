// JobPipelineCard — single candidate card on the pipeline kanban. The
// per-card icon strip (Email, Phone/SMS, Resume, LinkedIn) mirrors the
// Loxo pattern; "Find Contact" enrichment is deferred to v2.

import { Mail, Phone, FileText, Linkedin, MoreHorizontal, MapPin, Clock, Trash2 } from "lucide-react";
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
  PIPELINE_STAGE_LABELS,
  type PipelineEntry,
  type PipelineStage,
} from "@/lib/services/job-pipeline-service";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";
}

function daysSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
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
          {entry.candidateLocation && (
            <p className="text-xs text-muted-foreground truncate">{entry.candidateLocation}</p>
          )}
        </div>
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(entry.id)}
          aria-label={`Select ${entry.candidateName}`}
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
          title={entry.candidateEmail ?? "No email on file"}
        >
          {entry.candidateEmail ? (
            <a href={`mailto:${entry.candidateEmail}`}>
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
          title={entry.candidatePhone ? `SMS ${entry.candidatePhone}` : "No phone on file"}
        >
          {entry.candidatePhone ? (
            <a href={`sms:${entry.candidatePhone}`}>
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
          title={entry.candidateResumeUrl ? "View resume" : "No resume on file"}
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
          title={entry.candidateLinkedinUrl ? "LinkedIn profile" : "No LinkedIn on file"}
        >
          {entry.candidateLinkedinUrl ? (
            <a href={entry.candidateLinkedinUrl} target="_blank" rel="noopener noreferrer">
              <Linkedin className="w-3.5 h-3.5" />
            </a>
          ) : (
            <Linkedin className="w-3.5 h-3.5" />
          )}
        </Button>

        <div className="flex-1" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Move or remove">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Move to stage</DropdownMenuLabel>
            {PIPELINE_STAGES.filter((s) => s !== entry.stage).map((s) => (
              <DropdownMenuItem key={s} onClick={() => onMoveStage(entry.id, s)}>
                {PIPELINE_STAGE_LABELS[s]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onRemove(entry.id)}
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.tags.slice(0, 3).map((t) => (
            <span key={t} className="text-[10px] uppercase tracking-wide bg-muted px-1.5 py-0.5 rounded">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {daysSince(entry.stageChangedAt)} in stage
        </span>
        {entry.candidateLocation && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3 h-3" />
          </span>
        )}
      </div>
    </div>
  );
}
