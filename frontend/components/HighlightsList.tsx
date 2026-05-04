interface HighlightsListProps {
  highlights: string[] | null | undefined;
  className?: string;
}

export default function HighlightsList({
  highlights,
  className = "list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4",
}: HighlightsListProps) {
  const list = (highlights ?? []).filter((h) => h && h.trim().length > 0);
  if (list.length === 0) return null;
  return (
    <ul className={className}>
      {list.map((highlight, i) => (
        <li key={i}>{highlight}</li>
      ))}
    </ul>
  );
}
