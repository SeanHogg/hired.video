import { Link } from "react-router-dom";

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
  const links = [
    { to: "/privacy-policy", label: "Privacy Policy" },
    { to: "/terms-of-service", label: "Terms of Service" },
    { to: "/cookies", label: "Cookie Policy" },
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
