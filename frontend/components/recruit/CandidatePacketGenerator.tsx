// CandidatePacketGenerator (#243) — recruiter → hiring-manager submission
// artefact. Lets a recruiter pick a shortlist of their submissions and open a
// print-ready multi-candidate packet (browser → Save as PDF), optionally
// anonymized (names → initials, email + photo hidden) for bias-reduced review.
//
// Self-contained: owns selection + anonymize state and the URL building, so a
// host surface only passes the submissions it already has. Renders nothing
// when there are no submissions to export.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface PacketSubmission {
  id: string;
  candidateName: string;
  jobTitle: string;
}

interface Props {
  submissions: PacketSubmission[];
}

export default function CandidatePacketGenerator({ submissions }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anonymize, setAnonymize] = useState(false);

  if (submissions.length === 0) return null;

  const allSelected = selected.size === submissions.length;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(submissions.map((s) => s.id)));

  const generate = () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const url = `/api/recruiter/submissions/packet?ids=${encodeURIComponent(
      ids.join(","),
    )}&anonymize=${anonymize ? "1" : "0"}`;
    window.open(url, "_blank", "noopener");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <FileDown className="h-4 w-4 mr-2" />
          {t("candidatePacket.trigger")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <div>
            <h3 className="font-semibold text-sm">{t("candidatePacket.title")}</h3>
            <p className="text-xs text-muted-foreground">{t("candidatePacket.description")}</p>
          </div>

          <button
            type="button"
            onClick={toggleAll}
            className="text-xs text-primary hover:underline"
          >
            {allSelected ? t("candidatePacket.clearAll") : t("candidatePacket.selectAll")}
          </button>

          <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
            {submissions.map((s) => (
              <label
                key={s.id}
                className="flex items-start gap-2 rounded-md px-1 py-1.5 hover:bg-muted cursor-pointer"
              >
                <Checkbox
                  checked={selected.has(s.id)}
                  onCheckedChange={() => toggle(s.id)}
                  className="mt-0.5"
                />
                <span className="text-sm leading-tight">
                  <span className="font-medium">{s.candidateName}</span>
                  <span className="text-muted-foreground"> · {s.jobTitle}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <Label htmlFor="packet-anonymize" className="text-sm">
              {t("candidatePacket.anonymize")}
            </Label>
            <Switch id="packet-anonymize" checked={anonymize} onCheckedChange={setAnonymize} />
          </div>
          <p className="text-xs text-muted-foreground -mt-1">
            {t("candidatePacket.anonymizeHelp")}
          </p>

          <Button className="w-full" size="sm" disabled={selected.size === 0} onClick={generate}>
            {t("candidatePacket.generate", { count: selected.size })}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
