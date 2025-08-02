import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Brain, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface FloatingAIButtonProps {
  onClick: () => void;
  className?: string;
}

export default function FloatingAIButton({ onClick, className }: FloatingAIButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className={cn("fixed bottom-6 right-6 z-40", className)}>
      <Button
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="w-14 h-14 rounded-full bg-gradient-to-r from-brand-purple to-brand-blue hover:from-brand-purple/90 hover:to-brand-blue/90 shadow-lg hover:shadow-xl transition-all duration-300 border-2 border-white/20 group"
        size="icon"
      >
        <div className="relative">
          <Brain className="h-6 w-6 text-white transition-transform duration-300 group-hover:scale-110" />
          <Sparkles 
            className={cn(
              "h-3 w-3 text-white/80 absolute -top-1 -right-1 transition-all duration-300",
              isHovered ? "animate-pulse scale-110" : ""
            )} 
          />
        </div>
        
        {/* Floating animation rings */}
        <div className="absolute inset-0 rounded-full">
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-brand-purple/30 to-brand-blue/30 animate-ping" />
          <div 
            className={cn(
              "absolute inset-0 rounded-full bg-gradient-to-r from-brand-purple/20 to-brand-blue/20 transition-transform duration-1000",
              isHovered ? "scale-125" : "scale-110"
            )}
            style={{
              animation: isHovered ? "pulse 1.5s ease-in-out infinite" : "pulse 2s ease-in-out infinite"
            }}
          />
        </div>
      </Button>
      
      {/* Tooltip */}
      <div 
        className={cn(
          "absolute bottom-16 right-0 bg-background border rounded-lg px-3 py-2 shadow-lg transition-all duration-300 whitespace-nowrap",
          isHovered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
        )}
      >
        <div className="text-sm font-medium">Ask AI Assistant</div>
        <div className="text-xs text-muted-foreground">Get instant HR help</div>
        
        {/* Arrow */}
        <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-border" />
      </div>
    </div>
  );
}
