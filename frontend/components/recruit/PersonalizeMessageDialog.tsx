// PersonalizeMessageDialog — generates an AI-personalized outreach for one
// candidate AND creates a real campaign in /outreach so it shows up in the
// campaign log + sends through the existing CommunicationService pipeline
// (template-driven, recipient-tracked, send-event audited).
//
// Closes the integration gap flagged in code review: previously this dialog
// fired mailto: to the user's mail client, leaving the platform with no
// record of the touchpoint.

import { useState } from "react";
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
      const senderName = user?.name ?? user?.email ?? "Hiring team";
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
        title: "Generation failed",
        description: (e as Error)?.message ?? "Try again.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleCreateCampaign = async () => {
    if (!recipientEmail) {
      toast({ title: "No email on file for this candidate", variant: "destructive" });
      return;
    }
    if (!subject.trim() || !body.trim()) {
      toast({ title: "Generate a draft first", variant: "destructive" });
      return;
    }
    setSavingCampaign(true);
    try {
      // Two-step flow against the existing CommunicationService:
      //   1. Persist the personalized body as an EmailTemplate so the
      //      campaign system has a referencable artifact.
      //   2. Create a one-recipient EmailCampaign pointing at it.
      const template = await communicationService.createEmailTemplate({
        name: `Outreach to ${recipientName}${jobTitle ? ` — ${jobTitle}` : ""}`,
        description: "Generated from pipeline AI compose",
        subject,
        body,
        category: EmailTemplateCategory.Networking,
        targetRole: EmailTemplateTargetRole.Recruiter,
      });
      const campaign = await communicationService.createEmailCampaign({
        name: `Outreach to ${recipientName}${jobTitle ? ` — ${jobTitle}` : ""}`,
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
        title: "Campaign drafted",
        description: "Open in /outreach to review and send.",
      });
      onCampaignCreated?.(campaign.id);
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Campaign creation failed",
        description: (e as Error)?.message ?? "Try again.",
        variant: "destructive",
      });
    } finally {
      setSavingCampaign(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    toast({ title: "Copied", description: "Subject + body in your clipboard." });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            AI compose for {recipientName}
          </DialogTitle>
          <DialogDescription>
            {jobTitle ? `Outreach about “${jobTitle}”. ` : ""}
            Drafts a personalized message and saves it as a one-recipient campaign
            in <button className="underline" onClick={() => navigate("/outreach")}>/outreach</button> —
            send + track from there.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="personalize-tone">Tone</Label>
              <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
                <SelectTrigger id="personalize-tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="concise">Concise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="personalize-context">Extra context (optional)</Label>
              <Input
                id="personalize-context"
                placeholder="Mutual connection, recent post, specific role detail…"
                value={context}
                onChange={(e) => setContext(e.target.value)}
              />
            </div>
          </div>

          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-1" />
                {subject ? "Regenerate" : "Generate"}
              </>
            )}
          </Button>

          {(subject || body) && (
            <div className="space-y-2 border rounded p-3 bg-muted/30">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">
                  Tier: <span className="uppercase">{tier ?? "basic"}</span>
                </span>
                {note && <span className="text-muted-foreground italic">{note}</span>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="personalize-subject">Subject</Label>
                <Input
                  id="personalize-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="personalize-body">Body</Label>
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
            Close
          </Button>
          <Button variant="outline" onClick={handleCopy} disabled={!subject && !body}>
            <Copy className="w-3.5 h-3.5 mr-1" />
            Copy
          </Button>
          <Button variant="outline" onClick={() => navigate("/outreach")}>
            <ExternalLink className="w-3.5 h-3.5 mr-1" />
            Open /outreach
          </Button>
          <Button onClick={handleCreateCampaign} disabled={savingCampaign || !recipientEmail || (!subject && !body)}>
            {savingCampaign ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5 mr-1" />
                Save as campaign
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
