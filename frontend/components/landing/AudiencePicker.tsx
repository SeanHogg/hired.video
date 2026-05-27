/**
 * AudiencePicker — multi-select audience tagger for content authoring
 * forms (article edit, resume publish, studio template publish, learning
 * path author). Renders both taxonomies (life_stage + profession) under
 * separate sub-headers so creators understand the axes.
 *
 * Read-write component — emits the full audience set on every change
 * (set semantics, not append). Per #1629 write-side residual.
 *
 * Per DRY rule: shared component reused everywhere a creator can tag
 * content. Single source of truth for the picker UX.
 */
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import {
  LIFE_STAGE_AUDIENCES,
  PROFESSION_AUDIENCES,
  taxonomyOf,
  type AudienceKey,
} from "@shared/audiences";
import { LIFE_STAGE_AUDIENCE_REGISTRY } from "@shared/audiences-registry";

export interface AudiencePickerProps {
  /** Currently-selected audience keys (any taxonomy). */
  value: AudienceKey[];
  onChange: (next: AudienceKey[]) => void;
  /** Restrict the picker to one taxonomy. Default = both. */
  taxonomy?: "life_stage" | "profession" | "both";
  /** Inline help copy under the section header. */
  description?: string;
}

const LIFE_STAGE_LABELS: Record<string, string> = Object.fromEntries(
  LIFE_STAGE_AUDIENCE_REGISTRY.map((a) => [a.key, a.label]),
);

const PROFESSION_LABELS: Record<string, string> = {
  athlete: "Athlete",
  actor: "Actor",
  director: "Director",
  musician: "Musician",
  creator: "Creator",
  founder: "Founder",
  developer: "Developer",
  designer: "Designer",
  data_analyst: "Data analyst",
  podcaster: "Podcaster",
  educator: "Educator",
  voice_actor: "Voice actor",
  game_dev: "Game developer",
  illustrator: "Illustrator",
  animator: "Animator",
  cad_user: "CAD user",
};

export function AudiencePicker({
  value,
  onChange,
  taxonomy = "both",
  description,
}: AudiencePickerProps): JSX.Element {
  const showLifeStage = taxonomy === "both" || taxonomy === "life_stage";
  const showProfession = taxonomy === "both" || taxonomy === "profession";

  const toggle = (key: AudienceKey) => {
    if (value.includes(key)) {
      onChange(value.filter((k) => k !== key));
    } else {
      onChange([...value, key]);
    }
  };

  return (
    <div className="space-y-6">
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      {showLifeStage && (
        <section>
          <h4 className="text-sm font-semibold mb-2">Tag by situation (optional)</h4>
          <div className="flex flex-wrap gap-2">
            {LIFE_STAGE_AUDIENCES.map((key) => {
              const selected = value.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggle(key)}
                  className="inline-flex"
                  aria-pressed={selected}
                >
                  <Badge variant={selected ? "default" : "outline"} className="px-3 py-1 cursor-pointer">
                    {selected ? <Check className="h-3 w-3 mr-1" /> : null}
                    {LIFE_STAGE_LABELS[key] ?? key}
                  </Badge>
                </button>
              );
            })}
          </div>
        </section>
      )}
      {showProfession && (
        <section>
          <h4 className="text-sm font-semibold mb-2">Tag by profession (optional)</h4>
          <div className="flex flex-wrap gap-2">
            {PROFESSION_AUDIENCES.map((key) => {
              const selected = value.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggle(key)}
                  className="inline-flex"
                  aria-pressed={selected}
                >
                  <Badge variant={selected ? "default" : "outline"} className="px-3 py-1 cursor-pointer">
                    {selected ? <Check className="h-3 w-3 mr-1" /> : null}
                    {PROFESSION_LABELS[key] ?? key}
                  </Badge>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/** Sort + dedupe an audience-key array, used by save sites before
 *  persisting so the same set always serializes the same way. */
export function canonicaliseAudienceKeys(keys: AudienceKey[]): AudienceKey[] {
  const set = new Set<AudienceKey>();
  for (const k of keys) {
    if (taxonomyOf(k) != null) set.add(k);
  }
  return Array.from(set).sort();
}
