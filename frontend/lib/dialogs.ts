import * as React from "react";

/**
 * Imperative dialog system — the app-wide replacement for the browser's
 * built-in `window.alert` / `window.confirm` / `window.prompt`, which are
 * unstyled, blocking, and impossible to brand.
 *
 * Mirrors the module-level store pattern used by `use-toast.ts`: a single
 * `<DialogHost />` (mounted once in `App.tsx`) subscribes to the store and
 * renders the active request, while the imperative `confirmDialog`,
 * `alertDialog`, and `promptDialog` functions can be called from anywhere —
 * React components AND plain lib functions (e.g. card-share-action.ts,
 * resume-exporters.ts) — because they don't need hook context.
 *
 * Each call returns a promise that resolves when the user responds:
 *   - confirmDialog → boolean (true = confirmed)
 *   - promptDialog  → string | null (null = cancelled)
 *   - alertDialog   → void (resolves when acknowledged)
 */

export interface ConfirmDialogOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** Render the confirm button as a destructive action (red). */
  destructive?: boolean;
}

export interface AlertDialogOptions {
  title: string;
  description?: string;
  confirmText?: string;
}

export interface PromptDialogOptions {
  title: string;
  description?: string;
  /** Label shown above the input. */
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  /** Render a multi-line textarea instead of a single-line input. */
  multiline?: boolean;
  /** Disable the confirm button until the trimmed value is non-empty. */
  required?: boolean;
}

type ConfirmRequest = ConfirmDialogOptions & {
  id: string;
  kind: "confirm";
  resolve: (value: boolean) => void;
};

type AlertRequest = AlertDialogOptions & {
  id: string;
  kind: "alert";
  resolve: () => void;
};

type PromptRequest = PromptDialogOptions & {
  id: string;
  kind: "prompt";
  resolve: (value: string | null) => void;
};

export type DialogRequest = ConfirmRequest | AlertRequest | PromptRequest;

interface State {
  dialogs: DialogRequest[];
}

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return `dialog-${count}`;
}

const listeners: Array<(state: State) => void> = [];
let memoryState: State = { dialogs: [] };

function setState(next: State) {
  memoryState = next;
  listeners.forEach((listener) => listener(memoryState));
}

function enqueue(request: DialogRequest) {
  setState({ dialogs: [...memoryState.dialogs, request] });
}

/**
 * Resolve and dequeue a dialog. Called by `<DialogHost />` when the user
 * responds. Safe to call with a stale id (no-op).
 */
export function resolveDialog(id: string, value: boolean | string | null) {
  const request = memoryState.dialogs.find((d) => d.id === id);
  if (!request) return;
  setState({ dialogs: memoryState.dialogs.filter((d) => d.id !== id) });
  switch (request.kind) {
    case "confirm":
      request.resolve(value === true);
      break;
    case "prompt":
      request.resolve(typeof value === "string" ? value : null);
      break;
    case "alert":
      request.resolve();
      break;
  }
}

export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    enqueue({ ...options, id: genId(), kind: "confirm", resolve });
  });
}

export function alertDialog(options: AlertDialogOptions): Promise<void> {
  return new Promise((resolve) => {
    enqueue({ ...options, id: genId(), kind: "alert", resolve });
  });
}

export function promptDialog(
  options: PromptDialogOptions,
): Promise<string | null> {
  return new Promise((resolve) => {
    enqueue({ ...options, id: genId(), kind: "prompt", resolve });
  });
}

/** Subscribe a React component (the host) to the dialog queue. */
export function useDialogStore(): State {
  const [state, setState_] = React.useState<State>(memoryState);
  React.useEffect(() => {
    listeners.push(setState_);
    return () => {
      const index = listeners.indexOf(setState_);
      if (index > -1) listeners.splice(index, 1);
    };
  }, []);
  return state;
}
