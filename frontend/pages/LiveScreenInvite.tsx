/**
 * LiveScreenInvite — candidate-facing magic-link page for the back-to-back
 * live-screening flow (#1239). Mounted at /live-screen/:token.
 *
 * No auth required — the token IS the credential. Candidate sees their
 * assigned slot + meeting URL once accepted; decline records a reason.
 *
 * Mirrors AsyncInterviewPage in shape (preview → action) so the two
 * magic-link surfaces feel consistent.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Video,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  getLiveScreenInvite,
  respondLiveScreenInvite,
  type LiveScreenInvitePreview,
} from "@/lib/services/live-screen-service";
import { toast } from "sonner";

export default function LiveScreenInvite() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<LiveScreenInvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [responding, setResponding] = useState(false);
  const [notes, setNotes] = useState("");

  function refresh() {
    if (!token) return;
    setLoading(true);
    getLiveScreenInvite(token)
      .then(setData)
      .catch((err) => setError(err?.message ?? "Invite not found"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleRespond(action: "accept" | "decline") {
    if (!token) return;
    setResponding(true);
    try {
      await respondLiveScreenInvite(token, action, notes.trim() || undefined);
      toast.success(action === "accept" ? "Slot confirmed!" : "Declined — recruiter notified");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not respond");
    } finally {
      setResponding(false);
    }
  }

  if (loading) {
    return (
      <Wrap>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </Wrap>
    );
  }
  if (error || !data) {
    return (
      <Wrap>
        <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Invite not available</h2>
        <p className="text-muted-foreground">{error ?? "This link is invalid or has expired."}</p>
      </Wrap>
    );
  }

  const { invite, session } = data;
  const isPending = invite.status === "pending";
  const accepted = invite.status === "accepted";
  const declined = invite.status === "declined";
  const completed = invite.status === "completed";
  const noShow = invite.status === "no_show";

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-brand-purple" />
              {session?.title ?? "Live screening"}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Hi {invite.candidateName},</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Your slot:</span>
              </div>
              <div className="text-lg font-semibold">{formatSlot(invite.slotStart, invite.slotEnd)}</div>
              {session?.slotMinutes && (
                <Badge variant="outline">~{session.slotMinutes} min</Badge>
              )}
            </div>

            {/* Accepted: surface the meeting URL */}
            {accepted && session?.meetingUrl && (
              <Alert>
                <AlertDescription className="flex items-center justify-between gap-2">
                  <span>Meeting link ready — join at your slot start time.</span>
                  <Button asChild size="sm">
                    <a href={session.meetingUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Open meeting
                    </a>
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Status banners */}
            {accepted && !session?.meetingUrl && (
              <Alert>
                <AlertDescription>
                  Your slot is confirmed. The recruiter will share the meeting link before it starts.
                </AlertDescription>
              </Alert>
            )}
            {declined && (
              <Alert variant="destructive">
                <AlertDescription>You declined this slot.</AlertDescription>
              </Alert>
            )}
            {completed && (
              <Alert>
                <AlertDescription>Marked complete. Thanks for your time!</AlertDescription>
              </Alert>
            )}
            {noShow && (
              <Alert variant="destructive">
                <AlertDescription>Marked no-show. Reach out to the recruiter if this was a mistake.</AlertDescription>
              </Alert>
            )}

            {/* Action gate */}
            {isPending && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm">Can you make this slot?</p>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional note for the recruiter (e.g. timezone confirmation, accessibility need)"
                />
                <div className="flex gap-2">
                  <Button onClick={() => handleRespond("accept")} disabled={responding} className="gap-1 bg-green-600 hover:bg-green-700">
                    {responding ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Accept
                  </Button>
                  <Button onClick={() => handleRespond("decline")} disabled={responding} variant="outline" className="gap-1">
                    <XCircle className="h-4 w-4" />
                    Can't make it
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">{children}</CardContent>
      </Card>
    </div>
  );
}

/** Render the candidate-facing slot string. Pulled out so the test suite
 *  pins the format ("Mon, Mar 5 · 1:00 PM – 1:08 PM"). */
export function formatSlot(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const day = start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const t = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${t(start)} – ${t(end)}`;
}
