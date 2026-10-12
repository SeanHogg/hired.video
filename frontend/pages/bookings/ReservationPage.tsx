/**
 * /book/[handle]/r/[token] — booker reservation page (magic-link).
 *
 * Auth = token in the URL. Booker can view, comment, reschedule, cancel.
 * Reference: gap #1648.
 */

import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";

import { AppShell } from "@/components/AppShell";
import { useSEO } from "@/lib/seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  addCommentByToken,
  cancelByToken,
  fetchReservationByToken,
  listCommentsByToken,
  rescheduleByToken,
} from "@/lib/services/bookings-service";
import type { BookingCommentDTO, ReservationDetailDTO } from "@shared/bookings";

export default function ReservationPage() {
  const { token } = useParams<{ token: string }>();
  const location = useLocation();
  const { toast } = useToast();
  useSEO(location.pathname);

  const [reservation, setReservation] = useState<ReservationDetailDTO | null>(null);
  const [comments, setComments] = useState<BookingCommentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [newSlot, setNewSlot] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchReservationByToken(token), listCommentsByToken(token)])
      .then(([r, c]) => {
        if (cancelled) return;
        setReservation(r);
        setComments(c);
      })
      .catch((e) => !cancelled && setError(e?.message ?? "Could not load reservation"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submitComment() {
    if (!token || !body.trim()) return;
    setSubmitting(true);
    try {
      const c = await addCommentByToken(token, body.trim());
      setComments((prev) => [...prev, c]);
      setBody("");
    } catch (e: any) {
      toast({ title: "Could not post comment", description: e?.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReschedule() {
    if (!token || !newSlot.trim() || !reservation) return;
    try {
      const r = await rescheduleByToken(token, { slotStartUtc: new Date(newSlot).toISOString() });
      setReservation(r);
      setNewSlot("");
      toast({ title: "Rescheduled" });
    } catch (e: any) {
      toast({ title: "Could not reschedule", description: e?.message });
    }
  }

  async function submitCancel() {
    if (!token) return;
    if (!confirm("Cancel this reservation?")) return;
    try {
      const r = await cancelByToken(token, { reason: null });
      setReservation(r);
      toast({ title: "Reservation cancelled" });
    } catch (e: any) {
      toast({ title: "Could not cancel", description: e?.message });
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="container py-12 text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }
  if (error || !reservation) {
    return (
      <AppShell>
        <div className="container py-12">
          <h1 className="text-2xl font-semibold">Not found</h1>
          <p className="text-muted-foreground mt-2">{error ?? "This reservation no longer exists."}</p>
        </div>
      </AppShell>
    );
  }

  const editable = reservation.status === "pending_payment" || reservation.status === "confirmed";

  return (
    <AppShell>
      <div className="container py-8 max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              {reservation.offeringName} with {reservation.hostDisplayName}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <strong>When:</strong>{" "}
              {new Date(reservation.slotStartUtc).toLocaleString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              ({reservation.durationMinutes} min)
            </p>
            <p>
              <strong>Status:</strong> {reservation.status}
            </p>
            {reservation.amountCents > 0 && (
              <p>
                <strong>Amount:</strong> {(reservation.amountCents / 100).toFixed(2)}{" "}
                {reservation.currency}
              </p>
            )}
            {reservation.videoConferenceLink && reservation.status === "confirmed" && (
              <p>
                <strong>Meeting link:</strong>{" "}
                <a
                  className="underline"
                  href={reservation.videoConferenceLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  Join
                </a>
              </p>
            )}
          </CardContent>
        </Card>

        {editable && (
          <Card>
            <CardHeader>
              <CardTitle>Reschedule or cancel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="new-slot">New time</Label>
                <Input
                  id="new-slot"
                  type="datetime-local"
                  value={newSlot}
                  onChange={(e) => setNewSlot(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={submitReschedule} disabled={!newSlot}>
                  Request reschedule
                </Button>
                <Button variant="destructive" onClick={submitCancel}>
                  Cancel reservation
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notes yet.</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="rounded-md border p-3 text-sm">
                  <div className="text-xs text-muted-foreground mb-1">
                    {c.authorDisplayName} · {new Date(c.createdAt).toLocaleString()}
                  </div>
                  <div className="whitespace-pre-wrap">{c.bodyMd}</div>
                </div>
              ))
            )}
            <div>
              <Label htmlFor="new-comment">Add a note for the host</Label>
              <Textarea
                id="new-comment"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
              />
              <Button className="mt-2" onClick={submitComment} disabled={submitting}>
                {submitting ? "Posting…" : "Post"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
