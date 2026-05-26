// StageQuestionsEditor — per-stage list of questions tagged with a
// competency + difficulty (#1390). Renders inside the kit detail
// editor so recruiters can build the question bank as they configure
// the loop. Self-loads, self-manages.

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  type StageQuestion,
} from "@/lib/services/scorecards-service";
import { CompetencyPicker } from "./CompetencyPicker";

interface Props {
  companyId: string;
  stageId: string;
}

const ANSWER_KINDS: StageQuestion["expectedAnswer"][] = [
  "open",
  "star",
  "technical",
  "coding",
  "portfolio",
];

export function StageQuestionsEditor({ companyId, stageId }: Props) {
  const [questions, setQuestions] = useState<StageQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [competencyId, setCompetencyId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState("");
  const [expectedAnswer, setExpectedAnswer] =
    useState<StageQuestion["expectedAnswer"]>("open");

  async function refresh() {
    setLoading(true);
    try {
      setQuestions(await scorecardsService.listStageQuestions(stageId));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [stageId]);

  async function add() {
    if (!prompt.trim()) return;
    setAdding(true);
    try {
      await scorecardsService.addStageQuestion(stageId, {
        prompt: prompt.trim(),
        competencyId,
        difficulty: difficulty || null,
        expectedAnswer,
      });
      setPrompt("");
      setCompetencyId(null);
      setDifficulty("");
      setExpectedAnswer("open");
      await refresh();
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    await scorecardsService.deleteStageQuestion(id);
    await refresh();
  }

  if (loading) return null;

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Tagged questions</Label>
      {questions.map((q) => (
        <div
          key={q.id}
          className="flex items-start gap-2 rounded border p-2 text-sm"
        >
          <div className="flex-1 space-y-1">
            <p>{q.prompt}</p>
            <div className="flex gap-1 flex-wrap">
              <Badge variant="outline">{q.expectedAnswer}</Badge>
              {q.difficulty && <Badge variant="outline">{q.difficulty}</Badge>}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => remove(q.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="rounded border border-dashed p-2 space-y-2">
        <Textarea
          rows={2}
          placeholder="Question prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="flex flex-wrap gap-2 items-center">
          <CompetencyPicker
            companyId={companyId}
            value={competencyId}
            onChange={setCompetencyId}
            compact
          />
          <Input
            className="w-20"
            placeholder="L3"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          />
          <Select
            value={expectedAnswer}
            onValueChange={(v) =>
              setExpectedAnswer(v as StageQuestion["expectedAnswer"])
            }
          >
            <SelectTrigger className="h-8 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANSWER_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={add} disabled={adding || !prompt.trim()}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      </div>
    </div>
  );
}
