import { forwardRef } from "react";
import { cn } from "../../lib/utils";
import { X } from "lucide-react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

export function Modal({ open, onClose, title, description, children, footer, size = "md" }: ModalProps) {
  if (!open) return null;

  const sizes = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={cn(
          "relative w-full bg-surface border border-border shadow-subtle-xl rounded-xl",
          "data-[state=open]:data-[state=open]:animate-in data-[state=closed]:data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          sizes[size]
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            {description && (
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            )}
          </div>
        )}
        <div className={cn("px-6 py-4", !title && "pt-6")}>
          {children}
        </div>
        {footer && (
          <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
            {footer}
          </div>
        )}
        <button
          onClick={onClose}
          className={cn(
            "absolute top-3 right-3 rounded-lg p-1.5 text-muted-foreground",
            "hover:bg-muted hover:text-foreground transition-colors"
          )}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
