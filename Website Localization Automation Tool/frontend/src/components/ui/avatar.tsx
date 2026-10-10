import { forwardRef } from "react";
import { cn } from "../../lib/utils";
import { getInitials } from "../../lib/utils";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name?: string;
  src?: string;
  size?: "xs" | "sm" | "md" | "lg";
  status?: "online" | "offline" | "busy" | "away";
}

const sizeMap: Record<NonNullable<AvatarProps["size"]>, string> = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, name, src, size = "md", status }, ref) => {
    const statusColor = {
      online: "bg-green-500",
      offline: "bg-gray-400",
      busy: "bg-red-500",
      away: "bg-amber-500",
    };
    const statusSize = {
      xs: "h-1 w-1",
      sm: "h-1.5 w-1.5",
      md: "h-2 w-2",
      lg: "h-2.5 w-2.5",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "relative inline-flex items-center justify-center rounded-full font-medium",
          "bg-muted text-muted-foreground shrink-0",
          sizeMap[size],
          className
        )}
        aria-label={name}
      >
        {src ? (
          <img
            src={src}
            alt={name || "Avatar"}
            className="h-full w-full rounded-full object-cover"
          />
        ) : (
          getInitials(name || "") || "•"
        )}
        {status && (
          <span
            className={cn(
              "absolute bottom-0 right-0 rounded-full border-2 border-surface",
              statusColor[status],
              statusSize[size]
            )}
            aria-hidden="true"
          />
        )}
      </div>
    );
  }
);
Avatar.displayName = "Avatar";
