import { forwardRef } from "react";
import { cn } from "../../lib/utils";
import { AlertCircle } from "lucide-react";
import { Button } from "./button";

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  action?: { label: string; onClick: () => void };
}

export const ErrorState = forwardRef<HTMLDivElement, ErrorStateProps>(
   ({ className, title = "Something went wrong", message, onRetry, retryLabel = "Try Again", action, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center justify-center text-center py-12 px-6",
          className
        )}
        {...props}
      >
        <div className="mb-4 text-destructive">
          <AlertCircle className="h-10 w-10" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-sm mb-6">{message}</p>
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            {retryLabel}
          </Button>
        )}
        {action && (
          <Button onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
    );
  }
);
ErrorState.displayName = "ErrorState";
