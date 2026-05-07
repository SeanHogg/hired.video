// Career 360 target picker. Shows 3 LLM-suggested target roles plus a
// "Suggest different ones" refresh and a "Pick something else" custom
// entry. Self-contained — the Career 360 page hands it the current
// suggestion list and callbacks; the picker decides its own loading +
// disabled states from the props it owns.

import { useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { TargetSuggestion } from "@shared/career360-types";

interface Props {
  suggestions: TargetSuggestion[];
  /** True while the suggestion list is being (re)generated. */
  isSuggesting: boolean;
  /** True while a target is being committed (gap analysis runs). */
  isSelecting: boolean;
  onRefresh: () => void;
  onChoose: (id: string) => void;
  onCustom: (params: {
    title: string;
    seniority?: string;
    timelineMonths?: number;
  }) => void;
}

export function TargetPicker({
  suggestions,
  isSuggesting,
  isSelecting,
  onRefresh,
  onChoose,
  onCustom,
}: Props) {
  const [showCustom, setShowCustom] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customSeniority, setCustomSeniority] = useState("");
  const [customTimeline, setCustomTimeline] = useState("12");

  const disabled = isSuggesting || isSelecting;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">What do you want to become?</h3>
          <p className="text-sm text-muted-foreground">
            Pick one of these AI-suggested targets — we'll build the gap analysis and roadmap from your profile.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={disabled}
        >
          {isSuggesting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Suggest different ones
        </Button>
      </div>

      {suggestions.length === 0 && !isSuggesting && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No suggestions yet — click "Suggest different ones" to generate three.
          </CardContent>
        </Card>
      )}

      {isSuggesting && suggestions.length === 0 && (
        <Card>
          <CardContent className="p-6 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Reading your profile…
          </CardContent>
        </Card>
      )}

      {suggestions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {suggestions.map((s) => (
            <Card
              key={s.id}
              className={cn(
                "h-full flex flex-col",
                disabled && "opacity-60 pointer-events-none",
              )}
            >
              <CardContent className="p-5 flex flex-col h-full gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-semibold leading-tight">{s.title}</h4>
                    {s.seniority && (
                      <Badge variant="secondary" className="mt-1 text-[10px]">
                        {s.seniority}
                      </Badge>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    ~{s.timelineMonths}mo
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{s.description}</p>
                <p className="text-xs text-muted-foreground italic">
                  Why: {s.why}
                </p>
                <div className="mt-auto pt-2">
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => onChoose(s.id)}
                    disabled={disabled}
                  >
                    {isSelecting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    Build my plan
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          {!showCustom ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-muted-foreground">
                Have a different target in mind?
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCustom(true)}
                disabled={disabled}
              >
                Enter a custom target
              </Button>
            </div>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!customTitle.trim()) return;
                onCustom({
                  title: customTitle.trim(),
                  seniority: customSeniority.trim() || undefined,
                  timelineMonths: Number.parseInt(customTimeline, 10) || 12,
                });
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <Label htmlFor="career360-target-title">Target role</Label>
                  <Input
                    id="career360-target-title"
                    placeholder="e.g. Staff Backend Engineer"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div>
                  <Label htmlFor="career360-target-seniority">Seniority</Label>
                  <Input
                    id="career360-target-seniority"
                    placeholder="Staff"
                    value={customSeniority}
                    onChange={(e) => setCustomSeniority(e.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div>
                  <Label htmlFor="career360-target-timeline">Timeline (months)</Label>
                  <Input
                    id="career360-target-timeline"
                    type="number"
                    min={1}
                    max={60}
                    value={customTimeline}
                    onChange={(e) => setCustomTimeline(e.target.value)}
                    disabled={disabled}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={disabled || !customTitle.trim()}
                >
                  {isSelecting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Build plan for this target
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCustom(false)}
                  disabled={disabled}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
