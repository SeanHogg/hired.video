/**
 * Cadence, channels, quiet hours, email digest, and Start/Pause for the agent.
 */
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useDestinationLabel } from "@/components/studio/distribution/useDestinationLabel";
import {
  type PostingAgentCadence,
  type PostingAgentMode,
  type PostingAgentSettingsDto,
} from "@/lib/services/distribution-service";
import { isInQuietHours } from "@shared/posting-agent";

const CHANNELS = ["feed", "linkedin", "youtube", "tiktok"] as const;
const CADENCES: PostingAgentCadence[] = ["light", "steady", "daily"];

function minuteToTime(m: number): string {
  const clamped = ((Math.floor(m) % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const min = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function timeToMinute(value: string): number {
  const [h, m] = value.split(":").map((n) => Number(n));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return ((h * 60 + m) % 1440 + 1440) % 1440;
}

export function PostingAgentSettingsCard({
  form,
  busy,
  onChange,
  onSave,
  onStart,
  onPause,
  onToggleEnabled,
}: {
  form: PostingAgentSettingsDto;
  busy: boolean;
  onChange: (next: PostingAgentSettingsDto) => void;
  onSave: () => void;
  onStart: () => void;
  onPause: () => void;
  onToggleEnabled: (on: boolean) => void;
}) {
  const { t } = useTranslation();
  const destLabel = useDestinationLabel();
  const quietConflict = isInQuietHours(form.postMinute, form.quietStartMinute, form.quietEndMinute);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("studio.agent.settings")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("studio.agent.settingsHint")}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>{t("studio.agent.enabled")}</span>
          <Switch
            checked={form.enabled}
            disabled={busy || form.pausedReason === "admin"}
            onCheckedChange={onToggleEnabled}
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{t("studio.agent.channels")}</legend>
          {CHANNELS.map((id) => (
            <label key={id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.destinations.includes(id)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...new Set([...form.destinations, id])]
                    : form.destinations.filter((d) => d !== id);
                  onChange({ ...form, destinations: next.length ? next : [id] });
                }}
              />
              {destLabel(id)}
            </label>
          ))}
        </fieldset>

        <label className="flex flex-col gap-1 text-sm">
          {t("studio.agent.cadence")}
          <select
            className="h-10 rounded-md border border-input bg-background px-3"
            value={form.cadence}
            onChange={(e) => onChange({ ...form, cadence: e.target.value as PostingAgentCadence })}
          >
            {CADENCES.map((c) => (
              <option key={c} value={c}>
                {t(`studio.agent.cadence.${c}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {t("studio.agent.postTime")}
          <input
            type="time"
            className="h-10 rounded-md border border-input bg-background px-3"
            value={minuteToTime(form.postMinute)}
            onChange={(e) => onChange({ ...form, postMinute: timeToMinute(e.target.value) })}
          />
          {quietConflict ? (
            <span className="text-sm text-destructive">{t("studio.agent.quietHoursConflict")}</span>
          ) : null}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {t("studio.agent.quietStart")}
          <input
            type="time"
            className="h-10 rounded-md border border-input bg-background px-3"
            value={minuteToTime(form.quietStartMinute)}
            onChange={(e) => onChange({ ...form, quietStartMinute: timeToMinute(e.target.value) })}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {t("studio.agent.quietEnd")}
          <input
            type="time"
            className="h-10 rounded-md border border-input bg-background px-3"
            value={minuteToTime(form.quietEndMinute)}
            onChange={(e) => onChange({ ...form, quietEndMinute: timeToMinute(e.target.value) })}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {t("studio.agent.approval")}
          <select
            className="h-10 rounded-md border border-input bg-background px-3"
            value={form.mode}
            onChange={(e) => onChange({ ...form, mode: e.target.value as PostingAgentMode })}
          >
            <option value="approve">{t("studio.agent.mode.approve")}</option>
            <option value="auto">{t("studio.agent.mode.auto")}</option>
          </select>
        </label>

        <label className="flex items-center justify-between gap-3 text-sm">
          <span>{t("studio.agent.emailDigest")}</span>
          <Switch checked={form.emailDigest} onCheckedChange={(on) => onChange({ ...form, emailDigest: on })} />
        </label>

        {form.destinations.length === 0 ? (
          <p className="text-sm text-destructive">{t("studio.agent.needChannel")}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || form.destinations.length === 0 || quietConflict} onClick={onSave}>
            {t("studio.agent.save")}
          </Button>
          {form.enabled ? (
            <Button variant="outline" disabled={busy} onClick={onPause}>
              {t("studio.agent.pause")}
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={busy || form.pausedReason === "admin" || form.destinations.length === 0 || quietConflict}
              onClick={onStart}
            >
              {t("studio.agent.start")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
