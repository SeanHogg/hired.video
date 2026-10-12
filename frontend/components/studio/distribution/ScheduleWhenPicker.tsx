/**
 * ScheduleWhenPicker — "Now" or "Schedule" for a post, with the date and
 * time when scheduling (#2047). Shared by the Distribution Hub's composer
 * and the Post dock. The time is checked against the window the server
 * enforces (not in the past, at most 90 days ahead) and the problem is said
 * inline.
 *
 * Self-gating: scheduling needs an account, so for a signed-out visitor or
 * a guest session it renders nothing and the host posts now.
 */
import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import SegmentToggle from "@/components/studio/v2/focus/SegmentToggle";
import { scheduleInputBounds, whenProblem, type ScheduleWhen } from "@/lib/studio/distribution/schedule-when";

export interface ScheduleWhenPickerProps {
  value: ScheduleWhen;
  onChange: (next: ScheduleWhen) => void;
  disabled?: boolean;
  /** Label of the "now" option ("Post now" in the dock, "Send now" in the Hub). */
  nowLabel?: string;
}

const PROBLEM_KEY = {
  INVALID: "distribution.when.pickTime",
  IN_PAST: "distribution.when.inPast",
  TOO_FAR_AHEAD: "distribution.when.tooFar",
} as const;

export default function ScheduleWhenPicker({ value, onChange, disabled, nowLabel }: ScheduleWhenPickerProps) {
  const { t } = useTranslation();
  const { user, isGuest } = useAuth();
  const inputId = useId();
  const errorId = useId();
  // Bounds are taken once per mode switch — "now" moving a minute doesn't matter here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bounds = useMemo(() => scheduleInputBounds(new Date()), [value.mode]);
  if (!user || isGuest) return null;

  const problem = whenProblem(value, new Date());
  return (
    <div className="flex flex-col gap-2">
      <SegmentToggle<"now" | "later">
        ariaLabel={t("distribution.when.label")}
        value={value.mode}
        onChange={(mode) => onChange(mode === "now" ? { mode: "now" } : { mode: "later", local: value.mode === "later" ? value.local : "" })}
        options={[
          { id: "now", label: nowLabel ?? t("distribution.when.now") },
          { id: "later", label: t("distribution.when.later") },
        ]}
      />
      {value.mode === "later" && (
        <div className="flex flex-col gap-1">
          <label htmlFor={inputId} className="text-[13px] text-muted-foreground">
            {t("distribution.when.at")}
          </label>
          <input
            id={inputId}
            type="datetime-local"
            min={bounds.min}
            max={bounds.max}
            value={value.local}
            disabled={disabled}
            aria-invalid={problem !== null && value.local !== ""}
            aria-describedby={problem && value.local ? errorId : undefined}
            onChange={(e) => onChange({ mode: "later", local: e.target.value })}
            className="min-h-11 w-full min-w-0 rounded-[10px] border border-border bg-card px-3 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-60"
          />
          {problem && value.local && (
            <p id={errorId} role="alert" className="text-[13px] text-destructive">
              {t(PROBLEM_KEY[problem])}
            </p>
          )}
          <p className="text-[13px] text-muted-foreground">{t("distribution.when.timezoneNote")}</p>
        </div>
      )}
    </div>
  );
}
