// CompetencyPicker — shared dropdown for binding a scorecard attribute to
// a reusable competency (#1382). Self-loads the company's library so
// consumers only need to thread `companyId` + value/onChange.
//
// Empty value ("") encodes "free-form attribute, no competency link" —
// the API treats it as null. Picker is hidden entirely when the company
// has no competencies yet so the template editor doesn't show an empty
// dropdown.

import { useEffect, useState } from "react";
import { Library } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  scorecardsService,
  type Competency,
} from "@/lib/services/scorecards-service";

interface Props {
  companyId: string;
  value: string | null | undefined;
  onChange: (competencyId: string | null) => void;
  disabled?: boolean;
  /** Render the label inline rather than stacked. */
  compact?: boolean;
}

const NONE = "__none__";

export function CompetencyPicker({
  companyId,
  value,
  onChange,
  disabled,
  compact,
}: Props) {
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await scorecardsService.listCompetencies(companyId);
      if (!cancelled) {
        setCompetencies(list);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  // Self-gate visibility: if the library is empty, the picker is noise.
  if (!loaded || competencies.length === 0) return null;

  return (
    <div className={compact ? "flex items-center gap-2" : ""}>
      <Label className={compact ? "text-xs whitespace-nowrap" : "text-xs"}>
        <Library className="mr-1 inline h-3 w-3" /> Competency
      </Label>
      <Select
        value={value ?? NONE}
        onValueChange={(v) => onChange(v === NONE ? null : v)}
        disabled={disabled}
      >
        <SelectTrigger className={compact ? "h-8 w-44" : ""}>
          <SelectValue placeholder="Free-form (no competency)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Free-form (no competency)</SelectItem>
          {competencies.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
