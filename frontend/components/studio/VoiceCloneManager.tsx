"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Loader2,
  Mic,
  Trash2,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

import {
  createVoiceClone,
  deleteVoiceClone,
  getVoiceClones,
  type VoiceClone,
} from "@/lib/services/studio-features-service";

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
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      await createVoiceClone(cloneName.trim(), audioFile);
      resetCreateFlow();
      await loadClones();
    } catch {
      setError("Failed to create voice clone. Please try again.");
    } finally {
      setSubmitting(false);
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
          <ul className="space-y-2">
            {clones.map((clone) => {
              const isSelected = selectedVoiceId === clone.id;
              const isReady = clone.status === "ready";
              return (
                <li
                  key={clone.id}
                  className={`flex items-center justify-between rounded-md border px-4 py-3 transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-medium text-sm truncate">
                      {clone.name}
                    </span>
                    <Badge variant={statusColor(clone.status)}>
                      {clone.status === "processing" && (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      )}
                      {clone.status}
                    </Badge>
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
                          "Select"
                        )}
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
          <div className="space-y-3 rounded-md border p-4">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">
                Audio ready: {audioFile.name}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Clone name: <strong>{cloneName}</strong>
            </p>
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
              <Button
                variant="ghost"
                onClick={resetCreateFlow}
                disabled={submitting}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
