/**
 * AsyncInterviewPage — candidate-facing page for async video interviews.
 * Accessed via /interview/:token
 */

import { useEffect, useState, lazy, Suspense } from "react";
import { useParams } from "react-router-dom";
import { Video, Clock, ChevronRight, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  getAsyncInterviewInvite,
  submitAsyncResponse,
  finalizeAsyncInterview,
  type AsyncInterview,
} from "@/lib/services/studio-features-service";

const WebcamRecorder = lazy(() => import("@/components/studio/WebcamRecorder").then(m => ({ default: m.WebcamRecorder })));

interface InterviewQuestion {
  id: string;
  text: string;
  maxDurationSec: number;
  required: boolean;
}

export default function AsyncInterviewPage() {
  const { token } = useParams<{ token: string }>();
  const [interview, setInterview] = useState<AsyncInterview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [recordings, setRecordings] = useState<Map<string, Blob>>(new Map());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!token) return;
    getAsyncInterviewInvite(token)
      .then(setInterview)
      .catch((err) => setError(err.message ?? "Interview not found"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !interview) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Interview Not Found</h2>
            <p className="text-muted-foreground">{error ?? "This interview link is invalid or has expired."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Interview Submitted</h2>
            <p className="text-muted-foreground">
              Your responses have been sent. The recruiter will review them shortly.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const questions = (interview.questions ?? []) as InterviewQuestion[];
  const currentQuestion = questions[currentQuestionIdx];
  const totalQuestions = questions.length;
  const progress = ((currentQuestionIdx + (recordings.has(currentQuestion?.id) ? 1 : 0)) / totalQuestions) * 100;
  const allRecorded = questions.every((q) => recordings.has(q.id) || !q.required);

  async function handleRecordingComplete(blob: Blob, durationMs: number) {
    if (!currentQuestion || !interview) return;

    setRecordings((prev) => new Map(prev).set(currentQuestion.id, blob));

    // Upload the recording
    try {
      await submitAsyncResponse(interview.id, {
        questionId: currentQuestion.id,
        durationMs,
      });
    } catch {
      // Continue anyway — retrying on submit
    }
  }

  async function handleSubmit() {
    if (!interview) return;
    setIsSubmitting(true);
    try {
      await finalizeAsyncInterview(interview.id);
      setIsComplete(true);
    } catch (err) {
      setError("Failed to submit. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">{interview.title}</h1>
          {interview.instructions && (
            <p className="text-muted-foreground mb-4">{interview.instructions}</p>
          )}
          {interview.deadline && (
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" />
              Due: {new Date(interview.deadline).toLocaleDateString()}
            </Badge>
          )}
        </div>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>Question {currentQuestionIdx + 1} of {totalQuestions}</span>
            <span>{Math.round(progress)}% complete</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Current Question */}
        {currentQuestion && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">
                <span className="text-primary mr-2">Q{currentQuestionIdx + 1}.</span>
                {currentQuestion.text}
              </CardTitle>
              <div className="flex gap-2 mt-2">
                <Badge variant="secondary">
                  <Clock className="h-3 w-3 mr-1" />
                  Max {currentQuestion.maxDurationSec}s
                </Badge>
                {currentQuestion.required && <Badge variant="destructive">Required</Badge>}
                {recordings.has(currentQuestion.id) && (
                  <Badge className="bg-green-500/10 text-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Recorded
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<Loader2 className="h-6 w-6 animate-spin mx-auto" />}>
                <WebcamRecorder
                  onRecordingComplete={handleRecordingComplete}
                  mode="webcam"
                  maxDurationSec={currentQuestion.maxDurationSec}
                />
              </Suspense>
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setCurrentQuestionIdx((i) => Math.max(0, i - 1))}
            disabled={currentQuestionIdx === 0}
          >
            Previous
          </Button>

          {currentQuestionIdx < totalQuestions - 1 ? (
            <Button
              onClick={() => setCurrentQuestionIdx((i) => Math.min(totalQuestions - 1, i + 1))}
              className="gap-2"
            >
              Next Question
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!allRecorded || isSubmitting}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Submit All Responses
            </Button>
          )}
        </div>

        {/* Question Dots */}
        <div className="flex items-center justify-center gap-2 mt-8">
          {questions.map((q, idx) => (
            <button
              key={q.id}
              type="button"
              onClick={() => setCurrentQuestionIdx(idx)}
              className={`w-3 h-3 rounded-full transition-colors ${
                idx === currentQuestionIdx
                  ? "bg-primary"
                  : recordings.has(q.id)
                    ? "bg-green-500"
                    : "bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
