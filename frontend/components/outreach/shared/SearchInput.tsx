/**
 * SearchInput — the search row that Templates, Campaigns, and Contacts
 * share. The grid/list toggle now lives in the tab's title row next to
 * the create button, so this component is just the input.
 */
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface SearchInputProps {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

export function SearchInput({ placeholder, value, onChange }: SearchInputProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-10 min-h-[44px]"
      />
    </div>
  );
}

export default SearchInput;
