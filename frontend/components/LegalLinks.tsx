import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface LegalLinksProps {
  className?: string;
  linkClassName?: string;
  orientation?: "horizontal" | "vertical";
}

export default function LegalLinks({
  className = "",
  linkClassName = "text-muted-foreground hover:text-foreground transition-colors",
  orientation = "horizontal",
}: LegalLinksProps) {
  const { t } = useTranslation();
  const links = [
    { to: "/privacy-policy", label: t("labels.privacyPolicy") },
    { to: "/terms-of-service", label: t("labels.termsOfService") },
    { to: "/cookies", label: t("labels.cookiePolicy") },
  ];

  const containerClass =
    orientation === "horizontal"
      ? `flex space-x-6 text-sm ${className}`
      : `flex flex-col space-y-2 ${className}`;

  return (
    <div className={containerClass}>
      {links.map((link) => (
        <Link key={link.to} to={link.to} className={`text-sm ${linkClassName}`}>
          {link.label}
        </Link>
      ))}
    </div>
  );
}
