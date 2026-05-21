import { useEffect, useMemo, useState } from "react";
import { Loader2, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import Markdown from "@/components/Markdown";
import { UpgradePrompt } from "@/components/ads/UpgradePrompt";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import {
  creatorService,
  legalService,
  CREATOR_PROGRAMS,
  CREATOR_PROGRAM_LABEL,
  CREATOR_PROGRAM_DESCRIPTION,
  CREATOR_PROGRAM_ICON,
  CREATOR_PROGRAM_TERMS_KIND,
  type CreatorProgram,
  type CreatorProfile,
  type LegalDocument,
} from "@/lib/services/creator-service";

// Empty per-program records seeded from the SSoT program list so adding a
// new program in shared/creator-programs.ts doesn't require touching this
// file. Computed once at module load.
function emptyDocsRecord(): Record<CreatorProgram, LegalDocument | null> {
  return Object.fromEntries(CREATOR_PROGRAMS.map((p) => [p, null])) as Record<CreatorProgram, LegalDocument | null>;
}
function emptyAcceptedRecord(): Record<CreatorProgram, boolean> {
  return Object.fromEntries(CREATOR_PROGRAMS.map((p) => [p, false])) as Record<CreatorProgram, boolean>;
}

type Step = "programs" | "terms" | "profile";

interface Props {
  open: boolean;
  onClose: () => void;
  onEnrolled: (profile: CreatorProfile) => void;
}

export default function CreatorEnrollmentWizard({ open, onClose, onEnrolled }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("programs");
  const [selected, setSelected] = useState<Set<CreatorProgram>>(new Set());
  const [docs, setDocs] = useState<Record<CreatorProgram, LegalDocument | null>>(emptyDocsRecord);
  const [accepted, setAccepted] = useState<Record<CreatorProgram, boolean>>(emptyAcceptedRecord);
  const [docsLoading, setDocsLoading] = useState(false);

  // Step 3 fields seed from the user's existing profile so they aren't
  // re-typing data we already have. They can override before enrolling.
  const [displayName, setDisplayName] = useState("");
  const [tagline, setTagline] = useState("");
  const [bio, setBio] = useState("");

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setDisplayName(user?.name ?? "");
      setTagline(user?.headline ?? "");
      setBio(user?.bio ?? "");
    } else {
      setStep("programs");
      setSelected(new Set());
      setAccepted(emptyAcceptedRecord());
      setDocs(emptyDocsRecord());
      setDisplayName("");
      setTagline("");
      setBio("");
    }
  }, [open, user?.name, user?.headline, user?.bio]);

  const selectedList = useMemo(() => CREATOR_PROGRAMS.filter((p) => selected.has(p)), [selected]);

  const loadDocsForSelected = async () => {
    setDocsLoading(true);
    try {
      const entries = await Promise.all(
        selectedList.map(async (p) => [p, await legalService.getCurrent(CREATOR_PROGRAM_TERMS_KIND[p])] as const),
      );
      const next: Record<CreatorProgram, LegalDocument | null> = emptyDocsRecord();
      for (const [p, d] of entries) next[p] = d;
      setDocs(next);
    } finally {
      setDocsLoading(false);
    }
  };

  const goNext = async () => {
    if (step === "programs") {
      if (selectedList.length === 0) {
        toast({ title: "Pick at least one program", variant: "destructive" });
        return;
      }
      await loadDocsForSelected();
      setStep("terms");
    } else if (step === "terms") {
      const allAccepted = selectedList.every((p) => accepted[p]);
      if (!allAccepted) {
        toast({ title: "Accept all program terms to continue", variant: "destructive" });
        return;
      }
      setStep("profile");
    }
  };

  const goBack = () => {
    if (step === "terms") setStep("programs");
    else if (step === "profile") setStep("terms");
  };

  const submit = async () => {
    if (!displayName.trim()) {
      toast({ title: "Display name is required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      // Record per-program terms acceptance
      for (const p of selectedList) {
        const doc = docs[p];
        if (doc) await legalService.accept(doc.id, "creator_opt_in");
      }
      const profile = await creatorService.optIn({
        programs: selectedList,
        displayName: displayName.trim(),
        tagline: tagline.trim() || undefined,
        bio: bio.trim() || undefined,
      });
      toast({ title: "You're enrolled", description: "Welcome to the Creator Program." });
      onEnrolled(profile);
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Enrollment failed";
      toast({ title: "Couldn't enroll", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleProgram = (p: CreatorProgram) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Join the Creator Program</DialogTitle>
          <DialogDescription>
            {step === "programs" && "Pick the programs you want to offer. You can enable or disable any of them later."}
            {step === "terms" && "Each program has its own terms. Read and accept each one to continue."}
            {step === "profile" && "Tell buyers who you are. These details show on your public profile."}
          </DialogDescription>
        </DialogHeader>

        <StepIndicator step={step} />

        {step === "programs" && (
          <div className="space-y-3 py-2">
            {CREATOR_PROGRAMS.map((p) => {
              const Icon = CREATOR_PROGRAM_ICON[p];
              const isSelected = selected.has(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => toggleProgram(p)}
                  className={`w-full text-left rounded-lg border p-4 transition ${
                    isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                      isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{CREATOR_PROGRAM_LABEL[p]}</h3>
                        {isSelected && <Check className="h-4 w-4 text-primary" />}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{CREATOR_PROGRAM_DESCRIPTION[p]}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {step === "terms" && (
          <div className="space-y-4 py-2">
            {docsLoading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading terms…
              </div>
            )}
            {!docsLoading && selectedList.map((p) => {
              const doc = docs[p];
              if (!doc) {
                return (
                  <div key={p} className="rounded-md border border-amber-300/50 bg-amber-500/10 p-3 text-sm flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>No published terms for the {CREATOR_PROGRAM_LABEL[p]} program. Ask an admin to publish them.</span>
                  </div>
                );
              }
              return (
                <div key={p} className="rounded-lg border p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <h3 className="font-semibold">{CREATOR_PROGRAM_LABEL[p]} — {doc.title}</h3>
                    <span className="text-xs text-muted-foreground">v{doc.version}</span>
                  </div>
                  {doc.summary && <p className="text-sm text-muted-foreground mb-3">{doc.summary}</p>}
                  <div className="text-sm rounded bg-muted/40 p-3 max-h-60 overflow-y-auto">
                    <Markdown>{doc.body}</Markdown>
                  </div>
                  <label className="flex items-center gap-2 mt-3 cursor-pointer">
                    <Checkbox
                      checked={accepted[p]}
                      onCheckedChange={(v) => setAccepted((cur) => ({ ...cur, [p]: v === true }))}
                    />
                    <span className="text-sm">I have read and accept the {CREATOR_PROGRAM_LABEL[p]} terms (v{doc.version}).</span>
                  </label>
                </div>
              );
            })}
          </div>
        )}

        {step === "profile" && (
          <div className="space-y-4 py-2">
            <UpgradePrompt
              featureName="Going live as a creator"
              benefit="You can finish enrolling now — your profile and listings stay hidden from the marketplace until your $9.95/mo creator subscription is active."
            />
            <div>
              <Label htmlFor="displayName">Display name *</Label>
              <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="How you want buyers to see you" />
              <p className="text-xs text-muted-foreground mt-1">
                Defaults to your account name. Override if you want to brand under a business or stage name.
              </p>
            </div>
            <div>
              <Label htmlFor="tagline">Tagline</Label>
              <Input id="tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="One-line pitch" />
            </div>
            <div>
              <Label htmlFor="bio">Bio</Label>
              <Textarea id="bio" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="What you offer, your background, what makes you different" />
            </div>
            <p className="text-xs text-muted-foreground">
              Marketplace categories are set automatically from the programs you picked. Payouts are configured separately in <strong>Settings → Payouts</strong> — you can finish enrollment now and link payout accounts before accepting your first lead.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="ghost" onClick={step === "programs" ? onClose : goBack} disabled={submitting}>
            {step === "programs" ? "Cancel" : "Back"}
          </Button>
          {step === "profile" ? (
            <Button onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Enroll
            </Button>
          ) : (
            <Button onClick={goNext} disabled={docsLoading}>Next</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "programs", label: "Programs" },
    { key: "terms", label: "Terms" },
    { key: "profile", label: "Profile" },
  ];
  const idx = steps.findIndex((s) => s.key === step);
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <span className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${
            i <= idx ? "bg-primary text-primary-foreground" : "bg-muted"
          }`}>{i + 1}</span>
          <span className={i === idx ? "font-medium text-foreground" : ""}>{s.label}</span>
          {i < steps.length - 1 && <span className="w-6 h-px bg-border" />}
        </div>
      ))}
    </div>
  );
}
