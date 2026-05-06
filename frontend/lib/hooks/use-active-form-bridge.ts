// React hook wrapper around `active-form-bridge`. A page calls this once
// to publish its React-Hook-Form handle to the global registry; the
// registration is torn down automatically on unmount or when the
// formId changes.

import { useEffect } from "react";
import {
  registerForm,
  unregisterForm,
  type ActiveFormHandle,
} from "@/lib/tools/active-form-bridge";

export function useActiveFormBridge<TValues>(
  handle: ActiveFormHandle<TValues>,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    registerForm(handle);
    return () => {
      unregisterForm(handle.formId);
    };
  }, [handle, enabled]);
}
