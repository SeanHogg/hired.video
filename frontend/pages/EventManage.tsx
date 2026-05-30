/**
 * /events/[idOrSlug]/manage — host-only event management.
 *
 * Surfaces:
 *   • RSVP funnel + checked-in counter (`/api/events/:id/analytics`)
 *   • Attendee approval queue (host approves/rejects pending RSVPs)
 *   • Host blast composer (sends a notification to every approved attendee)
 *   • CSV export of attendee list
 *   • Quick links: publish/unpublish, cancel, edit
 *
 * Authorization: page-level — if the loaded event has `viewerIsHost` or
 * `viewerIsCoHost` false, we redirect to the detail page.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { confirmDialog } from "@/lib/dialogs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  BarChart3,
  Download,
  Loader2,
  Send,
  Sparkles,
  XCircle,
  CheckCircle2,
} from "lucide-react";
import {
  eventsService,
  type EventAnalytics,
  type EventAttendeePublic,
} from "@/lib/services/events-service";
import type { ResolvedEvent } from "@shared/events";

export default function EventManage() {
  const { idOrSlug } = useParams<{ idOrSlug: string }>();
  const navigate = useNavigate();

  const [event, setEvent] = useState<ResolvedEvent | null>(null);
  const [analytics, setAnalytics] = useState<EventAnalytics | null>(null);
  const [attendees, setAttendees] = useState<EventAttendeePublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [blastSubject, setBlastSubject] = useState("");
  const [blastMessage, setBlastMessage] = useState("");
  const [blastBusy, setBlastBusy] = useState(false);
  const [blastSent, setBlastSent] = useState<number | null>(null);

  useSEO("/events/:idOrSlug/manage");
  useBreadcrumbs(
    event
      ? [
          { name: "Events", url: "/tasks?surface=discover" },
          { name: event.title, url: `/events/${event.slug ?? event.id}` },
          { name: "Manage", url: `/events/${event.slug ?? event.id}/manage` },
        ]
      : [{ name: "Events", url: "/tasks?surface=discover" }],
  );

  async function reload() {
    if (!idOrSlug) return;
    setLoading(true);
    try {
      const ev = await eventsService.get(idOrSlug);
      setEvent(ev);
      if (!ev.viewerIsHost && !ev.viewerIsCoHost) {
        navigate(`/events/${ev.slug ?? ev.id}`, { replace: true });
        return;
      }
      const [stats, list] = await Promise.all([
        eventsService.getAnalytics(ev.id),
        eventsService.listAttendees(ev.id),
      ]);
      setAnalytics(stats);
      setAttendees(list.attendees ?? []);
    } catch {
      navigate("/tasks?surface=discover");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idOrSlug]);

  if (loading || !event || !analytics) {
    return (
      <AppShell bgClassName="bg-background">
        <main className="px-4 sm:px-6 lg:px-8 py-10">
          <div className="h-8 bg-muted rounded w-3/4 mb-3 animate-pulse" />
          <div className="h-4 bg-muted rounded w-1/2 mb-6 animate-pulse" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-24 bg-muted rounded animate-pulse" />
            ))}
          </div>
        </main>
      </AppShell>
    );
  }

  async function sendBlast() {
    if (!event) return;
    if (!blastSubject.trim() || !blastMessage.trim()) return;
    setBlastBusy(true);
    setBlastSent(null);
    try {
      const res = await eventsService.sendBlast(event.id, blastSubject, blastMessage);
      setBlastSent(res.sentTo);
      setBlastSubject("");
      setBlastMessage("");
    } finally {
      setBlastBusy(false);
    }
  }

  async function cancelEvent() {
    if (!event) return;
    if (!(await confirmDialog({ title: "Cancel event", description: "Cancel this event? Attendees will be notified.", confirmText: "Cancel event", destructive: true }))) return;
    await eventsService.cancel(event.id);
    void reload();
  }

  async function publishEvent() {
    if (!event) return;
    await eventsService.publish(event.id);
    void reload();
  }

  return (
    <AppShell bgClassName="bg-background">
      <main className="px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Title bar */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{event.title}</h1>
            <p className="text-sm text-muted-foreground">
              {new Date(event.startAt).toLocaleString()} ·{" "}
              {analytics.published ? "Published" : "Draft"}
              {analytics.cancelled ? " · Cancelled" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!analytics.published && (
              <Button onClick={publishEvent}>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Publish
              </Button>
            )}
            <Button variant="outline" asChild>
              <a href={eventsService.attendeeCsvUrl(event.id)} download>
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </a>
            </Button>
            {!analytics.cancelled && (
              <Button variant="ghost" onClick={cancelEvent}>
                <XCircle className="w-4 h-4 mr-2" />
                Cancel event
              </Button>
            )}
          </div>
        </div>

        {/* Counters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              RSVP funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <Stat label="Going" value={analytics.counts.going} />
              <Stat label="Maybe" value={analytics.counts.maybe} />
              <Stat label="Declined" value={analytics.counts.declined} />
              <Stat label="Waitlist" value={analytics.counts.waitlist} />
              <Stat
                label="Pending approval"
                value={analytics.counts.pendingApproval}
              />
              <Stat label="Checked in" value={analytics.counts.checkedIn} />
            </div>
            {event.capacity && (
              <div className="mt-3 text-sm text-muted-foreground">
                Capacity: {analytics.attendeeCount} / {event.capacity}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Approval queue */}
        {analytics.counts.pendingApproval > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Pending approval</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                These attendees requested to RSVP and are waiting for your decision.
              </p>
              <ApprovalQueue eventId={event.id} onChange={reload} />
            </CardContent>
          </Card>
        )}

        {/* Host blast */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-blue-600" />
              Send a message to attendees
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Subject"
              value={blastSubject}
              onChange={(e) => setBlastSubject(e.target.value)}
              maxLength={240}
            />
            <Textarea
              placeholder="Logistics, agenda, last-minute updates…"
              value={blastMessage}
              onChange={(e) => setBlastMessage(e.target.value)}
              rows={5}
              maxLength={2000}
            />
            <div className="flex items-center justify-between">
              {blastSent != null && (
                <div className="text-sm text-green-700 flex items-center gap-1">
                  <Sparkles className="w-4 h-4" />
                  Sent to {blastSent} attendees.
                </div>
              )}
              <div className="flex-1" />
              <Button onClick={sendBlast} disabled={blastBusy || !blastSubject || !blastMessage}>
                {blastBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Send blast
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Approved attendee list */}
        <Card>
          <CardHeader>
            <CardTitle>Going ({attendees.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {attendees.map((a) => (
                <div
                  key={a.userId}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm"
                >
                  <Avatar className="w-6 h-6">
                    {a.avatarUrl ? <AvatarImage src={a.avatarUrl} alt={a.name} /> : null}
                    <AvatarFallback>{a.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  {a.name}
                  {a.checkedIn && (
                    <CheckCircle2 className="w-3 h-3 text-green-600 ml-1" />
                  )}
                </div>
              ))}
              {attendees.length === 0 && (
                <p className="text-sm text-muted-foreground">No RSVPs yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border rounded p-3">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function ApprovalQueue({ eventId, onChange }: { eventId: string; onChange: () => void }) {
  // Lightweight: re-fetch attendees from list endpoint (only returns 'going'),
  // so for pending approval we need the host-only listing. The MVP here is a
  // placeholder — full pending-approval list endpoint is a small follow-up
  // (gap #1255 — host attendee management).
  return (
    <div className="text-sm text-muted-foreground">
      Approval list UI coming in a follow-up. Use{" "}
      <a
        href={`/api/events/${eventId}/attendees/export.csv`}
        className="text-blue-600 underline"
      >
        the CSV export
      </a>{" "}
      to see all attendees including pending approvals; then approve via the
      attendee detail API.
      <button
        type="button"
        onClick={onChange}
        className="ml-2 underline text-xs"
      >
        Refresh
      </button>
    </div>
  );
}
