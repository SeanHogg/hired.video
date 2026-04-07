"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  DollarSign,
  Globe2,
  Loader2,
  Mic,
  ShieldAlert,
  Store,
  Trash2,
  Upload,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  createVoiceClone,
  deleteVoiceClone,
  getVoiceClones,
  updateVoiceClone,
  type VoiceClone,
} from "@/lib/services/studio-features-service";
import { renderPreviewBase64 } from "@/lib/services/tts-engines";

// ---------------------------------------------------------------------------

interface VoiceCloneManagerProps {
  onVoiceSelected?: (voiceId: string, voiceName: string) => void;
  selectedVoiceId?: string;
}

type CreateStep = "idle" | "naming" | "recording" | "uploading" | "submitting";

const REQUIRED_DURATION_SEC = 30;

// ---------------------------------------------------------------------------

export default function VoiceCloneManager({
  onVoiceSelected,
  selectedVoiceId,
}: VoiceCloneManagerProps) {
  // ── State ────────────────────────────────────────────────────────────────
  const [clones, setClones] = useState<VoiceClone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create flow
  const [step, setStep] = useState<CreateStep>("idle");
  const [cloneName, setCloneName] = useState("");
  const [cloneDescription, setCloneDescription] = useState("");
  const [cloneLanguage, setCloneLanguage] = useState<string>("en-US");
  const [cloneGender, setCloneGender] = useState<"male" | "female" | "nonbinary" | "">("");
  const [cloneAccent, setCloneAccent] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Monetization edit state — keyed by clone id, lazily populated as the user
  // expands a clone card. Holds the in-progress edits before save.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPriceUsd, setEditPriceUsd] = useState<string>("0");
  const [editPublic, setEditPublic] = useState<boolean>(false);
  const [editConsent, setEditConsent] = useState<boolean>(false);
  const [savingEditId, setSavingEditId] = useState<string | null>(null);

  // Recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Deleting
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Load clones ──────────────────────────────────────────────────────────
  const loadClones = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getVoiceClones();
      setClones(data);
    } catch (err) {
      setError("Failed to load voice clones.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClones();
  }, [loadClones]);

  // ── Recording helpers ────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `${cloneName || "voice-clone"}.webm`, {
          type: "audio/webm",
        });
        setAudioFile(file);
        setStep("uploading");
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingSec(0);

      timerRef.current = setInterval(() => {
        setRecordingSec((prev) => {
          const next = prev + 1;
          if (next >= REQUIRED_DURATION_SEC) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch {
      setError("Microphone access denied. Please allow microphone access and try again.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
  };

  // ── File upload ──────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
      setStep("uploading");
    }
  };

  // ── Submit clone ─────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!audioFile || !cloneName.trim()) return;
    try {
      setSubmitting(true);
      setError(null);
      await createVoiceClone({
        name: cloneName.trim(),
        audioFile,
        description: cloneDescription.trim() || undefined,
        language: cloneLanguage || undefined,
        gender: cloneGender || undefined,
        accent: cloneAccent.trim() || undefined,
      });
      resetCreateFlow();
      await loadClones();
      toast.success("Voice clone created — private to your account");
    } catch {
      setError("Failed to create voice clone. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Save monetization edit ──────────────────────────────────────────────
  const startEditing = (clone: VoiceClone) => {
    setEditingId(clone.id);
    setEditPriceUsd(((clone.priceCents ?? 0) / 100).toFixed(2));
    setEditPublic(clone.visibility === "public");
    setEditConsent(Boolean(clone.consentAgreedAt));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditConsent(false);
  };

  const handleSaveEdit = async (clone: VoiceClone) => {
    const priceCents = Math.max(0, Math.round(parseFloat(editPriceUsd || "0") * 100));
    if (Number.isNaN(priceCents)) {
      toast.error("Invalid price");
      return;
    }
    if (editPublic && !clone.consentAgreedAt && !editConsent) {
      toast.error("You must accept the creator terms to publish this voice");
      return;
    }
    try {
      setSavingEditId(clone.id);
      // When publishing for the first time, render a short preview using
      // VibeVoice (the only engine that knows about cloned voices) and
      // attach it so the marketplace catalog can play a sample.
      let preview: { base64: string; mime: string } | null = null;
      if (editPublic && !clone.previewAudioUrl) {
        try {
          preview = await renderPreviewBase64("vibevoice", clone.id);
        } catch (err) {
          // Preview rendering is best-effort — the listing still works
          // without it, just with no audio in the catalog card.
          console.warn("[voice clone] preview render failed", err);
        }
      }
      await updateVoiceClone(clone.id, {
        priceCents,
        visibility: editPublic ? "public" : "private",
        consentAccepted: editPublic ? editConsent : undefined,
        previewAudioBase64: preview?.base64,
        previewAudioMime: preview?.mime,
      });
      toast.success(
        editPublic
          ? `${clone.name} is now listed in the Voice Marketplace`
          : `${clone.name} is private`,
      );
      cancelEditing();
      await loadClones();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingEditId(null);
    }
  };

  // ── Delete clone ─────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    try {
      setDeletingId(id);
      setError(null);
      await deleteVoiceClone(id);
      setClones((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setError("Failed to delete voice clone.");
    } finally {
      setDeletingId(null);
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  const resetCreateFlow = () => {
    setStep("idle");
    setCloneName("");
    setCloneDescription("");
    setCloneLanguage("en-US");
    setCloneGender("");
    setCloneAccent("");
    setAudioFile(null);
    setRecordingSec(0);
    stopRecording();
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "ready":
        return "default";
      case "processing":
        return "secondary";
      case "failed":
        return "destructive";
      default:
        return "outline";
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Mic className="h-5 w-5" />
          Voice Clones
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* ── Clone list ────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              Loading voice clones...
            </span>
          </div>
        ) : clones.length === 0 && step === "idle" ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No voice clones yet. Create one to get started.
          </p>
        ) : (
          <ul className="space-y-3">
            {clones.map((clone) => {
              const isSelected = selectedVoiceId === clone.id;
              const isReady = clone.status === "ready";
              const isPublic = clone.visibility === "public";
              const isEditing = editingId === clone.id;
              const platformPct = (clone.platformFeeBps ?? 2000) / 100;
              const creatorPct = 100 - platformPct;
              return (
                <li
                  key={clone.id}
                  className={`rounded-md border transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-2 px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-medium text-sm truncate">{clone.name}</span>
                      <Badge variant={statusColor(clone.status)} className="text-[10px]">
                        {clone.status === "processing" && (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        )}
                        {clone.status}
                      </Badge>
                      {isPublic ? (
                        <Badge variant="default" className="text-[10px] gap-1">
                          <Store className="h-2.5 w-2.5" />
                          Listed{clone.priceCents > 0 ? ` · $${(clone.priceCents / 100).toFixed(2)}` : " · Free"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">Private</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isReady && onVoiceSelected && (
                        <Button
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                          onClick={() => onVoiceSelected(clone.id, clone.name)}
                        >
                          {isSelected ? (
                            <>
                              <Check className="mr-1 h-3 w-3" /> Selected
                            </>
                          ) : (
                            "Use"
                          )}
                        </Button>
                      )}
                      {isReady && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => (isEditing ? cancelEditing() : startEditing(clone))}
                        >
                          {isEditing ? "Close" : "Monetize"}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={deletingId === clone.id}
                        onClick={() => handleDelete(clone.id)}
                      >
                        {deletingId === clone.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Monetization editor */}
                  {isEditing && (
                    <div className="border-t bg-muted/30 px-4 py-4 space-y-4">
                      <div className="space-y-1">
                        <Label htmlFor={`vc-${clone.id}-public`} className="text-sm font-medium">
                          List on the Voice Marketplace
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          When off, this voice is private to your account. When on,
                          it appears in the Voices catalog on the home page and is
                          buyable through the cart.
                        </p>
                        <div className="flex items-center gap-3 pt-1">
                          <Switch
                            id={`vc-${clone.id}-public`}
                            checked={editPublic}
                            onCheckedChange={setEditPublic}
                          />
                          <span className="text-xs text-muted-foreground">
                            {editPublic ? "Public listing" : "Private to your account"}
                          </span>
                        </div>
                      </div>

                      {editPublic && (
                        <>
                          <div className="space-y-1">
                            <Label htmlFor={`vc-${clone.id}-price`} className="text-sm font-medium">
                              Your price (USD)
                            </Label>
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4 text-muted-foreground" />
                              <Input
                                id={`vc-${clone.id}-price`}
                                type="number"
                                min="0"
                                step="0.01"
                                value={editPriceUsd}
                                onChange={(e) => setEditPriceUsd(e.target.value)}
                                className="max-w-[140px]"
                              />
                              <span className="text-xs text-muted-foreground">
                                Set to 0 to give it away for free
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Platform fee {platformPct}% &middot; You earn{" "}
                              <strong className="text-foreground">
                                ${((parseFloat(editPriceUsd || "0") * creatorPct) / 100).toFixed(2)}
                              </strong>{" "}
                              per sale
                            </p>
                          </div>

                          {!clone.consentAgreedAt && (
                            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950 p-3">
                              <div className="flex items-start gap-2">
                                <ShieldAlert className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                                <div className="space-y-2">
                                  <p className="text-xs text-amber-900 dark:text-amber-100">
                                    By listing this voice you confirm: this is your
                                    own voice (or you have explicit written rights to
                                    license it), you grant hired.video a license to
                                    distribute it through the Voice Marketplace, and
                                    you agree to the{" "}
                                    <Link
                                      to="/terms-of-service#voice-marketplace"
                                      className="underline"
                                    >
                                      Voice Marketplace Creator Terms
                                    </Link>
                                    .
                                  </p>
                                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={editConsent}
                                      onChange={(e) => setEditConsent(e.target.checked)}
                                    />
                                    I accept the Voice Marketplace Creator Terms
                                  </label>
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          onClick={() => handleSaveEdit(clone)}
                          disabled={savingEditId === clone.id || (editPublic && !clone.consentAgreedAt && !editConsent)}
                        >
                          {savingEditId === clone.id ? (
                            <>
                              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                              Saving…
                            </>
                          ) : (
                            "Save"
                          )}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={cancelEditing}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* ── Create flow ───────────────────────────────────────────────── */}
        {step === "idle" && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setStep("naming")}
          >
            <Mic className="mr-2 h-4 w-4" />
            Create Voice Clone
          </Button>
        )}

        {step === "naming" && (
          <div className="space-y-3 rounded-md border p-4">
            <Label htmlFor="voice-clone-name">Voice clone name</Label>
            <Input
              id="voice-clone-name"
              placeholder="e.g. My Professional Voice"
              value={cloneName}
              onChange={(e) => setCloneName(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                disabled={!cloneName.trim()}
                onClick={() => setStep("recording")}
              >
                Continue
              </Button>
              <Button variant="ghost" onClick={resetCreateFlow}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step === "recording" && (
          <div className="space-y-4 rounded-md border p-4">
            <p className="text-sm text-muted-foreground">
              Record at least {REQUIRED_DURATION_SEC} seconds of speech, or
              upload an audio file.
            </p>

            {/* Recording controls */}
            {!isRecording && !audioFile && (
              <div className="flex gap-2">
                <Button onClick={startRecording}>
                  <Mic className="mr-2 h-4 w-4" />
                  Start Recording
                </Button>
                <div className="relative">
                  <Button variant="outline" asChild>
                    <label className="cursor-pointer">
                      <Upload className="mr-2 h-4 w-4" />
                      Upload File
                      <input
                        type="file"
                        accept="audio/*"
                        className="sr-only"
                        onChange={handleFileChange}
                      />
                    </label>
                  </Button>
                </div>
                <Button variant="ghost" onClick={resetCreateFlow}>
                  Cancel
                </Button>
              </div>
            )}

            {/* Active recording */}
            {isRecording && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                  </span>
                  <span className="text-sm font-medium">
                    Recording... {recordingSec}s / {REQUIRED_DURATION_SEC}s
                  </span>
                </div>
                <Progress
                  value={Math.min(
                    (recordingSec / REQUIRED_DURATION_SEC) * 100,
                    100,
                  )}
                />
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={stopRecording}
                  disabled={recordingSec < 5}
                >
                  Stop Recording
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "uploading" && audioFile && (
          <div className="space-y-4 rounded-md border p-4">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Audio ready: {audioFile.name}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Clone name: <strong>{cloneName}</strong>. This voice will be{" "}
              <strong>private to your account</strong>. You can publish it to the
              Voice Marketplace later from the list above.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="vc-description" className="text-xs">
                  Description (optional)
                </Label>
                <Textarea
                  id="vc-description"
                  placeholder="A warm, conversational voice ideal for narration…"
                  value={cloneDescription}
                  onChange={(e) => setCloneDescription(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="vc-language" className="text-xs flex items-center gap-1">
                  <Globe2 className="h-3 w-3" />
                  Language
                </Label>
                <Select value={cloneLanguage} onValueChange={setCloneLanguage}>
                  <SelectTrigger id="vc-language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en-US">English (US)</SelectItem>
                    <SelectItem value="en-GB">English (UK)</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                    <SelectItem value="pt-BR">Portuguese (BR)</SelectItem>
                    <SelectItem value="ja">Japanese</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="vc-gender" className="text-xs">Gender (optional)</Label>
                <Select
                  value={cloneGender}
                  onValueChange={(v) => setCloneGender(v as typeof cloneGender)}
                >
                  <SelectTrigger id="vc-gender">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="nonbinary">Non-binary</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="vc-accent" className="text-xs">Accent (optional)</Label>
                <Input
                  id="vc-accent"
                  placeholder="e.g. Southern, Scottish, neutral"
                  value={cloneAccent}
                  onChange={(e) => setCloneAccent(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Clone"
                )}
              </Button>
              <Button variant="ghost" onClick={resetCreateFlow} disabled={submitting}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
