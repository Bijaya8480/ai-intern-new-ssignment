import { forwardRef } from "react";
import { cn } from "../../lib/utils";

export type ProgressColor = "primary" | "success" | "warning" | "destructive";
export type ProgressSize = "sm" | "md" | "lg";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  size?: ProgressSize;
  color?: ProgressColor;
}

const barSizes: Record<ProgressSize, string> = {
  sm: "h-1",
  md: "h-2",
  lg: "h-4",
};

const progressColors: Record<ProgressColor, string> = {
  primary: "bg-primary",
  success: "bg-green-500 dark:bg-green-400",
  warning: "bg-amber-500 dark:bg-amber-400",
  destructive: "bg-red-500 dark:bg-red-400",
};

export const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, size = "md", color = "primary", ...props }, ref) => {
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    const colorClass = progressColors[color];

    return (
      <div
        ref={ref}
        className={cn(
          "relative w-full overflow-hidden rounded-full bg-muted",
          barSizes[size],
          className
        )}
        {...props}
      >
        <div
          className={cn(
            "h-full w-full flex-1 transition-all duration-300 ease-out",
            colorClass
          )}
          style={{ width: `${pct}%`, minWidth: pct > 0 ? "2px" : "0" }}
        />
      </div>
    );
  }
);
Progress.displayName = "Progress";
