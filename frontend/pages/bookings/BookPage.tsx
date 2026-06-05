/**
 * /book/[handle] — public booking page (no auth required).
 *
 * - Loads the host's public profile + offerings.
 * - On offering pick, fetches the 14-day slot grid (cached on the backend
 *   per host version-token).
 * - On slot click, opens the booker info panel; submit creates a reservation
 *   and redirects to the magic-link reservation page.
 *
 * Reference: docs/prd/bookings-and-reservations.md, gap #1648.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  createPublicReservation,
  fetchPublicAvailability,
  fetchPublicHost,
} from "@/lib/services/bookings-service";
import type { BookingOfferingDTO, PublicHostProfileDTO, PublicSlotDTO } from "@shared/bookings";

const FOURTEEN_DAYS_MS = 14 * 86_400_000;

export default function BookPage() {
  const { handle } = useParams<{ handle: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  useSEO(location.pathname);
  useBreadcrumbs([{ name: "Book", url: location.pathname }]);

  const [host, setHost] = useState<PublicHostProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOffering, setSelectedOffering] = useState<BookingOfferingDTO | null>(null);
  const [slots, setSlots] = useState<PublicSlotDTO[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<PublicSlotDTO | null>(null);
  const [bookerName, setBookerName] = useState("");
  const [bookerEmail, setBookerEmail] = useState("");
  const [bookerPhone, setBookerPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!handle) return;
    let cancelled = false;
    setLoading(true);
    fetchPublicHost(handle)
      .then((h) => {
        if (cancelled) return;
        setHost(h);
        setSelectedOffering(h.offerings.find((o) => o.isActive) ?? null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message ?? "Host not found");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [handle]);

  useEffect(() => {
    if (!handle || !selectedOffering) {
      setSlots(null);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    const fromUtc = new Date().toISOString();
    const toUtc = new Date(Date.now() + FOURTEEN_DAYS_MS).toISOString();
    fetchPublicAvailability({
      handle,
      offeringSlug: selectedOffering.slug,
      fromUtc,
      toUtc,
    })
      .then((r) => !cancelled && setSlots(r.slots))
      .catch((e) => !cancelled && toast({ title: "Could not load slots", description: e?.message }))
      .finally(() => !cancelled && setSlotsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [handle, selectedOffering, toast]);

  const slotsByDay = useMemo(() => {
    const groups = new Map<string, PublicSlotDTO[]>();
    for (const s of slots ?? []) {
      const dayKey = new Date(s.slotStartUtc).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      const list = groups.get(dayKey) ?? [];
      list.push(s);
      groups.set(dayKey, list);
    }
    return Array.from(groups.entries());
  }, [slots]);

  async function handleConfirm() {
    if (!handle || !selectedOffering || !bookingSlot) return;
    if (!bookerName.trim() || !bookerEmail.trim()) {
      toast({ title: "Name + email required" });
      return;
    }
    setSubmitting(true);
    try {
      const out = await createPublicReservation({
        hostHandle: handle,
        offeringSlug: selectedOffering.slug,
        slotStartUtc: bookingSlot.slotStartUtc,
        bookerEmail: bookerEmail.trim(),
        bookerName: bookerName.trim(),
        bookerPhone: bookerPhone.trim() || null,
      });
      navigate(`/book/${encodeURIComponent(handle)}/r/${out.magicLinkToken}`);
    } catch (e: any) {
      toast({
        title: "Could not book",
        description: e?.message ?? "Slot may have been taken",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="container py-12 text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }
  if (error || !host) {
    return (
      <AppShell>
        <div className="container py-12">
          <h1 className="text-2xl font-semibold">Not found</h1>
          <p className="text-muted-foreground mt-2">{error ?? "This booking page does not exist."}</p>
        </div>
      </AppShell>
    );
  }
  if (!host.offerings.some((o) => o.isActive)) {
    return (
      <AppShell>
        <div className="container py-12">
          <h1 className="text-2xl font-semibold">{host.displayName}</h1>
          <p className="text-muted-foreground mt-2">No bookable sessions are currently offered.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="container py-8 grid gap-8 md:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              {host.avatarUrl ? (
                <img
                  src={host.avatarUrl}
                  alt=""
                  className="h-14 w-14 rounded-full object-cover"
                />
              ) : (
                <div className="h-14 w-14 rounded-full bg-muted" />
              )}
              <div>
                <CardTitle>{host.displayName}</CardTitle>
                <p className="text-xs text-muted-foreground">Timezone: {host.timezone}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {host.bio && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{host.bio}</p>
            )}
            <div className="mt-6 space-y-2">
              <p className="text-sm font-medium">Sessions</p>
              {host.offerings
                .filter((o) => o.isActive)
                .map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      setSelectedOffering(o);
                      setBookingSlot(null);
                    }}
                    className={`w-full rounded-md border p-3 text-left text-sm ${
                      selectedOffering?.id === o.id ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex justify-between font-medium">
                      <span>{o.name}</span>
                      <span>
                        {o.priceCents === 0 ? "Free" : `${(o.priceCents / 100).toFixed(2)} ${o.currency}`}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {o.durationMinutes} min
                    </div>
                  </button>
                ))}
            </div>
          </CardContent>
        </Card>

        <div>
          {bookingSlot ? (
            <Card>
              <CardHeader>
                <CardTitle>Confirm your booking</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm">
                  {selectedOffering?.name} ·{" "}
                  {new Date(bookingSlot.slotStartUtc).toLocaleString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
                <div className="grid gap-3 max-w-md">
                  <div>
                    <Label htmlFor="booker-name">Your name</Label>
                    <Input id="booker-name" value={bookerName} onChange={(e) => setBookerName(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="booker-email">Email</Label>
                    <Input
                      id="booker-email"
                      type="email"
                      value={bookerEmail}
                      onChange={(e) => setBookerEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="booker-phone">Phone (optional)</Label>
                    <Input id="booker-phone" value={bookerPhone} onChange={(e) => setBookerPhone(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleConfirm} disabled={submitting}>
                    {submitting
                      ? "Booking…"
                      : selectedOffering && selectedOffering.priceCents > 0
                        ? `Pay & book (${(selectedOffering.priceCents / 100).toFixed(2)} ${selectedOffering.currency})`
                        : "Confirm booking"}
                  </Button>
                  <Button variant="outline" onClick={() => setBookingSlot(null)}>
                    Back to slots
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>
                  Pick a time {selectedOffering ? `for ${selectedOffering.name}` : ""}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {slotsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading availability…</p>
                ) : slotsByDay.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No availability in the next 14 days.</p>
                ) : (
                  <div className="space-y-6">
                    {slotsByDay.map(([day, daySlots]) => (
                      <div key={day}>
                        <h3 className="text-sm font-medium mb-2">{day}</h3>
                        <div className="flex flex-wrap gap-2">
                          {daySlots.map((s) => (
                            <button
                              key={s.slotStartUtc}
                              type="button"
                              onClick={() => setBookingSlot(s)}
                              className="rounded-md border px-3 py-1.5 text-sm hover:border-primary"
                            >
                              {new Date(s.slotStartUtc).toLocaleTimeString(undefined, {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
