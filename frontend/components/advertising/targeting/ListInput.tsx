/**
 * Comma-separated list input shared by the targeting sections. Keeps the
 * raw text locally so a trailing comma survives while typing, and reports
 * the parsed list (trimmed, empties dropped) on every change.
 */

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

export function parseList(text: string, opts: { upper?: boolean } = {}): string[] {
  return text
    .split(",")
    .map((s) => (opts.upper ? s.trim().toUpperCase() : s.trim()))
    .filter(Boolean);
}

interface Props {
  id: string;
  value: readonly string[] | undefined;
  onChange: (next: string[]) => void;
  placeholder?: string;
  upper?: boolean;
}

export default function ListInput({ id, value, onChange, placeholder, upper }: Props) {
  const external = (value ?? []).join(", ");
  const [draft, setDraft] = useState(external);

  // Adopt outside changes (reset, load) without clobbering in-progress text.
  useEffect(() => {
    setDraft((current) => (parseList(current, { upper }).join(", ") === external ? current : external));
  }, [external, upper]);

  return (
    <Input
      id={id}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(parseList(e.target.value, { upper }));
      }}
    />
  );
}
