import { forwardRef } from "react";
import { cn } from "../../lib/utils";

export interface SeparatorProps extends React.HTMLAttributes<HTMLHRElement> {
  orientation?: "horizontal" | "vertical";
}

export const Separator = forwardRef<HTMLHRElement, SeparatorProps>(
  ({ className, orientation = "horizontal", ...props }, ref) => (
    <hr
      ref={ref}
      data-orientation={orientation}
      className={cn(
        "shrink-0 border-border bg-transparent",
        orientation === "horizontal"
          ? "h-px w-full border-t"
          : "w-px border-l",
        className
      )}
      {...props}
    />
  )
);
Separator.displayName = "Separator";
