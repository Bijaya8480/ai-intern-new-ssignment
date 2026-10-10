import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatDistance(date: string | Date): string {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

export function truncate(text: string | undefined, maxLen: number): string {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

export function formatNumber(n: number | undefined): string {
  if (n === undefined || n === null) return "0";
  return new Intl.NumberFormat("en-US").format(n);
}

export function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || "";
  return (parts[0][0] + parts[parts.length - 1][1]?.toUpperCase() || "").toUpperCase();
}

export function getTranslationStatusColor(status: string): string {
  const colors: Record<string, string> = {
    approved: "text-green-700 dark:text-green-400",
    edited: "text-amber-700 dark:text-amber-400",
    machine_translated: "text-blue-700 dark:text-blue-400",
    reviewed: "text-purple-700 dark:text-purple-400",
    pending: "text-muted-foreground",
    not_selected: "text-muted-foreground",
    selected: "text-indigo-700 dark:text-indigo-400",
    complete: "text-green-700 dark:text-green-400",
    partial: "text-amber-700 dark:text-amber-400",
    drafted: "text-muted-foreground",
    published: "text-purple-700 dark:text-purple-400",
  };
  return colors[status] || "text-muted-foreground";
}

export function getCrawlStatusColor(status: string): string {
  const colors: Record<string, string> = {
    crawled: "text-green-700 dark:text-green-400",
    failed: "text-red-700 dark:text-red-400",
    pending: "text-muted-foreground",
    running: "text-blue-700 dark:text-blue-400",
    completed: "text-green-700 dark:text-green-400",
    active: "text-green-700 dark:text-green-400",
  };
  return colors[status] || "text-muted-foreground";
}

export function statusColorClass(status: string): string {
  switch (status?.toLowerCase()) {
    case "approved":
    case "published":
    case "complete":
    case "success":
    case "crawled":
      return "bg-green-500";
    case "edited":
    case "partial":
      return "bg-amber-500";
    case "machine_translated":
      return "bg-blue-500";
    case "pending":
    case "not_selected":
    case "drafted":
      return "bg-gray-400";
    case "failed":
    case "error":
      return "bg-red-500";
    default:
      return "bg-gray-400";
  }
}
