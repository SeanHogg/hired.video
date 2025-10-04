import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAI } from "@/lib/ai-context";
import { getAPIsForContext } from "@/lib/config/ai-api-registry";
import type { AIContext, AIContextType } from "@/lib/types/ai-context";

interface AIContextProviderProps {
  /** Optional: Provide specific context data */
  contextData?: Record<string, unknown>;
  /** Optional: Override auto-detected context type */
  contextType?: AIContextType;
}

/**
 * AIContextProvider - Automatically sets up AI context based on current route
 *
 * Usage:
 * 1. Simple (auto-detect from route):
 *    <AIContextProvider />
 *
 * 2. With page-specific data:
 *    <AIContextProvider contextData={{ stats, recentActivity }} />
 *
 * 3. With explicit context type:
 *    <AIContextProvider contextType="resume-edit" contextData={{ resume }} />
 */
export default function AIContextProvider({
  contextData,
  contextType: explicitContextType
}: AIContextProviderProps) {
  const location = useLocation();
  const { setPageContext, isAIChatOpen } = useAI();

  useEffect(() => {
    // Determine context type from route if not explicitly provided
    const contextType = explicitContextType || detectContextFromRoute(location.pathname);

    if (!contextType) {
      // No context for this page - but don't clear if AI chat is open
      if (!isAIChatOpen) {
        setPageContext(undefined);
      }
      return;
    }

    try {
      // Get available APIs for this context
      const availableAPIs = getAPIsForContext(contextType);

      // Get available actions for this context
      const availableActions = getActionsForContext(contextType);

      // Build the context object
      const context: AIContext = {
        contextType,
        pageUrl: window.location.href,
        timestamp: new Date(),
        availableAPIs,
        availableActions,
        ...contextData, // Merge in any page-specific data
      } as AIContext;

      setPageContext(context);
    } catch (error) {
      console.error("Failed to set AI context:", error);
      // Don't break the page if AI context fails - set undefined context
      setPageContext(undefined);
    }

    // Cleanup on unmount - don't clear context to allow smooth transitions
    // Context will be updated by the next page's AIContextProvider
    // This prevents flickering and maintains context during navigation
    return () => {
      // No cleanup needed - let the next page set its own context
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, explicitContextType, isAIChatOpen]);

  // This component doesn't render anything
  return null;
}

/**
 * Auto-detect context type from route pathname
 */
function detectContextFromRoute(pathname: string): AIContextType | null {
  // Home page
  if (pathname === "/" || pathname === "/index") return "search";

  // Dashboard
  if (pathname === "/dashboard") return "dashboard";

  // Resume routes
  if (pathname.startsWith("/resumes/new") || pathname.startsWith("/resumes/create")) {
    return "resume-create";
  }
  if (pathname.startsWith("/resumes/edit/") || pathname.includes("/resumes/") && pathname.includes("/edit")) {
    return "resume-edit";
  }
  if (pathname.startsWith("/resumes/") && !pathname.includes("/edit")) {
    return "resume-view";
  }
  if (pathname === "/resumes") {
    return "resume-list";
  }

  // Job routes
  if (pathname.startsWith("/jobs/new") || pathname.startsWith("/jobs/create")) {
    return "job-create";
  }
  if (pathname.startsWith("/jobs/edit/") || pathname.includes("/jobs/") && pathname.includes("/edit")) {
    return "job-edit";
  }
  if (pathname.startsWith("/jobs/") && !pathname.includes("/edit")) {
    return "job-view";
  }
  if (pathname === "/jobs") {
    return "job-list";
  }

  // Profile routes
  if (pathname.startsWith("/profile/edit") || pathname === "/settings") {
    return "profile-edit";
  }
  if (pathname.startsWith("/profile/") || pathname.startsWith("/people/")) {
    return "profile-view";
  }

  // Other routes
  if (pathname === "/outreach") return "outreach";
  if (pathname === "/messages" || pathname.startsWith("/messages/")) return "messaging";
  if (pathname === "/search") return "search";
  if (pathname === "/tasks") return "general"; // Tasks page - general AI assistance
  if (pathname === "/people") return "search"; // People page - search/discovery context
  if (pathname === "/companies") return "search"; // Companies page - search/discovery context

  // Default: general context
  return "general";
}

/**
 * Get available actions for a context type
 */
function getActionsForContext(contextType: AIContextType): string[] {
  const actionMap: Record<AIContextType, string[]> = {
    "dashboard": ["analyze-performance", "suggest-improvements", "generate-insights", "recommend-actions"],
    "resume-list": ["optimize-content", "ats-score", "compare-resumes"],
    "resume-create": ["optimize-content", "improve-summary", "keyword-optimization", "suggest-skills"],
    "resume-edit": ["optimize-content", "improve-summary", "keyword-optimization", "ats-score", "enhance-experience"],
    "resume-view": ["optimize-content", "ats-score", "improve-summary"],
    "job-list": ["find-matches", "salary-insights", "filter-jobs"],
    "job-create": ["optimize-description", "salary-insights", "suggest-requirements"],
    "job-edit": ["optimize-description", "salary-insights", "improve-requirements"],
    "job-view": ["find-matches", "salary-insights", "compare-candidates"],
    "profile-view": ["optimize-content", "suggest-improvements"],
    "profile-edit": ["optimize-content", "improve-summary", "keyword-optimization"],
    "outreach": ["draft-message", "suggest-connections", "optimize-pitch"],
    "messaging": ["draft-reply", "suggest-response", "analyze-tone"],
    "search": ["refine-search", "suggest-filters", "find-matches"],
    "general": ["answer-question", "provide-guidance", "explain-feature"],
  };

  return actionMap[contextType] || [];
}

