import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface SettingsSwitchRowProps {
  label: ReactNode;
  description: ReactNode;
  checked: boolean | undefined;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

/** Label + description on the left, Switch on the right — the shared settings toggle row. */
export function SettingsSwitchRow({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: SettingsSwitchRowProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-1">
        <Label className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
