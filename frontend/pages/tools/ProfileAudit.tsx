import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Loader2,
  Sparkles,
  XCircle,
  AlertCircle,
  Crown,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolShell } from "@/components/tools/ToolShell";
import PeopleCard from "@/components/PeopleCard";
import ProfilePagePreview, {
  type ProfilePagePreviewData,
} from "@/components/profile-audit/ProfilePagePreview";
import OpenToWorkButton from "@/components/profile/OpenToWorkButton";
import { useAuth } from "@/lib/auth";
import type { ProfileUpdate } from "@/lib/services/auth-service";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { appendDiagnosticReference } from "@/lib/llm-diagnostic";
import {
  profileAuditService,
  type ProfileAuditCheck,
  type ProfileAuditResult,
  type ProfileAuditSnapshot,
} from "@/lib/services/profile-audit-service";
import { useToolRunRecorder } from "@/lib/tools/use-tool-run-recorder";
import { toast } from "sonner";
import type { UserMetadata } from "@/types/people";

const TOOL_ID = "profile-audit";

export default function ProfileAudit() {
  const { isAuthenticated, user, updateProfile, refreshUser } = useAuth();
  const { isPro, loading: subLoading } = useSubscription();

  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<ProfileAuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<{
    headline?: boolean;
    summary?: boolean;
    currentRole?: boolean;
  }>({});
  const [isApplying, setIsApplying] = useState(false);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);
  const { recordRun } = useToolRunRecorder(TOOL_ID);

  const handleRun = async () => {
    if (!isAuthenticated) {
      setShowAuthOverlay(true);
      return;
    }
    setError(null);
    setResult(null);
    setAccepted({});
    setIsRunning(true);
    try {
      const data = await profileAuditService.run();
      setResult(data);
      const passes = data.checks.filter((c) => c.status === "pass");
      const issues = data.checks.filter((c) => c.status !== "pass");
      void recordRun({
        score: data.score,
        result: {
          overallScore: data.score,
          summary: data.rationales.topFix,
          strengths: passes.map((c) => `${c.label}: ${c.detail}`),
          weaknesses: issues.map((c) => `${c.label}: ${c.detail}`),
          recommendations: [
            { title: "Headline rewrite", description: `${data.rationales.headline}\n\nProposed: ${data.proposed.headline}` },
            { title: "Summary rewrite", description: `${data.rationales.summary}\n\nProposed: ${data.proposed.summary}` },
            ...(data.proposed.currentRole && data.proposed.currentRole !== data.current.currentRole
              ? [{ title: "Current role rewrite", description: `Proposed: ${data.proposed.currentRole}` }]
              : []),
          ],
          raw: data,
        },
        summary: `Profile audit — score ${data.score}/100. Top fix: ${data.rationales.topFix}`,
      });
    } catch (err: any) {
      const code = err?.context?.serverCode ?? err?.code;
      const msg = err?.context?.serverMessage ?? err?.message;
      let base: string;
      if (code === "PRO_REQUIRED") {
        base = msg ?? "Profile Audit is a Pro feature.";
      } else if (code === "AI_UNAVAILABLE" || code === "AI_RATE_LIMITED" || code === "AI_INVALID_RESPONSE" || code === "AI_AUTH_FAILED") {
        base = msg ?? "AI is temporarily unavailable. Try again in a minute.";
      } else if (code === "NOT_FOUND") {
        base = msg ?? "Could not load your profile.";
      } else {
        base = "Profile audit failed. Please try again.";
      }
      setError(appendDiagnosticReference(base, err));
    } finally {
      setIsRunning(false);
    }
  };

  const acceptedCount =
    (accepted.headline ? 1 : 0) +
    (accepted.summary ? 1 : 0) +
    (accepted.currentRole ? 1 : 0);

  const handleApply = async () => {
    if (!result || acceptedCount === 0) return;
    setIsApplying(true);
    try {
      const updates: ProfileUpdate = {};
      if (accepted.headline) updates.headline = result.proposed.headline;
      if (accepted.summary) updates.summary = result.proposed.summary;
      if (accepted.currentRole && result.proposed.currentRole) {
        updates.currentRole = result.proposed.currentRole;
      }
      await updateProfile(updates);
      await refreshUser();
      toast.success(`Applied ${acceptedCount} update${acceptedCount === 1 ? "" : "s"} to your profile.`);
      setAccepted({});
    } catch (err) {
      console.error("[ProfileAudit] apply failed", err);
      toast.error("Could not save the updates. Please try again.");
    } finally {
      setIsApplying(false);
    }
  };

  // Build the two preview-data shapes from the audit result. One
  // function, two call sites — guarantees the diff between current and
  // proposed comes only from the fields we accepted, not from a
  // divergent renderer.
  const currentPreview = useMemo<ProfilePagePreviewData | null>(
    () => (result ? snapshotToPreview(result.current) : null),
    [result],
  );
  const proposedPreview = useMemo<ProfilePagePreviewData | null>(
    () =>
      result
        ? {
            ...snapshotToPreview(result.current),
            headline: result.proposed.headline,
            summary: result.proposed.summary,
            currentRole: result.proposed.currentRole ?? result.current.currentRole,
          }
        : null,
    [result],
  );

  const currentCardPerson = useMemo<UserMetadata | null>(
    () => (result ? snapshotToPeopleCard(result.current, user?.id) : null),
    [result, user?.id],
  );
  const proposedCardPerson = useMemo<UserMetadata | null>(
    () =>
      result && currentCardPerson
        ? {
            ...currentCardPerson,
            headline: result.proposed.headline,
            currentPosition: result.proposed.currentRole ?? currentCardPerson.currentPosition,
          }
        : null,
    [result, currentCardPerson],
  );

  // Authenticated-but-not-Pro: render an upsell. Anonymous users see the
  // run bar like everyone else; the overlay only fires when they click Run.
  // Self-gating (per the codebase rule) — the page decides what to show
  // based on its own dependencies, no `canAudit` prop drilling required.
  const showProUpsell = isAuthenticated && !subLoading && !isPro;

  return (
    <ToolShell
      toolId={TOOL_ID}
      header={{
        icon: <Sparkles className="h-6 w-6 text-brand-purple" />,
        iconBgClassName: "bg-brand-purple/10",
        title: "Profile Audit",
        description:
          "Grade your profile against the recruiter 7-second skim, then accept an AI-rewritten headline and summary.",
        tier: "pro",
      }}
      authOverlay={{
        show: showAuthOverlay,
        message:
          "Sign in to audit your candidate profile — we'll grade your headline, summary, and recruiter signals, then propose a rewrite.",
      }}
    >
            {showProUpsell ? (
              <ProUpsell />
            ) : (
              <RunBar
                isRunning={isRunning}
                hasResult={!!result}
                onRun={handleRun}
                error={error}
              />
            )}

            {result && currentPreview && proposedPreview && currentCardPerson && proposedCardPerson && (
              <>
                <ScoreAndChecks
                  score={result.score}
                  checks={result.checks}
                  topFix={result.rationales.topFix}
                  onOpenToWorkChanged={handleRun}
                />

                <Tabs defaultValue="card" className="space-y-4">
                  <TabsList>
                    <TabsTrigger value="card">Card view (search results)</TabsTrigger>
                    <TabsTrigger value="page">Page view (your profile)</TabsTrigger>
                  </TabsList>

                  <TabsContent value="card">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <LabeledColumn label="Current" tone="neutral">
                        <PeopleCard person={currentCardPerson} />
                      </LabeledColumn>
                      <LabeledColumn label="Proposed" tone="positive">
                        <PeopleCard person={proposedCardPerson} />
                      </LabeledColumn>
                    </div>
                  </TabsContent>

                  <TabsContent value="page">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <ProfilePagePreview
                        data={currentPreview}
                        variantLabel="Current"
                        variantRingClassName="ring-muted"
                      />
                      <ProfilePagePreview
                        data={proposedPreview}
                        variantLabel="Proposed"
                        variantRingClassName="ring-brand-purple/30"
                      />
                    </div>
                  </TabsContent>
                </Tabs>

                <RewritePanel
                  current={result.current}
                  proposed={result.proposed}
                  rationales={result.rationales}
                  accepted={accepted}
                  onToggle={(field) => setAccepted((s) => ({ ...s, [field]: !s[field] }))}
                />

                <div className="flex items-center justify-end gap-3 pt-2">
                  <span className="text-sm text-muted-foreground">
                    {acceptedCount === 0
                      ? "Tick the changes you want to apply"
                      : `${acceptedCount} change${acceptedCount === 1 ? "" : "s"} ready to apply`}
                  </span>
                  <Button
                    onClick={handleApply}
                    disabled={acceptedCount === 0 || isApplying}
                    className="min-w-[160px]"
                  >
                    {isApplying ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Apply to my profile
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
    </ToolShell>
  );
}

// ── Small subcomponents ─────────────────────────────────────────────────────

function ProUpsell() {
  return (
    <Card className="border-amber-300/60 bg-amber-50/30">
      <CardContent className="p-8 flex items-start gap-4">
        <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <Crown className="h-6 w-6 text-amber-700" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold mb-1">Profile Audit is a Pro feature</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Recruiters scan your profile in seven seconds. Profile Audit grades your headline, summary, activity, and recruiter signals — then rewrites the weak parts so you pass that skim. Available on Pro.
          </p>
          <Link to="/pricing">
            <Button>
              <Crown className="h-4 w-4 mr-2" />
              See Pro pricing
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

interface RunBarProps {
  isRunning: boolean;
  hasResult: boolean;
  onRun: () => void;
  error: string | null;
}

function RunBar({ isRunning, hasResult, onRun, error }: RunBarProps) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <p className="font-medium">
            {hasResult ? "Re-run with the latest profile data" : "Audit your profile now"}
          </p>
          <p className="text-sm text-muted-foreground">
            We'll read your current profile, grade five recruiter signals, and propose a rewrite.
          </p>
        </div>
        <Button onClick={onRun} disabled={isRunning} className="min-w-[180px]">
          {isRunning ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Auditing...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              {hasResult ? "Re-run audit" : "Run profile audit"}
            </>
          )}
        </Button>
        {error && (
          <Alert variant="destructive" className="w-full mt-2 sm:mt-0">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

interface ScoreAndChecksProps {
  score: number;
  checks: ProfileAuditCheck[];
  topFix: string;
  onOpenToWorkChanged?: () => void;
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

function checkIcon(status: ProfileAuditCheck["status"]) {
  if (status === "pass") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (status === "warn") return <AlertCircle className="h-4 w-4 text-yellow-600" />;
  return <XCircle className="h-4 w-4 text-red-600" />;
}

function ScoreAndChecks({ score, checks, topFix, onOpenToWorkChanged }: ScoreAndChecksProps) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        <div className="text-center md:text-left">
          <p className="text-sm text-muted-foreground">Profile score</p>
          <p className={`text-5xl font-bold ${scoreColor(score)}`}>{score}<span className="text-xl text-muted-foreground">/100</span></p>
          <p className="text-xs text-muted-foreground mt-2">Across the 5 recruiter-skim checks below.</p>
        </div>
        <ul className="md:col-span-2 space-y-2">
          {checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-sm">
              <span className="flex-shrink-0 mt-0.5">{checkIcon(c.status)}</span>
              <div className="flex-1 min-w-0">
                <span className="font-medium">{c.label}: </span>
                <span className="text-muted-foreground">{c.detail}</span>
                {c.id === "openToWork" && (
                  <div className="mt-2">
                    <OpenToWorkButton onAfterChange={onOpenToWorkChanged} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="md:col-span-3 mt-2 p-3 rounded-md bg-brand-purple/5 border border-brand-purple/20">
          <p className="text-xs uppercase tracking-wide text-brand-purple font-semibold mb-1">Top fix</p>
          <p className="text-sm">{topFix}</p>
        </div>
      </CardContent>
    </Card>
  );
}

interface LabeledColumnProps {
  label: string;
  tone: "neutral" | "positive";
  children: React.ReactNode;
}

function LabeledColumn({ label, tone, children }: LabeledColumnProps) {
  return (
    <div className={`rounded-lg ring-2 ${tone === "positive" ? "ring-brand-purple/30" : "ring-muted"} p-3 space-y-3`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

interface RewritePanelProps {
  current: ProfileAuditSnapshot;
  proposed: ProfileAuditResult["proposed"];
  rationales: ProfileAuditResult["rationales"];
  accepted: { headline?: boolean; summary?: boolean; currentRole?: boolean };
  onToggle: (field: "headline" | "summary" | "currentRole") => void;
}

function RewritePanel({ current, proposed, rationales, accepted, onToggle }: RewritePanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Proposed rewrites</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <RewriteRow
          field="headline"
          label="Headline"
          before={current.headline ?? ""}
          after={proposed.headline}
          rationale={rationales.headline}
          accepted={!!accepted.headline}
          onToggle={() => onToggle("headline")}
        />
        <RewriteRow
          field="summary"
          label="About / summary"
          before={current.summary ?? ""}
          after={proposed.summary}
          rationale={rationales.summary}
          accepted={!!accepted.summary}
          onToggle={() => onToggle("summary")}
        />
        {proposed.currentRole && proposed.currentRole !== current.currentRole && (
          <RewriteRow
            field="currentRole"
            label="Current role"
            before={current.currentRole ?? ""}
            after={proposed.currentRole}
            rationale="Cleaner phrasing of your current role line."
            accepted={!!accepted.currentRole}
            onToggle={() => onToggle("currentRole")}
          />
        )}
      </CardContent>
    </Card>
  );
}

interface RewriteRowProps {
  field: string;
  label: string;
  before: string;
  after: string;
  rationale: string;
  accepted: boolean;
  onToggle: () => void;
}

function RewriteRow({ label, before, after, rationale, accepted, onToggle }: RewriteRowProps) {
  return (
    <div className={`border rounded-md p-3 transition-colors ${accepted ? "border-green-500/60 bg-green-500/5" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
          {label}
        </span>
        <Button
          size="sm"
          variant={accepted ? "default" : "outline"}
          onClick={onToggle}
        >
          {accepted ? (
            <>
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Accepted
            </>
          ) : (
            "Accept rewrite"
          )}
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
        <div className="bg-red-500/5 border border-red-500/20 p-2 rounded text-sm">
          <div className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">Before</div>
          <div className="whitespace-pre-wrap break-words">{before || <em className="text-muted-foreground">empty</em>}</div>
        </div>
        <div className="bg-green-500/5 border border-green-500/20 p-2 rounded text-sm">
          <div className="text-xs font-semibold text-green-700 dark:text-green-300 mb-1">After</div>
          <div className="whitespace-pre-wrap break-words">{after}</div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-semibold">Why:</span> {rationale}
      </p>
    </div>
  );
}

// ── Adapters ────────────────────────────────────────────────────────────────

function snapshotToPreview(s: ProfileAuditSnapshot): ProfilePagePreviewData {
  return {
    fullName: s.fullName,
    avatarUrl: s.avatarUrl,
    headline: s.headline,
    summary: s.summary,
    currentRole: s.currentRole,
    currentCompany: s.currentCompany,
    location: s.location,
    openToWork: s.openToWork,
  };
}

function snapshotToPeopleCard(s: ProfileAuditSnapshot, ownId: string | undefined): UserMetadata {
  const [first, ...rest] = (s.fullName || "").split(/\s+/);
  return {
    id: ownId ?? "preview",
    slug: ownId ?? "preview",
    firstName: first ?? "",
    lastName: rest.join(" "),
    fullName: s.fullName || "You",
    avatar: s.avatarUrl ?? undefined,
    headline: s.headline ?? "",
    location: s.location ?? "",
    role: s.role ?? "",
    visibility: "public" as any,
    status: (s.openToWork ? "looking" : "active") as any,
    createdAt: s.createdAt ?? new Date().toISOString(),
    updatedAt: s.lastActiveAt ?? new Date().toISOString(),
    lastActiveAt: s.lastActiveAt ?? new Date().toISOString(),
    profileViews: 0,
    connectionCount: 0,
    followerCount: 0,
    emailConfirmed: true,
    isPro: true,
    openToWork: s.openToWork,
    currentPosition: s.currentRole ?? undefined,
    currentCompany: s.currentCompany ?? undefined,
  };
}
