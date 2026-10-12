/**
 * ProTag — the small "Pro" tag after a paid action's label (chat chips, a
 * stage plan's steps). ONE look, theme tokens only (the review tint reads
 * in light and dark).
 */
import { useTranslation } from "react-i18next";

export default function ProTag() {
  const { t } = useTranslation();
  return (
    <span className="rounded-[5px] bg-review px-1.5 py-px text-[10.5px] font-semibold text-review-foreground">
      {t("build.stages.pro")}
    </span>
  );
}
