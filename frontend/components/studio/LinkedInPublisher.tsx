"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Check,
  ExternalLink,
  Loader2,
  Linkedin,
  Link2,
  Globe,
  Lock,
  Sparkles,
} from "lucide-react";
import {
  getLinkedInAuthUrl,
  linkedInCallback,
  getLinkedInAccounts,
  publishToLinkedIn,
  createLinkedInPost,
  generateLinkedInPost,
} from "@/lib/services/studio-features-service";

// ─── Types ──────────────────────────────────────────────────────────────────

interface LinkedInPublisherProps {
  projectId: string;
  videoBlob?: Blob | null;
  defaultText?: string;
  onPublished?: (postId: string) => void;
}

interface LinkedInAccount {
  id: string;
  linkedinId: string;
  displayName: string;
  isActive: boolean;
}

type PublishStage =
  | "idle"
  | "uploading"
  | "processing"
  | "posting"
  | "done"
  | "error";

const MAX_CHAR_COUNT = 3000;

// ─── Helpers ────────────────────────────────────────────────────────────────

function stageLabel(t: TFunction, stage: PublishStage): string {
  switch (stage) {
    case "uploading":
      return t("studio.linkedinPublisher.stage.uploading");
    case "processing":
      return t("studio.linkedinPublisher.stage.processing");
    case "posting":
      return t("studio.linkedinPublisher.stage.posting");
    case "done":
      return t("studio.linkedinPublisher.stage.done");
    default:
      return "";
  }
}

function stageProgress(stage: PublishStage): number {
  switch (stage) {
    case "uploading":
      return 30;
    case "processing":
      return 60;
    case "posting":
      return 85;
    case "done":
      return 100;
    default:
      return 0;
  }
}

// ─── OAuth Callback Handler ─────────────────────────────────────────────────

function useOAuthCallback(onAccountLinked: () => void) {
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === "linkedin-oauth-callback" && event.data.code) {
        try {
          await linkedInCallback(
            event.data.code,
            event.data.redirectUri || window.location.origin + "/auth/linkedin/callback",
          );
          onAccountLinked();
        } catch {
          // Callback handling failed silently; user can retry
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onAccountLinked]);
}

// ─── Connect Account Panel ──────────────────────────────────────────────────

function ConnectAccountPanel({
  accounts,
  onConnect,
  connecting,
}: {
  accounts: LinkedInAccount[];
  onConnect: () => void;
  connecting: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      {accounts.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
            {t("studio.linkedinPublisher.connectedAccounts")}
          </Label>
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="flex items-center justify-between rounded-lg border px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0A66C2]/10">
                  <Linkedin className="h-4 w-4 text-[#0A66C2]" />
                </div>
                <div>
                  <p className="text-sm font-medium">{acc.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {acc.linkedinId}
                  </p>
                </div>
              </div>
              <Badge
                variant="secondary"
                className={
                  acc.isActive
                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                }
              >
                {acc.isActive ? t("status.active") : t("status.inactive")}
              </Badge>
            </div>
          ))}
        </div>
      )}

      <Button
        variant="outline"
        className="w-full border-[#0A66C2]/30 text-[#0A66C2] hover:bg-[#0A66C2]/5 hover:border-[#0A66C2]/50"
        disabled={connecting}
        onClick={onConnect}
      >
        {connecting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Linkedin className="mr-2 h-4 w-4" />
        )}
        {accounts.length > 0
          ? t("studio.linkedinPublisher.connectAnother")
          : t("studio.linkedinPublisher.connectLinkedIn")}
      </Button>
    </div>
  );
}

// ─── Compose Panel ──────────────────────────────────────────────────────────

