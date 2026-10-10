import { forwardRef } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { ChevronRight } from "lucide-react";

export interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: { label: string; onClick: () => void; icon?: React.ReactNode; disabled?: boolean; loading?: boolean };
  children?: React.ReactNode;
}

export const PageHeader = forwardRef<HTMLDivElement, PageHeaderProps>(
  ({ title, description, icon, action, children }, ref) => {
    return (
      <div ref={ref} className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          {icon && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              {icon}
            </div>
          )}
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {children}
          {action && (
            <Button
              onClick={action.onClick}
              disabled={action.disabled || action.loading}
            >
              {action.loading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  {action.label}
                </div>
              ) : (
                <>
                  {action.icon}
                  {action.label}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    );
  }
);
PageHeader.displayName = "PageHeader";

export interface BreadcrumbsProps {
  items: Array<{ label: string; href?: string }>;
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
          {item.href && i < items.length - 1 ? (
            <a
              href={item.href}
              className="hover:text-foreground transition-colors"
            >
              {item.label}
            </a>
          ) : (
            <span
              className={cn(
                i === items.length - 1 ? "font-medium text-foreground" : ""
              )}
            >
              {item.label}
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}
