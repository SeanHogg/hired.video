// TakeHomePromptEditor — per-stage take-home assignment authoring
// (#1386). Self-gating: returns null unless the parent stage's
// `stageKind === 'take_home'`. Single source of truth for "this stage
// needs a prompt" — consumers don't pass a `canShow` boolean.

import { useEffect, useState } from "react";
import { Save, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  scorecardsService,
  type StageKind,
  type TakeHomeAssignment,
} from "@/lib/services/scorecards-service";

interface Props {
  stageId: string;
  stageKind: StageKind | undefined;
}

const DELIVERY: TakeHomeAssignment["deliveryFormat"][] = [
  "github_url",
  "file_upload",
  "code_paste",
  "doc_link",
];

export function TakeHomePromptEditor({ stageId, stageKind }: Props) {
  const [assignment, setAssignment] = useState<TakeHomeAssignment | null>(null);
  const [prompt, setPrompt] = useState("");
  const [deliveryFormat, setDeliveryFormat] =
    useState<TakeHomeAssignment["deliveryFormat"]>("github_url");
  const [dueInHours, setDueInHours] = useState<number>(72);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (stageKind !== "take_home") return;
    (async () => {
      const a = await scorecardsService.getTakeHome(stageId);
      if (a) {
        setAssignment(a);
        setPrompt(a.prompt);
        setDeliveryFormat(a.deliveryFormat);
        setDueInHours(a.dueInHours);
      }
      setLoaded(true);
    })();
  }, [stageId, stageKind]);

  // Self-gate: only render for take-home stages.
  if (stageKind !== "take_home") return null;
  if (!loaded) return null;

  async function save() {
    setSaving(true);
    try {
      const a = await scorecardsService.upsertTakeHome(stageId, {
        prompt: prompt.trim(),
        deliveryFormat,
        dueInHours,
      });
      setAssignment(a);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded border border-dashed p-3 space-y-2">
      <Label className="text-xs flex items-center gap-1 text-muted-foreground">
        <FileText className="h-3 w-3" /> Take-home prompt
        {assignment && <span className="text-green-700">· saved</span>}
      </Label>
      <Textarea
        rows={4}
        placeholder="What the candidate is asked to deliver."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <Select
          value={deliveryFormat}
          onValueChange={(v) =>
            setDeliveryFormat(v as TakeHomeAssignment["deliveryFormat"])
          }
        >
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DELIVERY.map((d) => (
              <SelectItem key={d} value={d}>
                {d.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Label className="text-xs">Due in (hours)</Label>
          <Input
            type="number"
            min={1}
            max={720}
            className="w-20 h-8"
            value={dueInHours}
            onChange={(e) => setDueInHours(Number(e.target.value) || 72)}
          />
        </div>
        <Button size="sm" onClick={save} disabled={saving || !prompt.trim()}>
          <Save className="mr-1 h-4 w-4" /> Save
        </Button>
      </div>
    </div>
  );
}
