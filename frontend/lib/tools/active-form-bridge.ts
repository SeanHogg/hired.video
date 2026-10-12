// Module-level registry that lets AI-coach tools read/write a page's
// React-Hook-Form state without that page having to wire RHF into
// the chat panel itself.
//
// Pages call `registerForm(formId, handle)` on mount and unregister on
// unmount via `useActiveFormBridge`. Tools (e.g. `populate_job_field`)
// look the form up by id, validate the requested field is in the
// `writableFields` whitelist, then call `handle.setValue`.
//
// Why a whitelist: the LLM picks the field name. Without one, a stray
// call could clobber internal state like `status` or `expirationDate`
// that the page doesn't intend to expose to the AI.

export interface ActiveFormHandle<TValues = Record<string, unknown>> {
  /** Stable identifier — must match the formId used by tools. */
  formId: string;
  /** Current snapshot of all form values. Used to expose live form
   *  state to the LLM via the system prompt. */
  getValues: () => TValues;
  /** Write a single field. Tools route every mutation through this so
   *  the page's RHF state and validation stay in sync. */
  setValue: (field: string, value: unknown) => void;
  /** Field names the AI is allowed to write. Anything else throws. */
  writableFields: ReadonlyArray<string>;
  /** Optional human-readable labels per field, surfaced in tool
   *  preview text ("Job title" reads better than "title"). */
  fieldLabels?: Readonly<Record<string, string>>;
}

const registry = new Map<string, ActiveFormHandle<unknown>>();

export function registerForm<TValues>(handle: ActiveFormHandle<TValues>): void {
  registry.set(handle.formId, handle as ActiveFormHandle<unknown>);
}

export function unregisterForm(formId: string): void {
  registry.delete(formId);
}

export function getActiveForm<TValues = Record<string, unknown>>(
  formId: string,
): ActiveFormHandle<TValues> | undefined {
  return registry.get(formId) as ActiveFormHandle<TValues> | undefined;
}

/** Throws a user-facing Error if the form isn't mounted or the field
 *  isn't writable. Tool runners call this so the LLM's tool call fails
 *  loudly instead of silently no-op-ing. */
export function requireActiveForm<TValues = Record<string, unknown>>(
  formId: string,
): ActiveFormHandle<TValues> {
  const handle = getActiveForm<TValues>(formId);
  if (!handle) {
    throw new Error(
      `No active form for "${formId}" — open the page that owns this form before calling this tool.`,
    );
  }
  return handle;
}

export function assertWritableField(
  handle: ActiveFormHandle<unknown>,
  field: string,
): void {
  if (!handle.writableFields.includes(field)) {
    throw new Error(
      `Field "${field}" is not writable on form "${handle.formId}". Allowed: ${handle.writableFields.join(", ")}.`,
    );
  }
}

export function fieldLabel(handle: ActiveFormHandle<unknown>, field: string): string {
  return handle.fieldLabels?.[field] ?? field;
}
