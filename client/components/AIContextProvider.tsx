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

  // Safely get AI context - it might not be available during SSR or initial render
  let setPageContext: ((context: AIContext | undefined) => void) | undefined;
  try {
    const aiContext = useAI();
    setPageContext = aiContext?.setPageContext;
  } catch (error) {
    // AI context not available - this is okay, just skip setting context
    console.warn("AI context not available:", error);
  }

  useEffect(() => {
    // Skip if AI context is not available
    if (!setPageContext) {
      return;
    }

    // Determine context type from route if not explicitly provided
    const contextType = explicitContextType || detectContextFromRoute(location.pathname);

    if (!contextType) {
      // No context for this page
      setPageContext(undefined);
      return;
    }

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

    // Cleanup on unmount
    return () => {
      if (setPageContext) {
        setPageContext(undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, explicitContextType, setPageContext]);

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

