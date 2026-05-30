/**
 * Shared picker controls for the visual block editor (gap #1007).
 *
 * KeyPicker — names map to keyboard event `e.key` values per the
 * existing flat-rule editor's convention. Reuses the same options
 * dictionary so adding a key in one surface lights up the other.
 */

const COMMON_KEYS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "ArrowUp", label: "↑ Up" },
  { value: "ArrowDown", label: "↓ Down" },
  { value: "ArrowLeft", label: "← Left" },
  { value: "ArrowRight", label: "→ Right" },
  { value: " ", label: "Space" },
  { value: "Enter", label: "Enter" },
  { value: "Escape", label: "Esc" },
  { value: "a", label: "A" },
  { value: "b", label: "B" },
  { value: "c", label: "C" },
  { value: "d", label: "D" },
  { value: "e", label: "E" },
  { value: "f", label: "F" },
  { value: "g", label: "G" },
  { value: "h", label: "H" },
  { value: "i", label: "I" },
  { value: "j", label: "J" },
  { value: "k", label: "K" },
  { value: "l", label: "L" },
  { value: "m", label: "M" },
  { value: "n", label: "N" },
  { value: "o", label: "O" },
  { value: "p", label: "P" },
  { value: "q", label: "Q" },
  { value: "r", label: "R" },
  { value: "s", label: "S" },
  { value: "t", label: "T" },
  { value: "u", label: "U" },
  { value: "v", label: "V" },
  { value: "w", label: "W" },
  { value: "x", label: "X" },
  { value: "y", label: "Y" },
  { value: "z", label: "Z" },
];

export function KeyPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <select
      aria-label="key"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded bg-white text-slate-900 px-1 py-0.5 text-xs border border-black/20"
    >
      {COMMON_KEYS.map((k) => (
        <option key={k.value} value={k.value}>
          {k.label}
        </option>
      ))}
    </select>
  );
}
