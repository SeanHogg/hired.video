// CandidateDetail — recruiter view of a single candidate_resume. Shows
// the full (un-redacted) resume through DeclarativeResumeRenderer in
// print mode, plus a sidebar for variants + shares + notes.
//
// From this page a recruiter can:
//   • View the resume as-stored (variants + active flag)
//   • Mark any variant active for sharing
//   • Create a redacted + branded share link (ShareCreationDialog)
//   • Revoke existing shares
//   • Edit recruiter-private notes
//   • Delete the candidate (and all variants via cascade)

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  Check,
  Copy,
  ExternalLink,
  Power,
  Share2,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import DeclarativeResumeRenderer from "@/components/resume-renderer/DeclarativeResumeRenderer";
import { confirmDialog } from "@/lib/dialogs";
import { AppShell } from "@/components/AppShell";
import ServicesNav from "@/components/services/ServicesNav";
import ShareCreationDialog from "@/components/services/ShareCreationDialog";
import { CandidateScoringPanel } from "@/components/scorecards/CandidateScoringPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { canRedactAndShare } from "@/lib/persona";
import {
  recruitService,
  type CandidateResumeRow,
  type CandidateResumeShareRow,
  type RecruitScope,
} from "@/lib/services/recruit-service";
import type { Resume } from "@/types/resume";
import type { ResumeTemplateDescriptor } from "@/types/resume-template";

// Recruiter print descriptor — no hero, un-redacted, dense. This is the
// recruiter's internal view before applying redaction for a share.
const RECRUITER_DESCRIPTOR: ResumeTemplateDescriptor = {
  id: "recruiter-print",
  name: "Recruiter Print",
  version: "1.2",
  documentMode: "print",
  theme: {
    themeKey: "iron-gray",
    fontFamily: "sans",
    headingStyle: "underlined",
    density: "comfortable",
    cardStyle: "ghost",
    sectionTitleSize: "md",
  },
  layout: { columns: 1 },
  hero: {
    enabled: true,
    layout: "compact",
    showAvatar: false,
    showContactButtons: true,
    showSummary: true,
    showVideo: false,
  },
  sections: [
    { key: "work", enabled: true, title: "Work Experience", icon: "building", layout: "list", showHighlights: true, sortBy: "date_desc" },
    { key: "education", enabled: true, title: "Education", icon: "graduation-cap", layout: "list", sortBy: "date_desc" },
    { key: "projects", enabled: true, title: "Projects", icon: "folder-open", layout: "list" },
    { key: "skills", enabled: true, title: "Skills", icon: "star", layout: "grid", columns: 3 },
    { key: "certificates", enabled: true, title: "Certificates", icon: "award", layout: "list" },
    { key: "languages", enabled: true, title: "Languages", icon: "languages", layout: "grid", columns: 3 },
    { key: "awards", enabled: true, title: "Awards", icon: "trophy", layout: "list" },
  ],
};

