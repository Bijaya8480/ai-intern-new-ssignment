import { forwardRef } from "react";
import { cn } from "../../lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "flat" | "bordered";
}

const cardVariants: Record<NonNullable<CardProps["variant"]>, string> = {
  default: "shadow-subtle border border-border",
  flat: "border border-border",
  bordered: "border-2 border-border shadow-none",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const base = "rounded-xl bg-surface text-foreground transition-colors";
    return (
      <div
        className={cn(base, cardVariants[variant], className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Card.displayName = "Card";

export const CardHeader = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      className={cn("px-6 py-4 border-b border-border", className)}
      ref={ref}
      {...props}
    />
  )
);
CardHeader.displayName = "CardHeader";

export const CardContent = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div className={cn("px-6 py-4", className)} ref={ref} {...props} />
  )
);
CardContent.displayName = "CardContent";

export const CardFooter = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      className={cn("px-6 py-4 border-t border-border flex justify-end gap-2", className)}
      ref={ref}
      {...props}
    />
  )
);
CardFooter.displayName = "CardFooter";

export const CardTitle = forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      className={cn("text-lg font-semibold text-foreground", className)}
      ref={ref}
      {...props}
    />
  )
);
CardTitle.displayName = "CardTitle";

export const CardDescription = forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      className={cn("text-sm text-muted-foreground", className)}
      ref={ref}
      {...props}
    />
  )
);
CardDescription.displayName = "CardDescription";
