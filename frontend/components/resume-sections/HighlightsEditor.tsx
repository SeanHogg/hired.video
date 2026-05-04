import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface HighlightsEditorProps {
  highlights: string[] | null | undefined;
  onChange: (next: string[]) => void;
  label: string;
  addButtonText: string;
  placeholder: string;
}

export default function HighlightsEditor({
  highlights,
  onChange,
  label,
  addButtonText,
  placeholder,
}: HighlightsEditorProps) {
  const list = highlights ?? [];

  const add = () => onChange([...list, ""]);
  const update = (i: number, value: string) => {
    const next = [...list];
    next[i] = value;
    onChange(next);
  };
  const remove = (i: number) => onChange(list.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          {addButtonText}
        </Button>
      </div>
      <div className="space-y-2">
        {list.map((highlight, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={highlight}
              onChange={(e) => update(i, e.target.value)}
              placeholder={placeholder}
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
