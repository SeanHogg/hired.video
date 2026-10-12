// Name + @handle + chip row shared by the two public-profile layouts
// (resume mode and channel mode) on /u/:handle.

import type { ReactNode } from "react";

interface Props {
  name: string;
  handle?: string | null;
  /** Chip row under the handle (mode / counts). */
  children?: ReactNode;
}

export function ProfileHeading({ name, handle, children }: Props) {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="break-words font-display text-[clamp(36px,4.8vw,60px)] font-bold leading-[0.98] tracking-[-0.035em] text-foreground">
        {name}
      </h1>
      {handle && <p className="font-mono text-sm text-muted-foreground">@{handle}</p>}
      {children && <div className="mt-1 flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
