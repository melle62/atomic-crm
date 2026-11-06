import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useTranslate } from "ra-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MultiSelectOption = { value: string; label: string };

type MultiSelectProps = {
  label: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
};

/** Compact searchable checkbox list in a popover. */
export const MultiSelect = ({
  label,
  options,
  value,
  onChange,
  className,
}: MultiSelectProps) => {
  const translate = useTranslate();
  const [search, setSearch] = useState("");
  const selected = useMemo(() => new Set(value), [value]);
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("sv");
    return term
      ? options.filter((option) =>
          option.label.toLocaleLowerCase("sv").includes(term),
        )
      : options;
  }, [options, search]);

  const toggle = (optionValue: string) =>
    onChange(
      selected.has(optionValue)
        ? value.filter((item) => item !== optionValue)
        : [...value, optionValue],
    );

  const summary =
    value.length === 0
      ? label
      : value.length === 1
        ? (options.find((o) => o.value === value[0])?.label ?? value[0])
        : `${label}: ${translate("crm.geo.selected", { smart_count: value.length })}`;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn(
              "w-full justify-between font-normal",
              value.length === 0 && "text-muted-foreground",
              className,
            )}
          />
        }
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="size-4 opacity-50 shrink-0" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2 gap-2">
        {options.length > 8 ? (
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={translate("crm.geo.search")}
            aria-label={translate("crm.geo.search")}
            className="h-8"
          />
        ) : null}
        <div
          className="max-h-64 overflow-y-auto flex flex-col"
          role="listbox"
          aria-multiselectable
        >
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground p-2">
              {translate("crm.geo.no_options")}
            </p>
          ) : (
            visible.map((option) => {
              const isSelected = selected.has(option.value);
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  key={option.value}
                  onClick={() => toggle(option.value)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left hover:bg-accent cursor-pointer"
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded border",
                      isSelected &&
                        "bg-primary text-primary-foreground border-primary",
                    )}
                  >
                    {isSelected ? <Check className="size-3" /> : null}
                  </span>
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })
          )}
        </div>
        {value.length ? (
          <Button variant="ghost" size="sm" onClick={() => onChange([])}>
            {translate("crm.geo.clear")}
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
};
