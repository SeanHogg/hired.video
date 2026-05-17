import { Sparkles } from "lucide-react";
import * as React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface AIInputBoxProps {
  onSubmit: (value: string) => void;
  placeholder?: string;
  helpText?: string;
  buttonLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function AIInputBox({
  onSubmit,
  placeholder,
  helpText,
  buttonLabel,
  disabled = false,
  className,
}: AIInputBoxProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");

  const canSubmit = !disabled && value.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(value.trim());
    setValue("");
  };

  return (
    <div
      className={cn(
        "relative bg-card border border-border rounded-2xl shadow-lg p-3",
        className,
      )}
    >
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder ?? t("marketing.index.chroPlaceholder")}
        className="min-h-[80px] resize-none border-0 bg-transparent text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
      />
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
        <p className="text-xs text-muted-foreground">
          {helpText ?? t("marketing.index.chroHelpText")}
        </p>
        <Button
          size="sm"
          className="gap-2"
          disabled={!canSubmit}
          onClick={submit}
        >
          <Sparkles className="w-4 h-4" />
          {buttonLabel ?? t("actions.askChro")}
        </Button>
      </div>
    </div>
  );
}
