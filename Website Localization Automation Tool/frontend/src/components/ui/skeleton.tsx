import { forwardRef } from "react";
import { cn } from "../../lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-muted",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Skeleton.displayName = "Skeleton";

// Re-export for backward compatibility with existing imports
export { EmptyState } from "./empty-state";
export { ErrorState } from "./error-state";
export type { EmptyStateProps } from "./empty-state";
export type { ErrorStateProps } from "./error-state";
