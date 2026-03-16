import { useRef } from "react";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

interface Props {
  accept?: string;
  label?: ReactNode;
  buttonText?: string;
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  className?: string;
}

export default function FileUploadInput({
  accept = ".pdf,.txt,.md,.docx",
  label,
  buttonText = "Upload",
  onFileSelected,
  disabled,
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className={className}>
      {label}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          {buttonText}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileSelected(file);
          }}
        />
      </div>
    </div>
  );
}
