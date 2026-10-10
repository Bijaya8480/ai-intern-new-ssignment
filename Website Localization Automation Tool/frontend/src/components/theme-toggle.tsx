import { useTheme } from "./theme-provider";
import { Sun, Moon } from "lucide-react";
import { cn } from "../lib/utils";

export function ThemeToggle() {
  const { toggleTheme, theme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground",
        "hover:bg-muted hover:text-foreground transition-colors"
      )}
      aria-label={theme === "light" ? "Enable dark mode" : "Enable light mode"}
    >
      {theme === "light" ? (
        <Moon className="h-4 w-4" />
      ) : (
        <Sun className="h-4 w-4" />
      )}
    </button>
  );
}
