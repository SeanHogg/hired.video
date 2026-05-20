// Empty state shared by every per-program tab on the public profile.
//
// Visitor view → nothing (the tab body just collapses).
// Owner view   → CTA card pointing at the program's home route so the owner
//                can publish their first item without leaving the page.
//
// `program` keys into CREATOR_PROGRAM_HOME / CREATOR_PROGRAM_LABEL — the
// same SSoT the YourProgramsPanel uses, so the destinations never drift.

import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CREATOR_PROGRAM_HOME,
  CREATOR_PROGRAM_LABEL,
  type CreatorProgram,
} from "@/lib/services/creator-service";

interface Props {
  program: CreatorProgram;
  isOwner: boolean;
}

export default function EmptyProgramState({ program, isOwner }: Props) {
  if (!isOwner) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Nothing published in {CREATOR_PROGRAM_LABEL[program]} yet.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-8 text-center space-y-3">
        <h3 className="font-semibold text-lg">
          No {CREATOR_PROGRAM_LABEL[program]} published yet
        </h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Visitors will see anything you publish here. Head to the program
          home to add your first item.
        </p>
        <Button asChild>
          <Link to={CREATOR_PROGRAM_HOME[program]}>
            Manage {CREATOR_PROGRAM_LABEL[program]}
            <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
