/**
 * The intake form component behind each `TemplateDef.intake` id. The
 * template catalog (lib/studio/templates/catalog.ts) is UI-free data; the
 * wizard resolves the form to mount here.
 */
import type { ComponentType } from "react";
import type { IntakeProps, TemplateIntakeId } from "@/lib/studio/templates/catalog";
import BasicIntake from "./intake/BasicIntake";
import ProfileIntake from "./intake/ProfileIntake";
import ResumeIntake from "./intake/ResumeIntake";
import PersonalBrandIntake from "./intake/PersonalBrandIntake";
import SkillsDemoIntake from "./intake/SkillsDemoIntake";
import CodeWalkthroughIntake from "./intake/CodeWalkthroughIntake";
import DesignPortfolioIntake from "./intake/DesignPortfolioIntake";
import DataAnalysisIntake from "./intake/DataAnalysisIntake";
import JobAdIntake from "./intake/JobAdIntake";
import CompanyPromoIntake from "./intake/CompanyPromoIntake";
import SizzleReelIntake from "./intake/SizzleReelIntake";
import ToolPromoIntake from "./intake/ToolPromoIntake";
import ComicIntake from "./intake/ComicIntake";

export const TEMPLATE_INTAKE_FORMS: Record<TemplateIntakeId, ComponentType<IntakeProps>> = {
  basic: BasicIntake,
  profile: ProfileIntake,
  resume: ResumeIntake,
  personal_brand: PersonalBrandIntake,
  skills_demo: SkillsDemoIntake,
  code_walkthrough: CodeWalkthroughIntake,
  design_portfolio: DesignPortfolioIntake,
  data_analysis: DataAnalysisIntake,
  job_ad: JobAdIntake,
  company_promo: CompanyPromoIntake,
  sizzle_reel: SizzleReelIntake,
  tool_promo: ToolPromoIntake,
  comic: ComicIntake,
};
