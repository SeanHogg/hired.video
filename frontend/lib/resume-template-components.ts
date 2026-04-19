// Whitelisted components that can be dropped into a ResumeTemplateDescriptor.
// Each entry just re-uses an existing reusable component — adding a new
// component to the registry is a one-line change.

import { createElement, type ReactNode } from "react";
import ResumeTimelines from "@/components/ResumeTimelines";
import type { Resume } from "@/types/resume";
import type { ComponentKey } from "@/types/resume-template";

export interface ComponentRenderProps {
  resume: Resume;
  props?: Record<string, unknown>;
}

export const COMPONENT_REGISTRY: Record<ComponentKey, (p: ComponentRenderProps) => ReactNode> = {
  "career-timeline": ({ resume }) => createElement(ResumeTimelines, { resumeData: resume.content }),
};
