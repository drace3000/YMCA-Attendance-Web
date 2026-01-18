"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type PopoverSelectOption = {
  value: string;
  label: string;
};

export function PopoverSelect({
  value,
  options,
  onChange,
  ariaLabel,
  disabled,
  className,
  contentClassName,
  rightIcon,
  placeholder,
  renderOption,
  renderValue,
  sideOffset,
}: {
  value: string | null;
  options: PopoverSelectOption[];
  onChange: (nextValue: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  rightIcon?: React.ReactNode;
  placeholder?: string;
  renderOption?: (option: PopoverSelectOption, isSelected: boolean) => React.ReactNode;
  renderValue?: (selected: PopoverSelectOption | null) => React.ReactNode;
  sideOffset?: number;
}) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-expanded={open}
          className={cn(
            "btn-pill inline-flex items-center justify-between gap-2 rounded-lg border border-white/15 bg-card/70 px-3 py-2 text-sm shadow-sm ring-1 ring-white/10 transition hover:bg-card hover:ring-white/15 focus:outline-none focus:ring-1 focus:ring-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
            className,
          )}
        >
          {renderValue ? (
            renderValue(selected)
          ) : (
            <span className="truncate font-semibold text-foreground">
              {selected?.label ?? placeholder ?? "Select..."}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            {rightIcon ? <span className="text-[var(--cta)]">{rightIcon}</span> : null}
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={sideOffset ?? 6}
        className={cn(
          "w-[240px] rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-1 shadow-xl backdrop-blur-md",
          contentClassName,
        )}
      >
        <div className="max-h-[280px] overflow-y-auto p-1">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-semibold transition cursor-pointer",
                  isSelected
                    ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                    : "text-foreground hover:bg-[var(--brand-strong)]/50",
                )}
                aria-pressed={isSelected}
              >
                {renderOption ? renderOption(opt, isSelected) : opt.label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

