"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  MessageSquare,
  Star,
  Play,
  StopCircle,
  Globe,
  Lock,
  Sparkles,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  getInterviewQuestions,
  startInterviewSession,
  updateInterviewSession,
  getInterviewSessions,
} from "@/lib/services/studio-features-service";
import type {
  InterviewQuestion,
  InterviewSession,
} from "@/lib/services/studio-features-service";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface InterviewPracticeProps {
  resumeText?: string;
  onStartRecording?: (question: { id: string; text: string }) => void;
  onSessionComplete?: (sessionId: string) => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "all", label: "All Categories" },
  { value: "behavioral", label: "Behavioral" },
  { value: "technical", label: "Technical" },
  { value: "situational", label: "Situational" },
  { value: "company-specific", label: "Company-Specific" },
] as const;

const DIFFICULTIES = [
  { value: "all", label: "All Levels" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
] as const;

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  medium:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  hard: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const STAR_STEPS = [
  {
    letter: "S",
    title: "Situation",
    description: "Set the scene and context for your story.",
  },
  {
    letter: "T",
    title: "Task",
    description: "Describe the challenge or responsibility you faced.",
  },
  {
    letter: "A",
    title: "Action",
    description: "Explain the specific steps you took.",
  },
  {
    letter: "R",
    title: "Result",
    description: "Share the outcome and what you learned.",
  },
] as const;

// ─── Sub-components ─────────────────────────────────────────────────────────

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  return (
    <Badge
      className={cn(
        "capitalize border-0",
        DIFFICULTY_COLORS[difficulty] ?? "bg-muted text-muted-foreground",
      )}
    >
      {difficulty}
    </Badge>
  );
}

