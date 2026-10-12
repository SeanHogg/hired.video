// Fires `suggest` the first time `due` is true, and never again for this
// mount — so opening Career 360 with nothing saved starts it once, while
// saved suggestions (or a chosen target) are only ever re-run by hand.
import { useEffect, useRef } from "react";

export function useSuggestOnce(due: boolean, suggest: () => void): void {
  const fired = useRef(false);
  const latest = useRef(suggest);
  latest.current = suggest;
  useEffect(() => {
    if (!due || fired.current) return;
    fired.current = true;
    latest.current();
  }, [due]);
}
