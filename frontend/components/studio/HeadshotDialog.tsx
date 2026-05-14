"use client";

/**
 * HeadshotDialog — v1 trigger + modal wrapper around HeadshotGenerator.
 * v2's Actions panel mounts HeadshotGenerator directly inside its
 * slideout sheet (no nested modal), so the shared body lives in
 * HeadshotGenerator.tsx and both hosts reuse it.
 */

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import HeadshotGenerator from "./HeadshotGenerator";

export default function HeadshotDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs">
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          AI Headshot
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pro headshot generator</DialogTitle>
          <DialogDescription>
            Webcam or upload → background removed → composited on a
            studio backdrop. Runs entirely in your browser.
          </DialogDescription>
        </DialogHeader>
        <HeadshotGenerator />
      </DialogContent>
    </Dialog>
  );
}
