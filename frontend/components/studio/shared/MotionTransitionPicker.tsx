/**
 * Motion + transition pickers — a pair of compact selects shared by v1
 * and v2. Bundled into one component since they're conceptually
 * adjacent and always shown together; consumers that only need one can
 * pass `null` for the other handler and that half hides itself.
 */
import {
  MOTION_PRESETS,
  TRANSITION_PRESETS,
  type MotionPreset,
  type MotionStyle,
  type TransitionKind,
  type TransitionPreset,
} from "@/lib/studio/motion-presets";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export interface MotionTransitionPickerProps {
  activeMotion: MotionStyle | null;
  activeTransition: TransitionKind | null;
  onSelectMotion?: (preset: MotionPreset) => void;
  onSelectTransition?: (preset: TransitionPreset) => void;
  className?: string;
}

export default function MotionTransitionPicker({
  activeMotion,
  activeTransition,
  onSelectMotion,
  onSelectTransition,
  className,
}: MotionTransitionPickerProps) {
  return (
    <div className={className}>
      {onSelectMotion && (
        <div className="mb-3">
          <Label className="mb-1.5 block text-xs">Motion</Label>
          <Select
            value={activeMotion ?? "moderate"}
            onValueChange={(value) => {
              const p = MOTION_PRESETS.find((m) => m.id === value);
              if (p) onSelectMotion(p);
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MOTION_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                  <span className="ml-2 text-[10px] text-muted-foreground">
                    {p.hint}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {onSelectTransition && (
        <div>
          <Label className="mb-1.5 block text-xs">Transition</Label>
          <Select
            value={activeTransition ?? "cut"}
            onValueChange={(value) => {
              const p = TRANSITION_PRESETS.find((t) => t.id === value);
              if (p) onSelectTransition(p);
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSITION_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                  <span className="ml-2 text-[10px] text-muted-foreground">
                    {p.hint}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
