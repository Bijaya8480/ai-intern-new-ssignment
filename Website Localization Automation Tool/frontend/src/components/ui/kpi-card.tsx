import { forwardRef } from "react";
import { cn } from "../../lib/utils";

export interface KPICardProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
}

export const KPICard = forwardRef<HTMLDivElement, KPICardProps>(
  ({ className, icon, label, value, sub, trend, trendLabel, ...props }, ref) => {
    const TrendIcon = trend === "up" ? "↗" : trend === "down" ? "↘" : null;

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl bg-surface border border-border p-5",
          "transition-all duration-200",
          className
        )}
        {...props}
      >
        <div className="flex items-center gap-3">
          {icon && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              {icon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold text-foreground mt-0.5 truncate">
              {value}
            </p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
            {trend && trendLabel && (
              <div className="flex items-center gap-1 mt-1">
                <span
                  className={cn(
                    "text-xs font-medium",
                    trend === "up"
                      ? "text-green-600 dark:text-green-400"
                      : trend === "down"
                      ? "text-red-600 dark:text-red-400"
                      : "text-muted-foreground"
                  )}
                >
                  {TrendIcon} {trendLabel}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);
KPICard.displayName = "KPICard";
