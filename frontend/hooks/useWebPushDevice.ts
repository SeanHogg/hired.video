import { useCallback, useEffect, useState } from "react";
import {
  getPushDeviceState,
  subscribeThisDevice,
  unsubscribeThisDevice,
  type PushDeviceState,
} from "@/lib/push/web-push-client";

/** This browser's Web Push registration state + enable/disable actions.
 *  `state` is null while the first probe is in flight. */
export function useWebPushDevice() {
  const [state, setState] = useState<PushDeviceState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPushDeviceState()
      .then((next) => !cancelled && setState(next))
      .catch(() => !cancelled && setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  const run = useCallback(async (action: () => Promise<PushDeviceState>) => {
    setBusy(true);
    setFailed(false);
    try {
      setState(await action());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  const enable = useCallback(() => run(subscribeThisDevice), [run]);
  const disable = useCallback(() => run(unsubscribeThisDevice), [run]);

  return { state, busy, failed, enable, disable };
}
