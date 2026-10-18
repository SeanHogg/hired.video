import { useTranslation } from "react-i18next";
import { useHeaderFilters } from "@/lib/header-filters";

/** Registers the /jobs browse filters (employment type, experience, work
 *  setting, salary range) with the global header filter bar. */
export function useJobsHeaderFilters(): void {
  const { t } = useTranslation();
  useHeaderFilters([
    {
      key: "employmentType",
      label: t("labels.employmentType"),
      type: "select",
      options: [
        { value: "full-time", label: t("labels.employmentType.fullTime") },
        { value: "part-time", label: t("labels.employmentType.partTime") },
        { value: "contract", label: t("labels.employmentType.contract") },
        { value: "internship", label: t("labels.employmentType.internship") },
      ],
    },
    {
      key: "experienceLevel",
      label: t("labels.experienceLevel"),
      type: "select",
      options: [
        { value: "entry", label: t("labels.experienceLevelLower.entry") },
        { value: "mid", label: t("labels.experienceLevelLower.mid") },
        { value: "senior", label: t("labels.experienceLevelLower.senior") },
        { value: "executive", label: t("labels.experienceLevel.executive") },
      ],
    },
    {
      key: "workSetting",
      label: t("fields.workSetting.label"),
      type: "select",
      options: [
        { value: "onsite", label: t("labels.workSetting.onsite") },
        { value: "remote", label: t("labels.workSetting.remote") },
        { value: "hybrid", label: t("labels.workSetting.hybrid") },
      ],
    },
    { key: "salary", label: t("labels.salaryRangeLabel"), type: "number-range" },
  ]);
}
