import { forwardRef } from "react";
import { cn } from "../../lib/utils";
import { CheckCircle2, XCircle, AlertCircle, Clock } from "lucide-react";

export type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "pending"
  | "outline";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  icon?: boolean;
}

const badgeIcons: Record<BadgeVariant, React.ReactNode> = {
  default: <CheckCircle2 className="h-3 w-3" />,
  success: <CheckCircle2 className="h-3 w-3" />,
  warning: <AlertCircle className="h-3 w-3" />,
  error: <XCircle className="h-3 w-3" />,
  info: <Clock className="h-3 w-3" />,
  pending: <Clock className="h-3 w-3" />,
  outline: null,
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", icon = false, children, ...props }, ref) => {
    const base =
      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium";

    const variants: Record<BadgeVariant, string> = {
      default:
        "bg-muted text-muted-foreground",
      success:
        "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400",
      warning:
        "bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400",
      error:
        "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400",
      info:
        "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400",
      pending:
        "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
      outline:
        "border border-border bg-transparent text-muted-foreground",
    };

    return (
      <span
        className={cn(base, variants[variant], className)}
        ref={ref}
        {...props}
      >
        {icon && badgeIcons[variant]}
        {children}
      </span>
    );
  }
);
Badge.displayName = "Badge";

export function statusBadgeVariant(status: string): BadgeVariant {
  switch (status?.toLowerCase()) {
    case "approved":
    case "published":
    case "complete":
    case "success":
      return "success";
    case "edited":
    case "partial":
      return "warning";
    case "machine_translated":
      return "info";
    case "pending":
    case "not_selected":
    case "drafted":
      return "pending";
    case "failed":
    case "error":
      return "error";
    default:
      return "default";
  }
}
