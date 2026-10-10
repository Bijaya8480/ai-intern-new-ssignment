import { Link } from "react-router-dom";
import { useTheme } from "./theme-provider";
import { Dropdown } from "./ui/dropdown";
import { Avatar } from "./ui/avatar";
import {
  User, Sun, Moon, Settings, LogOut, BarChart3,
} from "lucide-react";

const DROPDOWN_ITEMS = [
  { label: "Profile", icon: User, to: "#" },
  { label: "Settings", icon: Settings, to: "/settings" },
  { label: "Billing", icon: BarChart3, to: "#" },
];

export function ProfileMenu() {
  const { toggleTheme, theme } = useTheme();

  return (
    <Dropdown
      align="right"
      trigger={
        <div className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted cursor-pointer transition-colors">
          <Avatar name="Account" size="sm" />
          <span className="hidden sm:block text-sm font-medium text-foreground">
            Account
          </span>
        </div>
      }
    >
      <div className="py-1">
        {DROPDOWN_ITEMS.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
            onClick={() => {}}
          >
            <item.icon className="h-4 w-4 text-muted-foreground" />
            <span>{item.label}</span>
          </Link>
        ))}
        <div className="border-t border-border my-1" />
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
        >
          {theme === "light" ? (
            <Moon className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Sun className="h-4 w-4 text-muted-foreground" />
          )}
          <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
        </button>
        <div className="border-t border-border my-1" />
        <button
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-muted transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </Dropdown>
  );
}
