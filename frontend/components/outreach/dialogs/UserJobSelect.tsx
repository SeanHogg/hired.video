import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { JobSummary } from "@/lib/services/job-service";

/** Picker over the signed-in user's jobs, with a disabled placeholder row
 *  when they have none (shared by the job-board and boost dialogs). */
export function UserJobSelect({
  triggerId,
  value,
  onValueChange,
  placeholder,
  userJobs,
  emptyValue,
  emptyLabel,
}: {
  triggerId?: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  userJobs: JobSummary[];
  emptyValue: string;
  emptyLabel: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={triggerId}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {userJobs.length > 0 ? (
          userJobs.map((job) => (
            <SelectItem key={job.id} value={job.id}>
              {job.title}
            </SelectItem>
          ))
        ) : (
          <SelectItem value={emptyValue} disabled>
            {emptyLabel}
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
