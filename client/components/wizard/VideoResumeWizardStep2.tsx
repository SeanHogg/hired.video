import React, { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { videoService } from "@/lib/services/video-service";
import type { Resume } from "@/types/resume";

interface VideoResumeWizardStep2Props {
  resume: Resume;
  initialSummary: string;
  onComplete: (enhancedSummary: string, scenePrompt: string) => void;
  isLoading?: boolean;
  onError?: (error: string) => void;
}

/**
 * Step 2: Summary Review & Enhancement
 * Allows user to review and enhance their resume summary with AI
 */
export function VideoResumeWizardStep2({
  resume,
  initialSummary,
  onComplete: _onComplete, // eslint-disable-line @typescript-eslint/no-unused-vars
  isLoading = false,
  onError,
}: VideoResumeWizardStep2Props) {
  const [summary, setSummary] = useState(initialSummary);
  const [enhancedSummary, setEnhancedSummary] = useState("");
  const [scenePrompt, setScenePrompt] = useState("");
  const [enhancing, setEnhancing] = useState(false);
  const [showEnhanced, setShowEnhanced] = useState(false);

  const handleEnhance = async () => {
    try {
      setEnhancing(true);
      const response = await videoService.enhanceSummary(resume.id, summary);
      if (response.success && response.data) {
        setEnhancedSummary(response.data.enhancedSummary);
        setScenePrompt(response.data.suggestedScenePrompt);
        setShowEnhanced(true);
      }
    } catch (err) {
      onError?.(
        err instanceof Error ? err.message : "Failed to enhance summary",
      );
    } finally {
      setEnhancing(false);
    }
  };



  return (
    <div className="space-y-6">
      {/* Original Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Review Your Summary</CardTitle>
          <CardDescription>
            Your current professional summary that will be used in the video
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Enter your professional summary..."
            className="min-h-[120px]"
            disabled={isLoading || enhancing}
          />
          <Button
            onClick={handleEnhance}
            disabled={isLoading || enhancing || !summary.trim()}
            className="w-full"
            variant="outline"
          >
            {enhancing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enhancing with AI...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Enhance with AI
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Enhanced Summary Preview */}
      {showEnhanced && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-green-900 flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI-Enhanced Summary
            </CardTitle>
            <CardDescription className="text-green-800">
              Here's an improved version of your summary optimized for video
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-white p-4 rounded-lg border border-green-200">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {enhancedSummary}
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Suggested Scene Prompt:</div>
              <div className="bg-white p-4 rounded-lg border border-green-200">
                <p className="text-sm text-gray-700 italic">
                  {scenePrompt}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => setShowEnhanced(false)}
                variant="outline"
                className="flex-1"
              >
                Use Original
              </Button>
              <Button
                onClick={() => {
                  setSummary(enhancedSummary);
                }}
                className="flex-1"
              >
                Use Enhanced
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
        <strong>Tip:</strong> The summary you provide here will be used to
        generate your video. Make sure it accurately represents your
        professional background and accomplishments.
      </div>
    </div>
  );
}

export default VideoResumeWizardStep2;

