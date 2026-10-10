import { forwardRef } from "react";
import { cn } from "../../lib/utils";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", asChild = false, ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

    const variants: Record<ButtonVariant, string> = {
      primary:
        "bg-primary text-primary-foreground hover:bg-primary/90 shadow-subtle hover:shadow-subtle-md",
      secondary:
        "bg-muted text-foreground hover:bg-muted/70 shadow-subtle hover:shadow-subtle-md",
      outline:
        "border border-border bg-transparent hover:bg-muted text-foreground",
      ghost:
        "bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground",
      destructive:
        "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-subtle hover:shadow-subtle-md",
    };

    const sizes: Record<ButtonSize, string> = {
      sm: "h-8 px-3 text-xs",
      md: "h-9 px-4 text-sm",
      lg: "h-11 px-6 text-base",
      icon: "h-9 w-9 p-0",
    };

    if (asChild) {
      const { children, ...rest } = props as any;
      const Comp = (props as any).as || "span";
      return (
        <Comp
          className={cn(base, variants[variant], className)}
          ref={ref}
          {...rest}
        >
          {children}
        </Comp>
      );
    }

    return (
      <button
        type="button"
        className={cn(base, variants[variant], sizes[size], className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
