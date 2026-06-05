/**
 * /events/new — host an event.
 *
 * Single-page form (not a multi-step wizard) because the v1 field set
 * is small enough to fit comfortably above the fold for desktop.
 * Wizard-fication is tracked as a follow-on if the field count grows
 * (recurring series, ticketing, custom registration questions are all
 * deferred per gap #1246/1247).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { eventsService, type EventCategory } from "@/lib/services/events-service";
import { useAuth } from "@/lib/auth";
import type {
  CreateEventInput,
  EventFormat,
  EventVisibility,
  VideoProvider,
} from "@shared/events";

export default function EventNew() {
  const { t } = useTranslation();
  useSEO("/events/new");
  useBreadcrumbs([
    { name: t("headings.eventNew.eventsBreadcrumb"), url: "/tasks?surface=discover" },
    { name: t("headings.eventNew.hostEvent"), url: "/events/new" },
  ]);

  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [eventFormat, setEventFormat] = useState<EventFormat>("in_person");
  const [visibility, setVisibility] = useState<EventVisibility>("public");
  const [category, setCategory] = useState<string>("");
  const [location, setLocation] = useState("");
  const [videoProvider, setVideoProvider] = useState<VideoProvider | "">("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [capacity, setCapacity] = useState<string>("");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [allowsPlusOnes, setAllowsPlusOnes] = useState(false);
  const [matchmakingEnabled, setMatchmakingEnabled] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login?next=/events/new");
      return;
    }
    eventsService.listCategories().then(setCategories).catch(() => {});
  }, [isAuthenticated, navigate]);

  async function submit(publish: boolean) {
    setError(null);
    if (!title.trim() || !startAt || !endAt) {
      setError(t("errors.eventNew.requiredFields"));
      return;
    }
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      setError(t("errors.eventNew.endAfterStart"));
      return;
    }

    const input: CreateEventInput = {
      title: title.trim(),
      description: description.trim() || undefined,
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      type: "event",
      visibility,
      eventFormat,
      category: category || undefined,
      location: location.trim() || undefined,
      videoProvider: videoProvider || undefined,
      meetingUrl: meetingUrl.trim() || undefined,
      capacity: capacity ? Number(capacity) : undefined,
      allowsPlusOnes,
      requiresApproval,
      matchmakingEnabled,
      coHostUserIds: [],
      publish,
    };

    setBusy(true);
    try {
      const created = await eventsService.create(input);
      navigate(`/events/${created.slug ?? created.id}`);
    } catch (err: any) {
      setError(err?.message ?? t("errors.eventNew.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell bgClassName="bg-background">
      <main className="px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold tracking-tight mb-2">{t("headings.eventNew.hostEvent")}</h1>
        <p className="text-muted-foreground mb-6">
          {t("messages.eventNew.subtitle")}
        </p>

        {error && (
          <div className="mb-4 p-3 rounded border border-red-200 bg-red-50 text-red-800 text-sm">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t("headings.eventNew.basics")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">{t("fields.eventTitle.label")}</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("fields.eventTitle.placeholder")}
                maxLength={500}
              />
            </div>
            <div>
              <Label htmlFor="description">{t("fields.description.label")}</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder={t("fields.eventDescription.placeholder")}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start">{t("fields.eventStart.label")}</Label>
                <Input
                  id="start"
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="end">{t("fields.eventEnd.label")}</Label>
                <Input
                  id="end"
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>{t("fields.serviceCategory.label")}</Label>
                <Select value={category || "none"} onValueChange={(v) => setCategory(v === "none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("fields.eventCategory.placeholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("labels.eventNew.uncategorized")}</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.slug}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("fields.visibility.label")}</Label>
                <Select value={visibility} onValueChange={(v) => setVisibility(v as EventVisibility)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">{t("labels.eventNew.visibilityPublic")}</SelectItem>
                    <SelectItem value="unlisted">{t("labels.eventNew.visibilityUnlisted")}</SelectItem>
                    <SelectItem value="private">{t("labels.eventNew.visibilityPrivate")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t("headings.eventNew.formatLocation")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>{t("fields.eventFormat.label")}</Label>
              <Select value={eventFormat} onValueChange={(v) => setEventFormat(v as EventFormat)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_person">{t("labels.eventNew.formatInPerson")}</SelectItem>
                  <SelectItem value="remote">{t("labels.remote")}</SelectItem>
                  <SelectItem value="hybrid">{t("labels.workSetting.hybrid")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(eventFormat === "in_person" || eventFormat === "hybrid") && (
              <div>
                <Label htmlFor="location">{t("fields.location.label")}</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={t("fields.eventLocation.placeholder")}
                />
              </div>
            )}
            {(eventFormat === "remote" || eventFormat === "hybrid") && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>{t("fields.eventVideoProvider.label")}</Label>
                  <Select
                    value={videoProvider || "none"}
                    onValueChange={(v) => setVideoProvider(v === "none" ? "" : (v as VideoProvider))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("fields.eventCategory.placeholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("labels.none")}</SelectItem>
                      <SelectItem value="zoom">Zoom</SelectItem>
                      <SelectItem value="meet">Google Meet</SelectItem>
                      <SelectItem value="teams">Microsoft Teams</SelectItem>
                      <SelectItem value="other">{t("labels.eventNew.videoProviderOther")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="meetingUrl">{t("fields.eventMeetingUrl.label")}</Label>
                  <Input
                    id="meetingUrl"
                    type="url"
                    value={meetingUrl}
                    onChange={(e) => setMeetingUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t("headings.eventNew.rsvps")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="capacity">{t("fields.eventCapacity.label")}</Label>
              <Input
                id="capacity"
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder={t("fields.eventCapacity.placeholder")}
              />
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="approval"
                checked={requiresApproval}
                onCheckedChange={(v) => setRequiresApproval(Boolean(v))}
              />
              <div>
                <Label htmlFor="approval">{t("fields.eventApproval.label")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("messages.eventNew.approvalHint")}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="plusone"
                checked={allowsPlusOnes}
                onCheckedChange={(v) => setAllowsPlusOnes(Boolean(v))}
              />
              <div>
                <Label htmlFor="plusone">{t("fields.eventPlusOnes.label")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("messages.eventNew.plusOnesHint")}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="match"
                checked={matchmakingEnabled}
                onCheckedChange={(v) => setMatchmakingEnabled(Boolean(v))}
              />
              <div>
                <Label htmlFor="match">{t("fields.eventMatchmaking.label")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("messages.eventNew.matchmakingHint")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => submit(false)} disabled={busy}>
            {t("actions.saveDraft")}
          </Button>
          <Button onClick={() => submit(true)} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t("actions.eventNew.publishEvent")}
          </Button>
        </div>
      </main>
    </AppShell>
  );
}
