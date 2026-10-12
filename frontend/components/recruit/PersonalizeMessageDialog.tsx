// PersonalizeMessageDialog — generates an AI-personalized outreach for one
// candidate AND creates a real campaign in /outreach so it shows up in the
// campaign log + sends through the existing CommunicationService pipeline
// (template-driven, recipient-tracked, send-event audited).
//
// Closes the integration gap flagged in code review: previously this dialog
// fired mailto: to the user's mail client, leaving the platform with no
// record of the touchpoint.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, ExternalLink, Loader2, Send, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { communicationService } from "@/lib/services/communication-service";
import {
  EmailTemplateCategory,
  EmailTemplateTargetRole,
} from "@/types/communication";
import type { PersonalizeResponse, PersonalizeTier } from "@shared/tier-copy";

interface PersonalizeMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientName: string;
  recipientEmail?: string | null;
  recipientLocation?: string | null;
  jobTitle?: string;
  /** Fired after a campaign is created so the caller can log a pipeline
   *  touchpoint or refresh state. Receives the new campaign id. */
  onCampaignCreated?: (campaignId: string) => void;
}

export default function PersonalizeMessageDialog({
  open,
  onOpenChange,
  recipientName,
  recipientEmail,
  recipientLocation,
  jobTitle,
  onCampaignCreated,
}: PersonalizeMessageDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [generating, setGenerating] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [tone, setTone] = useState<"professional" | "friendly" | "concise">("professional");
  const [context, setContext] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [tier, setTier] = useState<PersonalizeTier | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const senderName = user?.name ?? user?.email ?? t("labels.hiringTeam");
      const response = await apiClient.post<PersonalizeResponse>("/api/messages/personalize", {
        recipientName,
        recipientCompany: recipientLocation ?? undefined,
        jobTitle,
        senderName,
        context: context.trim() || undefined,
        tone,
      });
      setSubject(response.data.subject);
      setBody(response.data.body);
      setTier(response.data.tier);
      setNote(response.data.note ?? null);
    } catch (e) {
      toast({
        title: t("errors.generationFailed"),
        description: (e as Error)?.message ?? t("errors.tryAgain"),
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleCreateCampaign = async () => {
    if (!recipientEmail) {
      toast({ title: t("errors.noEmailOnFile"), variant: "destructive" });
      return;
    }
    if (!subject.trim() || !body.trim()) {
      toast({ title: t("errors.generateDraftFirst"), variant: "destructive" });
      return;
    }
    setSavingCampaign(true);
    try {
      // Two-step flow against the existing CommunicationService:
      //   1. Persist the personalized body as an EmailTemplate so the
      //      campaign system has a referencable artifact.
      //   2. Create a one-recipient EmailCampaign pointing at it.
      const campaignName = t("labels.outreachToName", {
        name: recipientName,
        jobSuffix: jobTitle ? ` — ${jobTitle}` : "",
      });
      const template = await communicationService.createEmailTemplate({
        name: campaignName,
        description: t("messages.generatedFromPipelineCompose"),
        subject,
        body,
        category: EmailTemplateCategory.Networking,
        targetRole: EmailTemplateTargetRole.Recruiter,
      });
      const campaign = await communicationService.createEmailCampaign({
        name: campaignName,
        subject,
        emailTemplateId: template.id,
        recipients: [
          {
            email: recipientEmail,
            name: recipientName,
            personalizationData: {
              candidateName: recipientName,
              jobTitle: jobTitle ?? "",
            },
          },
        ],
      });
      toast({
        title: t("messages.campaignDrafted"),
        description: t("messages.campaignDraftedDesc"),
      });
      onCampaignCreated?.(campaign.id);
      onOpenChange(false);
    } catch (e) {
      toast({
        title: t("errors.campaignCreationFailed"),
        description: (e as Error)?.message ?? t("errors.tryAgain"),
        variant: "destructive",
      });
    } finally {
      setSavingCampaign(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(`${t("fields.subject.label")}: ${subject}\n\n${body}`);
    toast({ title: t("messages.copied"), description: t("labels.copiedSubjectBodyDesc") });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            {t("headings.aiComposeFor", { name: recipientName })}
          </DialogTitle>
          <DialogDescription>
            {jobTitle ? t("messages.aiComposeOutreachAbout", { title: jobTitle }) : ""}
            {t("messages.composedOutreachIntroPart1")}{" "}
            <button className="underline" onClick={() => navigate("/outreach")}>
              /outreach
            </button>{" "}
            {t("messages.composedOutreachIntroPart2")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="personalize-tone">{t("fields.tone.label")}</Label>
              <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
                <SelectTrigger id="personalize-tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">{t("labels.tone.professional")}</SelectItem>
                  <SelectItem value="friendly">{t("labels.tone.friendly")}</SelectItem>
                  <SelectItem value="concise">{t("labels.tone.concise")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="personalize-context">{t("fields.context.label")}</Label>
              <Input
                id="personalize-context"
                placeholder={t("fields.context.placeholder")}
                value={context}
                onChange={(e) => setContext(e.target.value)}
              />
            </div>
          </div>

          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                {t("status.generating")}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-1" />
                {subject ? t("actions.regenerate") : t("actions.generate")}
              </>
            )}
          </Button>

          {(subject || body) && (
            <div className="space-y-2 border rounded p-3 bg-muted/30">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">
                  {t("labels.tierColon")}{" "}
                  <span className="uppercase">{tier ?? t("labels.tierBasic")}</span>
                </span>
                {note && <span className="text-muted-foreground italic">{note}</span>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="personalize-subject">{t("fields.subject.label")}</Label>
                <Input
                  id="personalize-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="personalize-body">{t("fields.body.label")}</Label>
                <Textarea
                  id="personalize-body"
                  rows={10}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("actions.close")}
          </Button>
          <Button variant="outline" onClick={handleCopy} disabled={!subject && !body}>
            <Copy className="w-3.5 h-3.5 mr-1" />
            {t("actions.copy")}
          </Button>
          <Button variant="outline" onClick={() => navigate("/outreach")}>
            <ExternalLink className="w-3.5 h-3.5 mr-1" />
            {t("actions.openOutreach")}
          </Button>
          <Button onClick={handleCreateCampaign} disabled={savingCampaign || !recipientEmail || (!subject && !body)}>
            {savingCampaign ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                {t("status.saving")}
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5 mr-1" />
                {t("actions.saveAsCampaign")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
