import React, { useEffect, useState } from "react";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { videoService, VideoGenerationStatus } from "@/lib/services/video-service";
import type { Resume } from "@/types/resume";

interface VideoResumeWizardStep3Props {
  resume: Resume;
  includeAvatar: boolean;
  avatarFile: File | null;
  summary: string;
  scenePrompt: string;
  onVideoGenerated: (videoId: string) => void;
  onError?: (error: string) => void;
  isLoading?: boolean;
}

/**
 * Step 3: Video Generation Progress
 * Initiates video generation and shows real-time progress
 */
export function VideoResumeWizardStep3({
  resume,
  includeAvatar,
  avatarFile: _avatarFile,
  summary: _summary,
  scenePrompt,
  onVideoGenerated,
  onError,
  isLoading: _isLoading = false,
}: VideoResumeWizardStep3Props) {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>(VideoGenerationStatus.Queued);
  const [progress, setProgress] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  // Initiate video generation on mount
  useEffect(() => {
    const initiateGeneration = async () => {
      try {
        const response = await videoService.createVideo({
          resumeId: resume.id,
          includeAvatar,
          customScenePrompt: scenePrompt,
        });

        if (response.success && response.data) {
          setVideoId(response.data.id);
          setStatus(response.data.status);
        }
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Failed to initiate video generation";
        setError(errorMsg);
        onError?.(errorMsg);
      }
    };

    initiateGeneration();
  }, [resume.id, includeAvatar, scenePrompt, onError]);

  // Poll for status updates
  useEffect(() => {
    if (!videoId || completed) return;

    const pollStatus = async () => {
      try {
        const response = await videoService.getVideoStatus(videoId);
        if (response.success && response.data) {
          setStatus(response.data.status);
          setProgress(response.data.progressPercentage);
          setEstimatedTime(response.data.estimatedTimeRemaining);

          if (response.data.status === VideoGenerationStatus.Completed) {
            setCompleted(true);
            onVideoGenerated(videoId);
          } else if (response.data.status === VideoGenerationStatus.Failed) {
            setError(
              response.data.errorMessage || "Video generation failed",
            );
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Error polling video status:", err);
      }
    };

    // Poll every 2 seconds
    const interval = setInterval(pollStatus, 2000);
    return () => clearInterval(interval);
  }, [videoId, completed, onVideoGenerated]);

  const getStatusMessage = () => {
    switch (status) {
      case VideoGenerationStatus.Queued:
        return "Queued for processing...";
      case VideoGenerationStatus.Processing:
        return "Generating your video...";
      case VideoGenerationStatus.Completed:
        return "Video generated successfully!";
      case VideoGenerationStatus.Failed:
        return "Video generation failed";
      case VideoGenerationStatus.Cancelled:
        return "Video generation cancelled";
      default:
        return "Processing...";
    }
  };

  const formatTime = (seconds: number | null) => {
    if (!seconds) return "Calculating...";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="space-y-6">
      {/* Generation Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {completed ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : error ? (
              <AlertCircle className="h-5 w-5 text-red-600" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            )}
            {getStatusMessage()}
          </CardTitle>
          <CardDescription>
            {videoId && `Video ID: ${videoId}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress Bar */}
          {!completed && !error && (
            <>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Progress</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              {estimatedTime && (
                <div className="text-sm text-muted-foreground">
                  Estimated time remaining: {formatTime(estimatedTime)}
                </div>
              )}
            </>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Success Message */}
          {completed && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-700">
              Your video has been generated successfully! You can now view and
              share it.
            </div>
          )}

          {/* Generation Details */}
          <div className="bg-muted/50 p-4 rounded-lg space-y-2 text-sm">
            <div>
              <strong>Resume:</strong> {resume.title}
            </div>
            <div>
              <strong>Avatar:</strong> {includeAvatar ? "Included" : "Not included"}
            </div>
            <div>
              <strong>Status:</strong> {status}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
        <strong>Note:</strong> Video generation typically takes 2-5 minutes.
        You can close this window and check back later. We'll notify you when
        your video is ready.
      </div>

      {/* Action Buttons */}
      {completed && (
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => window.location.href = "/videos"}>
            View Video
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => window.location.reload()}>
            Generate Another
          </Button>
        </div>
      )}
    </div>
  );
}

export default VideoResumeWizardStep3;

