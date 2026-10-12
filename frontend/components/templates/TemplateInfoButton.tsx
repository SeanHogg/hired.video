// Universal "details" affordance — drop on any template card to surface the
// preview + apply CTA. Works in two modes; chooses based on the surrounding
// <TemplateDetailsHostProvider> rather than a prop, so consumers never carry
// canX booleans:
//
//  - route mode (default): navigates to /marketplace/templates/:slug
//  - sheet mode: opens an inline right-side <Sheet> with TemplateDetails
//
// In both cases, what the visitor sees is the same TemplateDetails body —
// the contract is one component, two destinations.

import { Info } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import TemplateDetails from "./TemplateDetails";
import { useTemplateDetailsHost } from "./TemplateDetailsHost";
import type { TemplateMeta } from "@/lib/templates/types";

interface Props extends Omit<ButtonProps, "onClick" | "children"> {
  meta: TemplateMeta;
  /** Optional accessible label override; defaults to "View template details". */
  ariaLabel?: string;
}

export default function TemplateInfoButton({ meta, ariaLabel, ...buttonProps }: Props) {
  const host = useTemplateDetailsHost();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleClick = () => {
    if (host === "sheet") {
      setOpen(true);
    } else {
      navigate(`/marketplace/templates/${meta.slug}`);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={ariaLabel ?? `View ${meta.name} details`}
        onClick={handleClick}
        {...buttonProps}
      >
        <Info className="w-4 h-4" />
      </Button>

      {host === "sheet" && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{meta.name}</SheetTitle>
              {meta.industry && (
                <SheetDescription>{meta.industry}</SheetDescription>
              )}
            </SheetHeader>
            <div className="mt-4">
              <TemplateDetails meta={meta} compact />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
