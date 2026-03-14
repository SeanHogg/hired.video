import { getCopyrightString } from "@/lib/utils/date";

export default function Copyright() {
  return (
    <span className="text-sm text-muted-foreground">
      {getCopyrightString("MyVideoResu.ME")}
    </span>
  );
}