function ComposePanel({
  text,
  setText,
  visibility,
  setVisibility,
  charCount,
  disabled,
  projectId,
}: {
  text: string;
  setText: (val: string) => void;
  visibility: "PUBLIC" | "CONNECTIONS";
  setVisibility: (val: "PUBLIC" | "CONNECTIONS") => void;
  charCount: number;
  disabled: boolean;
  projectId: string;
}) {
  const { t } = useTranslation();
  const isOverLimit = charCount > MAX_CHAR_COUNT;
  const charPercent = Math.min((charCount / MAX_CHAR_COUNT) * 100, 100);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const handleGenerate = async (tone: "professional" | "casual" | "bold" | "story") => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const post = await generateLinkedInPost({ projectId, tone });
      const hashtagLine = post.hashtags.map((h) => `#${h}`).join(" ");
      setText(`${post.hook}\n\n${post.caption}\n\n${hashtagLine}`);
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : t("studio.linkedinPublisher.generateError"),
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Post text */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="linkedin-text">{t("studio.linkedinPublisher.postText")}</Label>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled || generating}
              onClick={() => handleGenerate("professional")}
              className="h-7 gap-1 px-2 text-xs"
            >
              {generating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              {generating
                ? t("studio.linkedinPublisher.generating")
                : text.length > 0
                  ? t("studio.linkedinPublisher.regenerate")
                  : t("studio.linkedinPublisher.generateWithAI")}
            </Button>
          </div>
        </div>
        {generateError && (
          <p className="text-xs text-destructive">{generateError}</p>
        )}
        <Textarea
          id="linkedin-text"
          placeholder={t("studio.linkedinPublisher.textPlaceholder")}
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          className={isOverLimit ? "border-destructive focus-visible:ring-destructive" : ""}
        />
        <div className="flex items-center justify-between">
          <div className="h-1.5 flex-1 max-w-[200px] rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                isOverLimit
                  ? "bg-destructive"
                  : charPercent > 90
                    ? "bg-yellow-500"
                    : "bg-primary"
              }`}
              style={{ width: `${charPercent}%` }}
            />
          </div>
          <span
            className={`text-xs tabular-nums ${
              isOverLimit ? "text-destructive font-medium" : "text-muted-foreground"
            }`}
          >
            {charCount.toLocaleString()} / {MAX_CHAR_COUNT.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Visibility toggle */}
      <div className="flex items-center justify-between rounded-lg border px-4 py-3">
        <div className="flex items-center gap-3">
          {visibility === "PUBLIC" ? (
            <Globe className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Lock className="h-4 w-4 text-muted-foreground" />
          )}
          <div>
            <p className="text-sm font-medium">
              {visibility === "PUBLIC" ? t("labels.public") : t("labels.connectionsOnly")}
            </p>
            <p className="text-xs text-muted-foreground">
              {visibility === "PUBLIC"
                ? t("studio.linkedinPublisher.visibilityPublicDesc")
                : t("studio.linkedinPublisher.visibilityConnectionsDesc")}
            </p>
          </div>
        </div>
        <Switch
          checked={visibility === "PUBLIC"}
          onCheckedChange={(checked) =>
            setVisibility(checked ? "PUBLIC" : "CONNECTIONS")
          }
          disabled={disabled}
        />
      </div>
    </div>
  );
}

// ─── Publishing Progress ────────────────────────────────────────────────────

function PublishingProgress({ stage }: { stage: PublishStage }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 py-4">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-[#0A66C2]" />
        <span className="text-sm font-medium">{stageLabel(t, stage)}</span>
      </div>
      <Progress value={stageProgress(stage)} className="h-2" />
    </div>
  );
}

// ─── Success State ──────────────────────────────────────────────────────────

function PublishSuccess({
  postId,
  onReset,
}: {
  postId: string;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const postUrl = `https://www.linkedin.com/feed/update/${postId}`;

  return (
    <div className="space-y-4 py-4 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
        <Check className="h-7 w-7 text-green-600 dark:text-green-400" />
      </div>
      <div>
        <h3 className="font-semibold">{t("studio.linkedinPublisher.successHeading")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("studio.linkedinPublisher.successDesc")}
        </p>
      </div>
      <div className="flex items-center justify-center gap-3">
        <Button asChild variant="outline" size="sm">
          <a href={postUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            {t("studio.linkedinPublisher.viewPost")}
          </a>
        </Button>
        <Button variant="ghost" size="sm" onClick={onReset}>
          {t("studio.linkedinPublisher.publishAnother")}
        </Button>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function LinkedInPublisher({
  projectId,
  videoBlob,
  defaultText = "",
  onPublished,
}: LinkedInPublisherProps) {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<LinkedInAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );
  const [text, setText] = useState(defaultText);
  const [visibility, setVisibility] = useState<"PUBLIC" | "CONNECTIONS">(
    "PUBLIC",
  );
  const [stage, setStage] = useState<PublishStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [postId, setPostId] = useState<string | null>(null);

  const charCount = text.length;
  const isOverLimit = charCount > MAX_CHAR_COUNT;

  // Load accounts
  const fetchAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const data = await getLinkedInAccounts();
      setAccounts(data);
      // Auto-select first active account
      const active = data.find((a) => a.isActive);
      if (active) setSelectedAccountId(active.id);
    } catch {
      // Non-fatal, show connect UI
      setAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Handle OAuth popup callback
  useOAuthCallback(fetchAccounts);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const { url } = await getLinkedInAuthUrl();
      // Open OAuth in a popup
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      window.open(
        url,
        "linkedin-oauth",
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("studio.linkedinPublisher.authError"),
      );
    } finally {
      setConnecting(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedAccountId || isOverLimit) return;

    setStage("uploading");
    setError(null);

    try {
      // Step 1: Initialize video upload
      const uploadResult = await publishToLinkedIn({
        linkedinAccountId: selectedAccountId,
        projectId,
        text,
        visibility,
      });

      // Step 2: Upload the video binary if blob is provided
      if (videoBlob && uploadResult.uploadUrl) {
        setStage("uploading");
        await fetch(uploadResult.uploadUrl, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${uploadResult.accessToken}`,
            "Content-Type": "application/octet-stream",
          },
          body: videoBlob,
        });
      }

      // Step 3: Finalize the post
      setStage("posting");
      const postResult = await createLinkedInPost({
        linkedinAccountId: selectedAccountId,
        videoUrn: uploadResult.videoUrn,
        text,
        visibility,
      });

      setStage("done");
      setPostId(postResult.postId);
      onPublished?.(postResult.postId);
    } catch (err) {
      setStage("error");
      setError(
        err instanceof Error
          ? err.message
          : t("studio.linkedinPublisher.publishError"),
      );
    }
  };

  const handleReset = () => {
    setStage("idle");
    setPostId(null);
    setText(defaultText);
    setError(null);
  };

  const activeAccounts = accounts.filter((a) => a.isActive);
  const canPublish =
    selectedAccountId &&
    text.trim().length > 0 &&
    !isOverLimit &&
    stage === "idle";
  const isPublishing =
    stage === "uploading" || stage === "processing" || stage === "posting";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Linkedin className="h-5 w-5 text-[#0A66C2]" />
          {t("studio.linkedinPublisher.heading")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Loading */}
        {loadingAccounts ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              {t("studio.linkedinPublisher.loadingAccounts")}
            </span>
          </div>
        ) : stage === "done" && postId ? (
          /* Success state */
          <PublishSuccess postId={postId} onReset={handleReset} />
        ) : (
          <>
            {/* Account connection */}
            <ConnectAccountPanel
              accounts={accounts}
              onConnect={handleConnect}
              connecting={connecting}
            />

            {/* Account selector (if multiple) */}
            {activeAccounts.length > 1 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  {t("studio.linkedinPublisher.postFrom")}
                </Label>
                <div className="flex flex-wrap gap-2">
                  {activeAccounts.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => setSelectedAccountId(acc.id)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                        selectedAccountId === acc.id
                          ? "border-[#0A66C2] bg-[#0A66C2]/5 text-[#0A66C2]"
                          : "hover:bg-muted"
                      }`}
                    >
                      <Linkedin className="h-3.5 w-3.5" />
                      {acc.displayName}
                      {selectedAccountId === acc.id && (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Compose area - only show when connected */}
            {activeAccounts.length > 0 && (
              <>
                <ComposePanel
                  text={text}
                  setText={setText}
                  visibility={visibility}
                  setVisibility={setVisibility}
                  charCount={charCount}
                  disabled={isPublishing}
                  projectId={projectId}
                />

                {/* Video indicator */}
                {videoBlob && (
                  <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                    <Link2 className="h-4 w-4 shrink-0" />
                    <span>
                      {t("studio.linkedinPublisher.videoAttached", { size: (videoBlob.size / (1024 * 1024)).toFixed(1) })}
                    </span>
                  </div>
                )}

                {/* Publishing progress */}
                {isPublishing && <PublishingProgress stage={stage} />}

                {/* Error */}
                {error && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3">
                    <p className="text-sm text-destructive">{error}</p>
                    {stage === "error" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 text-destructive hover:text-destructive"
                        onClick={() => {
                          setStage("idle");
                          setError(null);
                        }}
                      >
                        {t("actions.tryAgain")}
                      </Button>
                    )}
                  </div>
                )}

                {/* Publish button */}
                <Button
                  className="w-full bg-[#0A66C2] hover:bg-[#004182] text-white"
                  disabled={!canPublish}
                  onClick={handlePublish}
                >
                  {isPublishing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("studio.linkedinPublisher.publishing")}
                    </>
                  ) : (
                    <>
                      <Linkedin className="mr-2 h-4 w-4" />
                      {t("studio.linkedinPublisher.heading")}
                    </>
                  )}
                </Button>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
