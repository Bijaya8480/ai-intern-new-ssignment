import { forwardRef } from "react";
import { cn } from "../../lib/utils";
import { Check, ChevronDown } from "lucide-react";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, placeholder, children, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-foreground mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            className={cn(
              "flex h-10 w-full appearance-none rounded-lg border border-border",
              "bg-surface px-3 py-2 text-sm text-foreground",
              "placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "pr-9",
              error && "border-destructive focus:ring-destructive",
              className
            )}
            ref={ref}
            {...props}
          >
            {placeholder && (
              <option value="" disabled hidden>
                {placeholder}
              </option>
            )}
            {children}
          </select>
          <ChevronDown
            className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
        </div>
      </div>
    );
  }
);
Select.displayName = "Select";

export interface OptionProps {
  value: string;
  label: string;
  disabled?: boolean;
}

export const SelectOption = ({ value, label, disabled }: OptionProps) => (
  <option value={value} disabled={disabled}>
    {label}
  </option>
);
