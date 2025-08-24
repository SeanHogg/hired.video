import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface MarkdownDisplayProps {
  content: string;
  className?: string;
}

export default function MarkdownDisplay({ content, className = "" }: MarkdownDisplayProps) {
  // Simple markdown parser for basic formatting
  const parseMarkdown = useMemo(() => {
    if (!content) return "";

    let html = content;

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-6 mb-3 text-foreground">$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mt-6 mb-4 text-foreground">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-6 mb-4 text-foreground">$1</h1>');

    // Bold text
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong class="font-semibold text-foreground">$1</strong>');

    // Italic text
    html = html.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');
    html = html.replace(/_(.*?)_/g, '<em class="italic">$1</em>');

    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre class="bg-muted p-4 rounded-lg my-4 overflow-x-auto"><code class="text-sm">$1</code></pre>');
    
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="bg-muted px-2 py-1 rounded text-sm font-mono">$1</code>');

    // Unordered lists
    html = html.replace(/^\* (.*$)/gim, '<li class="ml-4 mb-1">• $1</li>');
    html = html.replace(/^- (.*$)/gim, '<li class="ml-4 mb-1">• $1</li>');
    
    // Ordered lists
    html = html.replace(/^\d+\. (.*$)/gim, '<li class="ml-4 mb-1 list-decimal">$1</li>');

    // Wrap consecutive list items in ul/ol tags
    html = html.replace(/(<li class="ml-4 mb-1">• .*<\/li>\s*)+/g, '<ul class="my-3 space-y-1">$&</ul>');
    html = html.replace(/(<li class="ml-4 mb-1 list-decimal">.*<\/li>\s*)+/g, '<ol class="my-3 space-y-1 list-decimal ml-6">$&</ol>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary hover:underline" target="_blank" rel="noopener noreferrer">$1</a>');

    // Line breaks
    html = html.replace(/\n\n/g, '</p><p class="mb-4">');
    html = html.replace(/\n/g, '<br />');

    // Wrap in paragraph tags
    html = '<p class="mb-4">' + html + '</p>';

    // Clean up empty paragraphs
    html = html.replace(/<p class="mb-4"><\/p>/g, '');

    return html;
  }, [content]);

  if (!content) {
    return null;
  }

  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div 
          className="prose prose-sm max-w-none text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: parseMarkdown }}
        />
      </CardContent>
    </Card>
  );
}