function wrapAsResume(row: CandidateResumeRow): Resume {
  return {
    id: row.id,
    userId: row.importedByUserId ?? "recruiter",
    title: row.label ?? ((row.content as any)?.basics?.name ?? "Candidate"),
    slug: null,
    content: row.content as any,
    status: "published" as any,
    privacy: "private" as any,
    isMaster: true,
    isActive: row.isActive,
    parentId: row.parentId,
    diffPercent: null,
    templateId: null,
    metaResumeId: null,
    sentimentScore: null,
    scores: null,
    viewCount: 0,
    isOwner: true,
    isWatched: false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export default function CandidateDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Recruiters (and admin / SA) get the redaction + share-link UI used to
  // present candidates to external hiring clients. Direct-hiring employers
  // don't need redaction — they're the buyer, not the broker. Self-gated
  // here per the standing DRY rule (no `canShare` prop drilling).
  const { effectiveRole } = usePermissions();
  const showShareUI = canRedactAndShare(effectiveRole);

  const [row, setRow] = useState<CandidateResumeRow | null>(null);
  const [variants, setVariants] = useState<CandidateResumeRow[]>([]);
  const [shares, setShares] = useState<CandidateResumeShareRow[]>([]);
  const [scope, setScope] = useState<RecruitScope | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    (async () => {
      try {
        const [candidate, s] = await Promise.all([
          recruitService.getCandidateResume(id),
          recruitService.getMyScope(),
        ]);
        if (!isMounted) return;
        setRow(candidate);
        setScope(s);
        setNotes(candidate.recruiterNotes ?? "");
        setNotesDirty(false);

        // Fetch siblings (same talent_pool_candidate_id) so variants are
        // visible as a version history. When there's no talent_pool_candidate_id
        // this resume has no siblings — it's a standalone import.
        if (candidate.talentPoolCandidateId) {
          const allForCandidate = await recruitService.listCandidateResumes({
            companyId: candidate.companyId,
            talentPoolCandidateId: candidate.talentPoolCandidateId,
          });
          if (isMounted) setVariants(allForCandidate);
        } else {
          setVariants([candidate]);
        }

        const existingShares = await recruitService.listShares({
          companyId: candidate.companyId,
          candidateResumeId: candidate.id,
        });
        if (isMounted) setShares(existingShares);
      } catch {
        if (!isMounted) return;
        setNotFound(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [id]);

  const resume = useMemo(() => (row ? wrapAsResume(row) : null), [row]);

  const handleSaveNotes = async () => {
    if (!row) return;
    try {
      setNotesSaving(true);
      const updated = await recruitService.updateCandidateResume(row.id, {
        recruiterNotes: notes.trim() || null,
      });
      setRow(updated);
      setNotesDirty(false);
      toast({ title: "Notes saved" });
    } catch (e) {
      toast({
        title: "Failed to save notes",
        description: (e as Error)?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setNotesSaving(false);
    }
  };

  const handleActivate = async (variantId: string) => {
    try {
      await recruitService.activateCandidateResume(variantId);
      // Refresh the variants list + current row active flag.
      if (row?.talentPoolCandidateId) {
        const refreshed = await recruitService.listCandidateResumes({
          companyId: row.companyId,
          talentPoolCandidateId: row.talentPoolCandidateId,
        });
        setVariants(refreshed);
        const mine = refreshed.find((v) => v.id === row.id);
        if (mine) setRow(mine);
      }
      toast({ title: "Variant activated", description: "Shares from now on use this version." });
    } catch (e) {
      toast({
        title: "Activate failed",
        description: (e as Error)?.message ?? "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleRevokeShare = async (shareId: string) => {
    try {
      await recruitService.revokeShare(shareId);
      setShares((prev) => prev.filter((s) => s.id !== shareId));
      toast({ title: "Share revoked" });
    } catch (e) {
      toast({
        title: "Revoke failed",
        description: (e as Error)?.message ?? "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!row) return;
    if (
      !(await confirmDialog({
        title: "Delete candidate",
        description: "Delete this candidate resume? Variants and share links will also be removed.",
        confirmText: "Delete",
        destructive: true,
      }))
    ) {
      return;
    }
    try {
      await recruitService.deleteCandidateResume(row.id);
      toast({ title: "Candidate deleted" });
      navigate("/resumes?tab=sourced");
    } catch (e) {
      toast({
        title: "Delete failed",
        description: (e as Error)?.message ?? "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCopyShare = async (share: CandidateResumeShareRow) => {
    const url = `${window.location.origin}/share/candidate-resume/${share.shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedShareId(share.id);
      setTimeout(() => setCopiedShareId(null), 2000);
    } catch {
      toast({
        title: "Clipboard unavailable",
        description: url,
        variant: "destructive",
      });
    }
  };

  return (
    <AppShell bgClassName="bg-background">
        <div>
          <div className="p-6">
            <ServicesNav />

            <div className="mb-4">
              <Button variant="outline" size="sm" asChild>
                <Link to="/resumes?tab=sourced">
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  All candidates
                </Link>
              </Button>
            </div>

            {loading && (
              <div className="rounded-lg border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
                Loading candidate…
              </div>
            )}

            {!loading && (notFound || !row || !resume) && (
              <div className="rounded-lg border bg-muted/30 p-10 text-center">
                <h2 className="font-semibold">Candidate not found</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  This resume may have been deleted, or it doesn't belong to a company you
                  can access.
                </p>
              </div>
            )}

            {!loading && row && resume && (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
                {/* Main resume view */}
                <div>
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <Badge variant={row.isActive ? "default" : "secondary"}>
                        <UserCheck className="w-3 h-3 mr-1" />
                        {row.isActive ? "Active variant" : "Variant"}
                      </Badge>
                      {row.label && (
                        <Badge variant="outline" className="text-xs">
                          {row.label}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {showShareUI && (
                        <Button size="sm" onClick={() => setShareDialogOpen(true)}>
                          <Share2 className="w-4 h-4 mr-1" />
                          Share
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDelete}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-lg border bg-background overflow-hidden">
                    <DeclarativeResumeRenderer
                      resume={resume}
                      descriptor={RECRUITER_DESCRIPTOR}
                      embedded
                    />
                  </div>

                  {/* Structured-hiring scoring + debrief for this candidate.
                      Uses the candidate_resume id as the application key —
                      polymorphic across pipeline sources. */}
                  <div className="mt-6">
                    <CandidateScoringPanel
                      companyId={row.companyId}
                      applicationId={row.id}
                      candidateUserId={row.linkedUserId ?? undefined}
                    />
                  </div>
                </div>

                {/* Sidebar: variants + shares + notes */}
                <aside className="space-y-6">
                  {/* Variants */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Variants
                        <Badge variant="outline" className="ml-auto">
                          {variants.length}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {variants.length <= 1 && (
                        <p className="text-xs text-muted-foreground">
                          {row.talentPoolCandidateId
                            ? "Request a fresh resume from the candidate and import it as a new variant."
                            : "Variants require a talent-pool candidate link. Import this resume into a pool to enable version history."}
                        </p>
                      )}
                      {variants.map((v) => (
                        <div
                          key={v.id}
                          className={`rounded border p-2 text-xs ${
                            v.id === row.id ? "bg-muted/50" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-medium truncate">
                                {v.label || new Date(v.createdAt).toLocaleDateString()}
                              </div>
                              <div className="text-muted-foreground">
                                <Calendar className="w-3 h-3 inline mr-1" />
                                {new Date(v.updatedAt).toLocaleDateString()}
                              </div>
                            </div>
                            {v.isActive ? (
                              <Badge variant="default" className="text-[10px]">
                                Active
                              </Badge>
                            ) : v.id !== row.id ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px]"
                                onClick={() => handleActivate(v.id)}
                              >
                                <Power className="w-3 h-3 mr-1" />
                                Activate
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px]"
                                onClick={() => handleActivate(v.id)}
                              >
                                <Power className="w-3 h-3 mr-1" />
                                Activate
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Active share links — recruiter / admin / SA only. */}
                  {showShareUI && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Share2 className="w-4 h-4" />
                        Share links
                        <Badge variant="outline" className="ml-auto">
                          {shares.length}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {shares.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No shares yet. Click <span className="font-medium">Share</span> to
                          create a redacted + branded link you can send to a hiring client.
                        </p>
                      )}
                      {shares.map((share) => {
                        const url = `${window.location.origin}/share/candidate-resume/${share.shareToken}`;
                        const expired =
                          share.expiresAt &&
                          new Date(share.expiresAt).getTime() < Date.now();
                        return (
                          <div
                            key={share.id}
                            className="rounded border p-2 text-xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-medium truncate">
                                  {share.recipientEmail || share.name || "Link"}
                                </div>
                                <div className="text-muted-foreground">
                                  {share.viewCount} view{share.viewCount === 1 ? "" : "s"}
                                  {share.lastViewedAt && (
                                    <>
                                      {" "}· last{" "}
                                      {new Date(share.lastViewedAt).toLocaleDateString()}
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                {!share.isActive && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Revoked
                                  </Badge>
                                )}
                                {expired && (
                                  <Badge variant="outline" className="text-[10px]">
                                    Expired
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px] flex-1 justify-start"
                                onClick={() => handleCopyShare(share)}
                              >
                                {copiedShareId === share.id ? (
                                  <>
                                    <Check className="w-3 h-3 mr-1" />
                                    Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3 mr-1" />
                                    Copy link
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px]"
                                asChild
                              >
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </Button>
                              {share.isActive && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-[10px]"
                                  onClick={() => handleRevokeShare(share.id)}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                  )}

                  {/* Recruiter notes */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Recruiter notes</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Textarea
                        value={notes}
                        onChange={(e) => {
                          setNotes(e.target.value);
                          setNotesDirty(true);
                        }}
                        rows={6}
                        placeholder="Private notes — visible only to your team, never to hiring clients."
                        className="text-xs"
                      />
                      {notesDirty && (
                        <Button size="sm" onClick={handleSaveNotes} disabled={notesSaving}>
                          {notesSaving ? "Saving…" : "Save notes"}
                        </Button>
                      )}
                    </CardContent>
                  </Card>

                  {/* Privacy reminder */}
                  <Alert>
                    <ShieldCheck className="h-4 w-4" />
                    <AlertTitle className="text-sm">Private to your agency</AlertTitle>
                    <AlertDescription className="text-xs">
                      This resume is only visible to your team. Shared links apply a redaction
                      profile before rendering.
                    </AlertDescription>
                  </Alert>
                </aside>
              </div>
            )}
          </div>
        </div>

      {row && showShareUI && (
        <ShareCreationDialog
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          companyId={row.companyId}
          candidateResumeId={row.id}
          scope={scope}
          onShareCreated={(share) => setShares((prev) => [share, ...prev])}
        />
      )}
    </AppShell>
  );
}
