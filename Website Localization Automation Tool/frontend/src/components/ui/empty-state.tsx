import { forwardRef } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  actionVariant?: "primary" | "secondary" | "outline" | "ghost" | "destructive";
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon, title, description, action, actionVariant = "primary", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center justify-center text-center py-12 px-6",
          className
        )}
        {...props}
      >
        {icon && (
          <div className="mb-4 text-muted-foreground/60">{icon}</div>
        )}
        <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground max-w-sm mb-6">{description}</p>
        )}
        {action && (
          <Button variant={actionVariant} onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
    );
  }
);
EmptyState.displayName = "EmptyState";