function StarFrameworkGuide() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Star className="h-4 w-4 text-yellow-500" />
          STAR Framework Guide
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {STAR_STEPS.map((step) => (
          <div key={step.letter} className="flex gap-3 items-start">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
              {step.letter}
            </div>
            <div>
              <p className="text-sm font-medium">{step.title}</p>
              <p className="text-xs text-muted-foreground">
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function FeedbackPanel({
  session,
}: {
  session: InterviewSession;
}) {
  if (!session.aiScore && !session.aiFeedback) return null;

  const score = session.aiScore ?? 0;
  const scoreColor =
    score >= 80
      ? "text-green-600 dark:text-green-400"
      : score >= 60
        ? "text-yellow-600 dark:text-yellow-400"
        : "text-red-600 dark:text-red-400";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Feedback
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall score */}
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "text-4xl font-bold tabular-nums",
              scoreColor,
            )}
          >
            {score}
          </div>
          <div className="text-sm text-muted-foreground">/ 100</div>
        </div>

        {/* Detailed feedback */}
        {session.aiFeedback && (
          <div className="space-y-3">
            {(
              [
                { key: "content", label: "Content" },
                { key: "delivery", label: "Delivery" },
                { key: "structure", label: "Structure" },
              ] as const
            ).map(({ key, label }) => (
              <div key={key}>
                <p className="text-sm font-medium mb-1">{label}</p>
                <p className="text-sm text-muted-foreground">
                  {session.aiFeedback![key]}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Question Card ──────────────────────────────────────────────────────────

function QuestionCard({
  question,
  onStart,
  isStarting,
}: {
  question: InterviewQuestion;
  onStart: (q: InterviewQuestion) => void;
  isStarting: boolean;
}) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium leading-relaxed flex-1">
            {question.question}
          </p>
          <DifficultyBadge difficulty={question.difficulty} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-xs capitalize">
            {question.category}
          </Badge>
          {question.framework && (
            <Badge variant="secondary" className="text-xs">
              {question.framework}
            </Badge>
          )}
          {question.industry && (
            <Badge variant="outline" className="text-xs">
              {question.industry}
            </Badge>
          )}
        </div>

        {question.tips.length > 0 && (
          <ul className="space-y-1">
            {question.tips.map((tip, i) => (
              <li
                key={i}
                className="text-xs text-muted-foreground flex items-start gap-1.5"
              >
                <span className="text-primary mt-0.5">&#8226;</span>
                {tip}
              </li>
            ))}
          </ul>
        )}

        <Button
          size="sm"
          className="w-full"
          disabled={isStarting}
          onClick={() => onStart(question)}
        >
          <Play className="h-3.5 w-3.5 mr-1.5" />
          {isStarting ? "Starting..." : "Start Practice"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Session View ───────────────────────────────────────────────────────────

function SessionView({
  session,
  question,
  isRecording,
  onToggleRecording,
  onPublishToggle,
}: {
  session: InterviewSession;
  question: InterviewQuestion | null;
  isRecording: boolean;
  onToggleRecording: () => void;
  onPublishToggle: (isPublic: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Question */}
      {question && (
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <MessageSquare className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="font-medium">{question.question}</p>
                <div className="flex gap-2">
                  <DifficultyBadge difficulty={question.difficulty} />
                  <Badge variant="outline" className="text-xs capitalize">
                    {question.category}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main area: talking points + recorder */}
        <div className="lg:col-span-2 space-y-4">
          {/* Talking points */}
          {session.talkingPoints.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI-Generated Talking Points
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {session.talkingPoints.map((point, i) => (
                    <li
                      key={i}
                      className="text-sm text-muted-foreground flex items-start gap-2"
                    >
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                        {i + 1}
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Webcam recorder area */}
          <Card>
            <CardContent className="pt-5">
              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center border-2 border-dashed border-muted-foreground/20">
                {isRecording ? (
                  <div className="text-center space-y-3">
                    <div className="w-4 h-4 rounded-full bg-red-500 animate-pulse mx-auto" />
                    <p className="text-sm font-medium text-red-600 dark:text-red-400">
                      Recording in progress...
                    </p>
                  </div>
                ) : session.recordingId ? (
                  <p className="text-sm text-muted-foreground">
                    Recording complete
                  </p>
                ) : (
                  <div className="text-center space-y-2">
                    <Play className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      Click record to start your practice session
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mt-4">
                <Button
                  variant={isRecording ? "destructive" : "default"}
                  onClick={onToggleRecording}
                >
                  {isRecording ? (
                    <>
                      <StopCircle className="h-4 w-4 mr-2" />
                      Stop Recording
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      {session.recordingId
                        ? "Record Again"
                        : "Start Recording"}
                    </>
                  )}
                </Button>

                {session.recordingId && (
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="publish-toggle"
                      className="text-sm text-muted-foreground flex items-center gap-1.5"
                    >
                      {session.isPublic ? (
                        <Globe className="h-3.5 w-3.5" />
                      ) : (
                        <Lock className="h-3.5 w-3.5" />
                      )}
                      {session.isPublic ? "Public" : "Private"}
                    </Label>
                    <Switch
                      id="publish-toggle"
                      checked={session.isPublic}
                      onCheckedChange={onPublishToggle}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Feedback */}
          <FeedbackPanel session={session} />
        </div>

        {/* Sidebar: STAR guide */}
        <div className="space-y-4">
          <StarFrameworkGuide />
        </div>
      </div>
    </div>
  );
}

// ─── Session History Item ───────────────────────────────────────────────────

function SessionHistoryItem({
  session,
  questions,
  onClick,
}: {
  session: InterviewSession;
  questions: InterviewQuestion[];
  onClick: () => void;
}) {
  const question = questions.find((q) => q.id === session.questionId);
  const score = session.aiScore;

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-lg border hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium line-clamp-2 flex-1">
          {question?.question ?? "Unknown question"}
        </p>
        {score != null && (
          <Badge
            variant="secondary"
            className={cn(
              "tabular-nums flex-shrink-0",
              score >= 80
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                : score >= 60
                  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                  : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
            )}
          >
            {score}/100
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        {question && <DifficultyBadge difficulty={question.difficulty} />}
        {session.isPublic && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Globe className="h-3 w-3" /> Published
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function InterviewPractice({
  resumeText,
  onStartRecording,
  onSessionComplete,
}: InterviewPracticeProps) {
  // State: questions library
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // State: sessions
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  // State: active session
  const [activeSession, setActiveSession] = useState<InterviewSession | null>(
    null,
  );
  const [activeQuestion, setActiveQuestion] =
    useState<InterviewQuestion | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);

  // ── Data fetching ───────────────────────────────────────────────────────

  const fetchQuestions = useCallback(async () => {
    setQuestionsLoading(true);
    setQuestionsError(null);
    try {
      const filters: { category?: string; difficulty?: string } = {};
      if (categoryFilter !== "all") filters.category = categoryFilter;
      if (difficultyFilter !== "all") filters.difficulty = difficultyFilter;
      const data = await getInterviewQuestions(filters);
      setQuestions(data);
    } catch (err) {
      setQuestionsError(
        err instanceof Error ? err.message : "Failed to load questions",
      );
    } finally {
      setQuestionsLoading(false);
    }
  }, [categoryFilter, difficultyFilter]);

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const data = await getInterviewSessions();
      setSessions(data);
    } catch {
      // silently handle — sessions list is secondary
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleStartSession = useCallback(
    async (question: InterviewQuestion) => {
      setIsStartingSession(true);
      try {
        const session = await startInterviewSession({
          questionId: question.id,
          resumeText,
        });
        setActiveSession(session);
        setActiveQuestion(question);
      } catch (err) {
        setQuestionsError(
          err instanceof Error ? err.message : "Failed to start session",
        );
      } finally {
        setIsStartingSession(false);
      }
    },
    [resumeText],
  );

  const handleToggleRecording = useCallback(() => {
    if (!activeSession || !activeQuestion) return;

    if (isRecording) {
      // Stop recording
      setIsRecording(false);
      onSessionComplete?.(activeSession.id);
      // Refresh sessions to pick up new data
      fetchSessions();
    } else {
      // Start recording
      setIsRecording(true);
      onStartRecording?.({
        id: activeQuestion.id,
        text: activeQuestion.question,
      });
    }
  }, [
    activeSession,
    activeQuestion,
    isRecording,
    onStartRecording,
    onSessionComplete,
    fetchSessions,
  ]);

  const handlePublishToggle = useCallback(
    async (isPublic: boolean) => {
      if (!activeSession) return;
      try {
        const updated = await updateInterviewSession(activeSession.id, {
          isPublic,
        });
        setActiveSession(updated);
        // Update in sessions list too
        setSessions((prev) =>
          prev.map((s) => (s.id === updated.id ? updated : s)),
        );
      } catch {
        // silently handle
      }
    },
    [activeSession],
  );

  const handleViewSession = useCallback(
    (session: InterviewSession) => {
      const question = questions.find((q) => q.id === session.questionId);
      setActiveSession(session);
      setActiveQuestion(question ?? null);
    },
    [questions],
  );

  const handleBackToLibrary = useCallback(() => {
    setActiveSession(null);
    setActiveQuestion(null);
    setIsRecording(false);
  }, []);

  // ── Derived state ───────────────────────────────────────────────────────

  const filteredQuestions = questions.filter((q) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      q.question.toLowerCase().includes(query) ||
      q.category.toLowerCase().includes(query) ||
      q.tips.some((t) => t.toLowerCase().includes(query))
    );
  });

  // ── Render: Active session ──────────────────────────────────────────────

  if (activeSession) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleBackToLibrary}>
            &larr; Back to Library
          </Button>
        </div>
        <SessionView
          session={activeSession}
          question={activeQuestion}
          isRecording={isRecording}
          onToggleRecording={handleToggleRecording}
          onPublishToggle={handlePublishToggle}
        />
      </div>
    );
  }

  // ── Render: Library + History ──────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Interview Practice
        </h2>
        <p className="text-muted-foreground mt-1">
          Practice answering common interview questions with AI-powered feedback.
        </p>
      </div>

      <Tabs defaultValue="questions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="questions" className="flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4" />
            Question Library
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1.5">
            <Star className="h-4 w-4" />
            Session History
          </TabsTrigger>
        </TabsList>

        {/* ── Questions Tab ─────────────────────────────────────────────── */}
        <TabsContent value="questions" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-5">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search questions..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                <Select
                  value={categoryFilter}
                  onValueChange={setCategoryFilter}
                >
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={difficultyFilter}
                  onValueChange={setDifficultyFilter}
                >
                  <SelectTrigger className="w-full sm:w-[160px]">
                    <SelectValue placeholder="Difficulty" />
                  </SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Error state */}
          {questionsError && (
            <Card className="border-destructive">
              <CardContent className="pt-5">
                <p className="text-sm text-destructive">{questionsError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={fetchQuestions}
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Loading state */}
          {questionsLoading && (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="pt-5 space-y-3">
                    <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                    <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
                    <div className="h-3 bg-muted rounded animate-pulse w-full" />
                    <div className="h-9 bg-muted rounded animate-pulse w-full mt-2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Questions grid */}
          {!questionsLoading && !questionsError && (
            <>
              {filteredQuestions.length === 0 ? (
                <Card>
                  <CardContent className="pt-5 text-center py-12">
                    <MessageSquare className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {questions.length === 0
                        ? "No questions available yet."
                        : "No questions match your filters."}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {filteredQuestions.map((q) => (
                    <QuestionCard
                      key={q.id}
                      question={q}
                      onStart={handleStartSession}
                      isStarting={isStartingSession}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ── History Tab ───────────────────────────────────────────────── */}
        <TabsContent value="history" className="space-y-4">
          {sessionsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg border space-y-2"
                >
                  <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
                </div>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <Card>
              <CardContent className="pt-5 text-center py-12">
                <Star className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No practice sessions yet. Pick a question to get started!
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <SessionHistoryItem
                  key={session.id}
                  session={session}
                  questions={questions}
                  onClick={() => handleViewSession(session)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
