/**
 * Form state for the SuperAdmin event editor: starts from an event (edit) or
 * a blank custom event (add), and validates with the shared input schema so
 * the editor and the API agree on every rule.
 */
import { useMemo, useState } from "react";
import {
  KIND_PRIORITY,
  ThemeEventInputSchema,
  type DateRule,
  type ThemeEvent,
  type ThemeEventInput,
} from "@shared/theme-calendar/event";

export const BLANK_EVENT: ThemeEventInput = {
  slug: "",
  kind: "custom",
  rule: { type: "fixed", month: 1, day: 1 },
  runupDays: 7,
  afterDays: 0,
  autoPick: "everyone",
  fits: [],
  regions: [],
  priority: KIND_PRIORITY.custom,
  themeId: "standard",
  tone: "warm",
  name: { en: "" },
  line: { en: "" },
  isActive: true,
};

export function inputOf(event: ThemeEvent): ThemeEventInput {
  const { id: _id, isBuiltin: _b, dates: _d, updatedAt: _u, ...input } = event;
  return input;
}

/** A sensible starting rule when the admin switches "When it happens". */
export function defaultRule(type: DateRule["type"]): DateRule {
  switch (type) {
    case "fixed":
      return { type, month: 1, day: 1 };
    case "nthWeekday":
      return { type, month: 1, weekday: 1, nth: 1 };
    case "computed":
      return { type, point: "easter" };
    case "table":
      return { type };
    case "person":
      return { type, moment: "birthday" };
  }
}

export function useThemeEventForm(event: ThemeEvent | null) {
  const [draft, setDraft] = useState<ThemeEventInput>(() => (event ? inputOf(event) : BLANK_EVENT));
  const patch = (p: Partial<ThemeEventInput>) => setDraft((d) => ({ ...d, ...p }));
  /** Respectful themes carry no opening line; an empty line is "none". */
  const normalized = useMemo<ThemeEventInput>(
    () => ({ ...draft, line: draft.tone === "respectful" || !draft.line?.en.trim() ? null : draft.line }),
    [draft],
  );
  const check = ThemeEventInputSchema.safeParse(normalized);
  return {
    draft,
    patch,
    valid: check.success,
    /** The first invalid field (the editor shows its translated hint). */
    invalidField: check.success ? null : String(check.error.issues[0]?.path[0] ?? "form"),
    value: normalized,
  };
}
