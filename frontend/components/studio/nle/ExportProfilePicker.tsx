/**
 * ExportProfilePicker — single dropdown that drives
 * `Timeline.exportProfile`. Per the standing DRY rule the picker is
 * the only place this field gets set; the render facade reads it via
 * `pickRenderEngine`. No caller branches on profile id.
 */

"use client";

import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BUILTIN_EXPORT_PROFILES,
  getExportProfile,
} from "@/lib/timeline/export-profiles";
import type { Timeline } from "@shared/timeline";

interface Props {
  timeline: Timeline;
  onTimelineChange: (next: Timeline) => void;
}

export default function ExportProfilePicker({ timeline, onTimelineChange }: Props) {
  const value = timeline.exportProfile?.id ?? "h264-1080p";
  const apply = (id: string) => {
    const profile = getExportProfile(id);
    if (!profile) return;
    onTimelineChange({ ...timeline, exportProfile: profile });
  };
  return (
    <Select value={value} onValueChange={apply}>
      <SelectTrigger className="h-8 w-56 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {BUILTIN_EXPORT_PROFILES.map((p) => (
          <SelectItem key={p.id} value={p.id} className="text-xs">
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
