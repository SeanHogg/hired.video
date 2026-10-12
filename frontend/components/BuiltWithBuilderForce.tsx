import { useTranslation } from "react-i18next";

const BUILDERFORCE_URL = "https://builderforce.ai";

/** "Built with BuilderForce.ai" credit — the platform hired.video is built on.
 *  The mark is a transparent PNG, so it reads on light and dark grounds. */
export default function BuiltWithBuilderForce() {
  const { t } = useTranslation();
  return (
    <a
      href={BUILDERFORCE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex min-h-[44px] items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <span>{t("footer.builtWith")}</span>
      <img
        src="/brand/builderforce-mark.png"
        alt=""
        width={16}
        height={16}
        loading="lazy"
        className="h-4 w-4"
      />
      <span className="font-semibold text-foreground/80 group-hover:text-foreground">BuilderForce.ai</span>
    </a>
  );
}
