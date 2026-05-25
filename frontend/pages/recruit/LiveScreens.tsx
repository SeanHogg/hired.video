/**
 * Recruiter live-screening hub (#1239) at /recruit/live-screens.
 *
 * Creates back-to-back live-screen sessions (window + slot length + meeting
 * URL), lists every session the recruiter owns, opens a session's slot
 * roster, and lets the recruiter copy each invite link from the table.
 *
 * Scheduling (POST /sessions/:id/schedule) is intentionally NOT exposed
 * yet — that flow needs a candidate picker that pulls from talent pools,
 * which is its own surface (#1240 will track if needed). For now,
 * recruiters seed candidates via the existing async-interview tooling and
 * pivot here for the live-meeting slot UX.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarClock,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  Video,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth";
import { USER_ROLES } from "@shared/user-roles";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { useLocation } from "react-router-dom";
import {
  createLiveScreenSession,
  getLiveScreenSession,
  listLiveScreenSessions,
  type LiveScreenInvite,
  type LiveScreenSession,
} from "@/lib/services/live-screen-service";
import { toast } from "sonner";

export default function LiveScreens() {
  const location = useLocation();
  useSEO(location.pathname);
  useBreadcrumbs([
    { name: "Recruit", url: "/recruit" },
    { name: "Live screens", url: "/recruit/live-screens" },
  ]);

  const { isAuthenticated, user } = useAuth();
  const isRecruiter =
    user?.role === USER_ROLES.RECRUITER ||
    user?.role === USER_ROLES.EMPLOYER ||
    user?.role === USER_ROLES.ADMIN ||
    user?.role === USER_ROLES.SUPER_ADMIN;

  const [sessions, setSessions] = useState<LiveScreenSession[] | null>(null);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function refresh() {
    try {
      const rows = await listLiveScreenSessions();
      setSessions(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load sessions");
    }
  }

  useEffect(() => {
    if (isAuthenticated && isRecruiter) void refresh();
  }, [isAuthenticated, isRecruiter]);

  if (!isAuthenticated || !isRecruiter) {
    return (
      <AppShell>
        <div className="container mx-auto px-4 py-6 max-w-3xl">
          <Alert>
            <AlertDescription>
              Live screens are a recruiter/employer feature. Sign in with the right account to use them.
            </AlertDescription>
          </Alert>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Live screens</h1>
            <p className="text-sm text-muted-foreground">
              ZipIntro-style back-to-back slots. Declare a window, share a meeting URL, send invites.
            </p>
          </div>
          <Button onClick={() => setCreating(true)} className="gap-1">
            <Plus className="h-4 w-4" />
            New session
          </Button>
        </div>

        {sessions === null ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-2">
              <Video className="h-10 w-10 text-muted-foreground/50 mx-auto" />
              <p className="text-sm text-muted-foreground">
                No live-screen sessions yet. Create one to start sending invites.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <SessionRow key={s.id} session={s} onOpen={() => setOpenSessionId(s.id)} />
            ))}
          </div>
        )}

        {creating && (
          <CreateSessionDialog
            onClose={() => setCreating(false)}
            onCreated={() => {
              setCreating(false);
              void refresh();
            }}
          />
        )}
        {openSessionId && (
          <SessionDetailDialog
            sessionId={openSessionId}
            onClose={() => setOpenSessionId(null)}
          />
        )}
      </div>
    </AppShell>
  );
}

function SessionRow({ session, onOpen }: { session: LiveScreenSession; onOpen: () => void }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-medium text-sm">{session.title}</span>
              <Badge variant="outline" className="text-[10px]">{session.status}</Badge>
            </div>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
              <span className="flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />
                {formatSessionWindow(session.startTime, session.endTime)}
              </span>
              <span>{session.slotMinutes}-min slots</span>
              {session.meetingUrl ? (
                <a
                  href={session.meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Meeting URL
                </a>
              ) : (
                <span className="text-amber-600">No meeting URL yet</span>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onOpen}>
            Open
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateSessionDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [slotMinutes, setSlotMinutes] = useState(8);
  const [meetingUrl, setMeetingUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const capacity = useMemo(() => {
    if (!startTime || !endTime) return 0;
    const s = new Date(startTime);
    const e = new Date(endTime);
    if (!(e > s)) return 0;
    return Math.floor((e.getTime() - s.getTime()) / (slotMinutes * 60_000));
  }, [startTime, endTime, slotMinutes]);

  async function handleSave() {
    if (!title.trim() || !startTime || !endTime) {
      toast.error("Title, start, and end are required");
      return;
    }
    setSaving(true);
    try {
      await createLiveScreenSession({
        title: title.trim(),
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        slotMinutes,
        meetingUrl: meetingUrl.trim() || null,
      });
      toast.success("Session created");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New live screening session</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Senior Backend - Tuesday 1-3pm PT" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start</Label>
              <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End</Label>
              <Input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Slot length (min)</Label>
              <Input
                type="number"
                min={3}
                max={60}
                value={slotMinutes}
                onChange={(e) => setSlotMinutes(Math.max(3, Math.min(60, Number(e.target.value))))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Capacity</Label>
              <Input value={capacity ? `${capacity} candidates` : "—"} readOnly />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Meeting URL (Zoom / Meet / Whereby)</Label>
            <Input value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="https://meet.example.com/abc" />
            <p className="text-[11px] text-muted-foreground">
              Optional — without one the session stays in draft until you add it.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SessionDetailDialog({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [data, setData] = useState<{ session: LiveScreenSession; invites: LiveScreenInvite[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLiveScreenSession(sessionId)
      .then(setData)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load"))
      .finally(() => setLoading(false));
  }, [sessionId]);

  function copyInviteLink(token: string) {
    const url = `${window.location.origin}/live-screen/${token}`;
    void navigator.clipboard.writeText(url).then(
      () => toast.success("Invite link copied"),
      () => toast.error("Could not copy"),
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data?.session.title ?? "Session"}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <Alert variant="destructive">
            <AlertDescription>Could not load session</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              {formatSessionWindow(data.session.startTime, data.session.endTime)} · {data.session.slotMinutes}-min slots · {data.invites.length} invite
              {data.invites.length === 1 ? "" : "s"}
            </div>
            {data.invites.length === 0 ? (
              <Alert>
                <AlertDescription>
                  No invites scheduled yet. Use the talent-pool picker (coming soon) or contact your recruiter ops to seed candidates.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2">
                {data.invites.map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{i.candidateName}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatTime(i.slotStart)}–{formatTime(i.slotEnd)} · {i.status}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => copyInviteLink(i.inviteToken)}>
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      Copy link
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Link to="/interview-assignments" className="text-xs text-primary hover:underline">
              Looking for async interviews? →
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Pure formatters (exported so the test suite can pin them) ──────────────

export function formatSessionWindow(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const day = start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `${day} · ${formatTime(start)} – ${formatTime(end)}`;
}

export function formatTime(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
