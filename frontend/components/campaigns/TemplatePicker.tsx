/**
 * TemplatePicker — choose an email template to render the campaign from, or
 * "None (write inline)". Reusable across the composer and any future template
 * attach surface. Shows the picked template's subject as a hint.
 */
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { CampaignTemplateDTO } from "@shared/campaigns";

const NONE = "__none__";

export interface TemplatePickerProps {
  templates: CampaignTemplateDTO[];
  value: string | null;
  onChange: (templateId: string | null) => void;
}

export function TemplatePicker({ templates, value, onChange }: TemplatePickerProps) {
  const selected = templates.find((t) => t.id === value);
  return (
    <div className="space-y-1.5">
      <Label>Template</Label>
      <Select
        value={value ?? NONE}
        onValueChange={(v) => onChange(v === NONE ? null : v)}
      >
        <SelectTrigger>
          <SelectValue placeholder="None (write inline)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None (write inline)</SelectItem>
          {templates.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected && (
        <p className="text-xs text-muted-foreground">Subject: {selected.subject}</p>
      )}
    </div>
  );
}

export default TemplatePicker;
