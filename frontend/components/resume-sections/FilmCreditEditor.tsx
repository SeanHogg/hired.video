/**
 * #820 — Optional film-credit field group on Project entries. Self-
 * gates: returns null when the parent ProjectsSection doesn't pass
 * `enabled=true` (which today is wired by the ACTOR_HEADSHOT_HERO +
 * DIRECTOR_FILMOGRAPHY_SERIF templates). No prop-drilled showFilm
 * boolean leaks beyond that.
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FilmCredit } from "@shared/resume";

interface FilmCreditEditorProps {
  enabled: boolean;
  value: FilmCredit | undefined;
  onChange: (next: FilmCredit | undefined) => void;
}

export default function FilmCreditEditor({ enabled, value, onChange }: FilmCreditEditorProps) {
  if (!enabled) return null;
  const v = value ?? {
    roleName: "",
    director: "",
    network: "",
    year: "",
  } as FilmCredit;
  const set = (next: Partial<FilmCredit>) => onChange({ ...v, ...next });

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-3">
      <div className="text-xs font-medium uppercase text-muted-foreground">Film credit</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Role / character</Label>
          <Input value={v.roleName ?? ""} onChange={(e) => set({ roleName: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Role type</Label>
          <Select
            value={v.roleType ?? ""}
            onValueChange={(roleType) => set({ roleType: (roleType || undefined) as FilmCredit["roleType"] })}
          >
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {["lead", "supporting", "background", "ensemble", "cameo"].map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Production</Label>
          <Select
            value={v.production ?? ""}
            onValueChange={(production) => set({ production: (production || undefined) as FilmCredit["production"] })}
          >
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {["film", "tv", "theatre", "commercial", "voice", "short", "web"].map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Year</Label>
          <Input value={v.year ?? ""} onChange={(e) => set({ year: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Director</Label>
          <Input value={v.director ?? ""} onChange={(e) => set({ director: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Network / studio / theatre</Label>
          <Input value={v.network ?? ""} onChange={(e) => set({ network: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
