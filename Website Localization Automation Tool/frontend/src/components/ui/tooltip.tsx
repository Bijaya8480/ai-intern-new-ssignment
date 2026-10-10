import { useState, useRef, useEffect, ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  delayMs?: number;
}

export function Tooltip({ content, children, side = "top", align = "center", delayMs = 0 }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const clearTimeouts = () => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleOpen = () => {
    clearTimeouts();
    openTimer.current = window.setTimeout(() => setOpen(true), delayMs);
  };

  const scheduleClose = () => {
    clearTimeouts();
    closeTimer.current = window.setTimeout(() => setOpen(false), delayMs);
  };

  useEffect(() => {
    return clearTimeouts;
  }, []);

  const handleMouseEnter = () => {
    if (delayMs > 0) scheduleOpen();
    else setOpen(true);
  };
  const handleMouseLeave = () => {
    if (delayMs > 0) scheduleClose();
    else setOpen(false);
  };

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-block cursor-pointer"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </span>
      {open && (
        <TooltipPortal content={content} side={side} align={align} triggerRef={triggerRef} />
      )}
    </>
  );
}

function TooltipPortal({
  content,
  side,
  align,
  triggerRef,
}: {
  content: ReactNode;
  side: "top" | "bottom" | "left" | "right";
  align: "start" | "center" | "end";
  triggerRef: React.RefObject<HTMLElement | null> | React.RefObject<HTMLSpanElement>;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const tooltipW = 200;
    const tooltipH = 36;
    let top = 0;
    let left = 0;

    switch (side) {
      case "top":
        top = rect.top - tooltipH - 8;
        break;
      case "bottom":
        top = rect.bottom + 8;
        break;
      case "left":
        top = rect.top;
        left = rect.left - tooltipW - 8;
        break;
      case "right":
        top = rect.top;
        left = rect.right + 8;
        break;
    }

    if (side === "top" || side === "bottom") {
      if (align === "start") left = rect.left;
      if (align === "end") left = rect.right - tooltipW;
      if (align === "center") left = rect.left + (rect.width - tooltipW) / 2;
    }

    top = Math.max(8, top);
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipW - 8));

    setPos({ top, left });
  }, [triggerRef, side, align]);

  const offset = window.scrollY;

  return (
    <div
      className={cn(
        "fixed z-50 pointer-events-none",
        "px-2 py-1.5 rounded-md",
        "bg-popover text-popover-foreground",
        "border border-border",
        "text-xs font-medium",
        "shadow-subtle-lg",
        "animate-in fade-in-0 zoom-in-95",
      )}
      style={{ top: `${pos.top + offset}px`, left: pos.left }}
    >
      {content}
    </div>
  );
}
