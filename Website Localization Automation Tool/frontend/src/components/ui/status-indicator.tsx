import { forwardRef } from "react";
import { cn } from "../../lib/utils";
import { CheckCircle, Clock, XCircle, AlertCircle, Zap } from "lucide-react";

export type StatusType =
  | "success"
  | "warning"
  | "error"
  | "info"
  | "pending"
  | "neutral";

export interface StatusIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  status: StatusType;
  label?: string;
  dotOnly?: boolean;
}

const statusConfig: Record<StatusType, { color: string; icon: React.ReactNode }> = {
  success: { color: "bg-green-500", icon: <CheckCircle className="h-3 w-3" /> },
  warning: { color: "bg-amber-500", icon: <AlertCircle className="h-3 w-3" /> },
  error: { color: "bg-red-500", icon: <XCircle className="h-3 w-3" /> },
  info: { color: "bg-indigo-500", icon: <Zap className="h-3 w-3" /> },
  pending: { color: "bg-gray-400 dark:bg-gray-500", icon: <Clock className="h-3 w-3" /> },
  neutral: { color: "bg-gray-400 dark:bg-gray-500", icon: <Clock className="h-3 w-3" /> },
};

export const StatusIndicator = forwardRef<HTMLDivElement, StatusIndicatorProps>(
  ({ className, status, label, dotOnly = false, ...props }, ref) => {
    const cfg = statusConfig[status];
    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1.5",
          dotOnly ? "text-muted-foreground" : "text-foreground",
          className
        )}
        {...props}
      >
        <span
          className={cn("h-2 w-2 rounded-full", cfg.color)}
          aria-hidden="true"
        />
        {label && (
          <span className={cn("text-sm", dotOnly && "text-muted-foreground")}>
            {label}
          </span>
        )}
      </div>
    );
  }
);
StatusIndicator.displayName = "StatusIndicator";
