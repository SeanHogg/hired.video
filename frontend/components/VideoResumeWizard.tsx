import React, { useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth";
import VideoResumeWizardStep1 from "./wizard/VideoResumeWizardStep1";
import VideoResumeWizardStep2 from "./wizard/VideoResumeWizardStep2";
import VideoResumeWizardStep3 from "./wizard/VideoResumeWizardStep3";
import type { Resume } from "@/types/resume";

export interface WizardState {
  step: number;
  selectedResume: Resume | null;
  includeAvatar: boolean;
  avatarFile: File | null;
  summary: string;
  enhancedSummary: string;
  scenePrompt: string;
  videoId: string | null;
  isLoading: boolean;
  error: string | null;
}

interface VideoResumeWizardProps {
  onClose: () => void;
  onVideoGenerated?: (videoId: string) => void;
}

/**
 * Multi-step wizard for generating AI-powered video resumes
 * Step 1: Resume Selection & Avatar Configuration
 * Step 2: Summary Review & Enhancement
 * Step 3: Video Generation Progress
 */
export function VideoResumeWizard({
  onClose,
  onVideoGenerated,
}: VideoResumeWizardProps) {
  const { user } = useAuth();
  const [state, setState] = useState<WizardState>({
    step: 1,
    selectedResume: null,
    includeAvatar: false,
    avatarFile: null,
    summary: "",
    enhancedSummary: "",
    scenePrompt: "",
    videoId: null,
    isLoading: false,
    error: null,
  });

  const updateState = useCallback((updates: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleNext = useCallback(() => {
    if (state.step < 3) {
      updateState({ step: state.step + 1, error: null });
    }
  }, [state.step, updateState]);

  const handlePrevious = useCallback(() => {
    if (state.step > 1) {
      updateState({ step: state.step - 1, error: null });
    }
  }, [state.step, updateState]);

  const handleStep1Complete = useCallback(
    (resume: Resume, includeAvatar: boolean, avatarFile: File | null) => {
      // If including avatar, populate the resume's Basics.image with user's profile avatar
      const updatedResume = { ...resume };
      if (includeAvatar && user?.avatar) {
        updatedResume.content = {
          ...updatedResume.content,
  basics: {
            ...updatedResume.content.basics,
            image: user.avatar,
          },
        };
      }

      updateState({
        selectedResume: updatedResume,
        includeAvatar,
        avatarFile,
        summary: updatedResume.content?.basics?.summary || "",
      });
      handleNext();
    },
    [handleNext, updateState, user?.avatar],
  );

  const handleStep2Complete = useCallback(
    (enhancedSummary: string, scenePrompt: string) => {
      updateState({
        enhancedSummary,
        scenePrompt,
      });
      handleNext();
    },
    [handleNext, updateState],
  );

  const handleVideoGenerated = useCallback(
    (videoId: string) => {
      updateState({ videoId });
      onVideoGenerated?.(videoId);
    },
    [updateState, onVideoGenerated],
  );

  const progressPercentage = (state.step / 3) * 100;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between mb-4">
            <div>
              <CardTitle>Generate Video Resume</CardTitle>
              <CardDescription>
                Step {state.step} of 3: {
                  state.step === 1
                    ? "Resume Selection & Avatar"
                    : state.step === 2
                      ? "Summary Review & Enhancement"
                      : "Video Generation"
                }
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              disabled={state.isLoading}
            >
              ✕
            </Button>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Error Display */}
          {state.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
              {state.error}
            </div>
          )}

          {/* Step Content */}
          {state.step === 1 && (
            <VideoResumeWizardStep1
              onComplete={handleStep1Complete}
              isLoading={state.isLoading}
            />
          )}

          {state.step === 2 && state.selectedResume && (
            <VideoResumeWizardStep2
              resume={state.selectedResume}
              initialSummary={state.summary}
              onComplete={handleStep2Complete}
              isLoading={state.isLoading}
              onError={(error) => updateState({ error })}
            />
          )}

          {state.step === 3 && state.selectedResume && (
            <VideoResumeWizardStep3
              resume={state.selectedResume}
              includeAvatar={state.includeAvatar}
              avatarFile={state.avatarFile}
              summary={state.enhancedSummary || state.summary}
              scenePrompt={state.scenePrompt}
              onVideoGenerated={handleVideoGenerated}
              onError={(error) => updateState({ error })}
              isLoading={state.isLoading}
            />
          )}

          {/* Navigation Buttons */}
          <div className="flex gap-3 justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={state.step === 1 || state.isLoading}
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>

            {state.step < 3 && (
              <Button
                onClick={handleNext}
                disabled={
                  state.isLoading ||
                  (state.step === 1 && !state.selectedResume)
                }
              >
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            )}

            {state.step === 3 && (
              <Button
                onClick={onClose}
                disabled={state.isLoading}
                variant="outline"
              >
                Close
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default VideoResumeWizard;

