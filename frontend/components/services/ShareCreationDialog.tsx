// ShareCreationDialog — creates a tokenized candidate-resume share link
// with an optional redaction profile + whitelabel brand kit. After a
// successful create, swaps the form for a copy-URL card so the recruiter
// can send the link to their hiring-client reviewer.

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, ShieldCheck } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import {
  recruitService,
  type CandidateResumeShareRow,
  type RecruitScope,
} from "@/lib/services/recruit-service";

interface ShareCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  candidateResumeId: string;
  scope: RecruitScope | null;
  onShareCreated?: (share: CandidateResumeShareRow) => void;
}

// Sentinel value for the "none" option — Radix Select disallows empty
// strings as SelectItem values, so we map "none" ↔ undefined ourselves.
const NONE = "__none__";

export default function ShareCreationDialog({
  open,
  onOpenChange,
  companyId,
  candidateResumeId,
  scope,
  onShareCreated,
}: ShareCreationDialogProps) {
  const { toast } = useToast();
  const [profileId, setProfileId] = useState<string>(NONE);
  const [brandKitId, setBrandKitId] = useState<string>(NONE);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CandidateResumeShareRow | null>(null);
  const [copied, setCopied] = useState(false);

  // When the dialog opens, default to the company's default redaction
  // profile if one exists — agencies almost always want redaction on.
  useEffect(() => {
    if (!open || !scope) return;
    const defaultProfile = scope.redactionProfiles.find(
      (p) => p.companyId === companyId && p.isDefault,
    );
    setProfileId(defaultProfile?.id ?? NONE);
    setBrandKitId(scope.brandKits[0]?.id ?? NONE);
    setRecipientEmail("");
    setExpiresAt("");
    setCreated(null);
    setCopied(false);
  }, [open, scope, companyId]);

  const companyProfiles = (scope?.redactionProfiles ?? []).filter(
    (p) => p.companyId === companyId,
  );

  const publicUrl = created
    ? `${window.location.origin}/share/candidate-resume/${created.shareToken}`
    : "";

  const handleCreate = async () => {
    try {
      setBusy(true);
      const share = await recruitService.createShare({
        companyId,
        candidateResumeId,
        redactionProfileId: profileId !== NONE ? profileId : undefined,
        whitelabelTenantId: brandKitId !== NONE ? brandKitId : undefined,
        recipientEmail: recipientEmail.trim() || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
      setCreated(share);
      onShareCreated?.(share);
      toast({
        title: "Share link created",
        description: "Copy the URL and send it to your hiring contact.",
      });
    } catch (e) {
      toast({
        title: "Failed to create share",
        description: (e as Error)?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Clipboard unavailable",
        description: "Copy the URL manually from the input.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Share candidate resume</DialogTitle>
          <DialogDescription>
            Create a tokenized link your hiring client can open without signing in. PII is
            stripped at render time per the redaction profile you pick — the recruiter's copy
            stays intact.
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="w-4 h-4 text-primary" />
                Share link ready
              </div>
              <div className="flex items-center gap-2">
                <Input readOnly value={publicUrl} className="font-mono text-xs" />
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 mr-1" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This link works without authentication. Revoke from the candidate detail page
                if the reviewer should lose access.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" asChild>
                <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-1" />
                  Preview as reviewer
                </a>
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Redaction profile</Label>
              <Select value={profileId} onValueChange={setProfileId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a profile" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>
                    None — use defaults (name, email, phone, LinkedIn hidden)
                  </SelectItem>
                  {companyProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.isDefault ? " (default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Manage profiles under <span className="font-medium">Recruit → Settings → Redaction</span>.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Agency brand kit (optional)</Label>
              <Select value={brandKitId} onValueChange={setBrandKitId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a brand kit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None — plain reviewer view</SelectItem>
                  {(scope?.brandKits ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Recipient email (optional)</Label>
                <Input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="reviewer@client.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Expires (optional)</Label>
                <Input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={busy}>
                {busy ? "Creating…" : "Create share link"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
