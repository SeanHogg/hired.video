// AddPipelineCandidateDialog — the "Add People" modal. Manual entry only in
// v1; bulk import + "find from talent pool" attachment lands in a follow-up.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PIPELINE_STAGES,
  type PipelineStage,
  type AddPipelineEntryInput,
} from "@/lib/services/job-pipeline-service";

interface AddPipelineCandidateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (input: AddPipelineEntryInput) => Promise<void>;
}

export default function AddPipelineCandidateDialog({
  open,
  onOpenChange,
  onAdd,
}: AddPipelineCandidateDialogProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");
  const [stage, setStage] = useState<PipelineStage>("applied");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setName("");
    setEmail("");
    setPhone("");
    setLocation("");
    setLinkedin("");
    setResumeUrl("");
    setStage("applied");
    setNotes("");
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onAdd({
        candidateName: name.trim(),
        candidateEmail: email.trim() || undefined,
        candidatePhone: phone.trim() || undefined,
        candidateLocation: location.trim() || undefined,
        candidateLinkedinUrl: linkedin.trim() || undefined,
        candidateResumeUrl: resumeUrl.trim() || undefined,
        stage,
        notes: notes.trim() || undefined,
      });
      reset();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("actions.addCandidateToPipeline")}</DialogTitle>
          <DialogDescription>
            {t("messages.sourcingAddDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1">
            <Label htmlFor="candidate-name">{t("fields.name.requiredLabel")}</Label>
            <Input id="candidate-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="candidate-email">{t("fields.email.label")}</Label>
              <Input id="candidate-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="candidate-phone">{t("fields.phone.label")}</Label>
              <Input id="candidate-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="candidate-location">{t("fields.location.label")}</Label>
            <Input id="candidate-location" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="candidate-linkedin">{t("fields.linkedinUrl.label")}</Label>
            <Input id="candidate-linkedin" type="url" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="candidate-resume">{t("fields.resumeUrl.label")}</Label>
            <Input id="candidate-resume" type="url" value={resumeUrl} onChange={(e) => setResumeUrl(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="candidate-stage">{t("fields.initialStage.label")}</Label>
            <Select value={stage} onValueChange={(v) => setStage(v as PipelineStage)}>
              <SelectTrigger id="candidate-stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PIPELINE_STAGES.filter((s) => s !== "rejected").map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`pipelineStage.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="candidate-notes">{t("fields.notes.label")}</Label>
            <Textarea
              id="candidate-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={t("fields.notes.placeholderSourcing")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={busy || !name.trim()}>
            {busy ? t("status.adding") : t("actions.addCandidate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
