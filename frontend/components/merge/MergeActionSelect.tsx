/** Merge / Replace / Add as new / Skip for one matched entry. Merge and
 *  Replace need a matching entry on the target side. */
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MergeDecision } from "@/types/resume";

type Action = MergeDecision["action"];

export default function MergeActionSelect({
  value,
  hasTarget,
  onChange,
}: {
  value: Action;
  hasTarget: boolean;
  onChange: (action: Action) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const actions: Action[] = hasTarget ? ["merge", "replace", "add", "skip"] : ["add", "skip"];
  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {t("merge.action.label")}
      </label>
      <Select value={value} onValueChange={(v) => onChange(v as Action)}>
        <SelectTrigger id={id} className="h-9 w-[132px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {actions.map((a) => (
            <SelectItem key={a} value={a}>
              {t(`merge.action.${a}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
