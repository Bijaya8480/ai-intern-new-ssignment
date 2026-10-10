import { useEffect, useState } from "react";
import {
  Outlet,
  Link,
  useLocation,
  useParams,
  useNavigate,
} from "react-router-dom";
import { cn } from "../lib/utils";
import { ProjectsApi } from "../services/api";
import type { Project } from "../types";
import {
  LayoutDashboard,
  Globe,
  FileText,
  Rocket,
  Settings,
  BarChart3,
  ChevronRight,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { ProfileMenu } from "./profile-menu";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { statusBadgeVariant } from "./ui/badge";
import { Separator } from "./ui/separator";

interface NavItem {
  name: string;
  icon: React.ForwardRefExoticComponent<
    React.SVGProps<SVGSVGElement> & { title?: string }
  >;
  key: string;
}

const navItems: NavItem[] = [
  { name: "Dashboard", icon: LayoutDashboard, key: "dashboard" },
  { name: "Crawl", icon: Globe, key: "crawl" },
  { name: "Pages", icon: FileText, key: "pages" },
  { name: "Review", icon: BarChart3, key: "review" },
  { name: "Publish", icon: Rocket, key: "publish" },
];

const adminItems: NavItem[] = [
  { name: "Details", icon: BarChart3, key: "details" },
  { name: "Settings", icon: Settings, key: "settings" },
];

const crumbMap: Record<string, { label: string; icon?: React.ReactNode }> = {
  dashboard: { label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  crawl: { label: "Crawl Progress", icon: <Globe className="h-4 w-4" /> },
  pages: { label: "Website Analysis", icon: <FileText className="h-4 w-4" /> },
  review: { label: "Translation Review", icon: <BarChart3 className="h-4 w-4" /> },
  publish: { label: "Publish", icon: <Rocket className="h-4 w-4" /> },
  details: { label: "Project Details", icon: <BarChart3 className="h-4 w-4" /> },
  settings: { label: "Settings", icon: <Settings className="h-4 w-4" /> },
  edit: { label: "Translation Editor" },
};

export function ProjectLayout() {
  const location = useLocation();
  const { projectId } = useParams();
  const navigate = useNavigate();
  const pid = projectId!;
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    if (!projectId) return;
    ProjectsApi.get(projectId).then(setProject).catch(() => {});
  }, [projectId, location.pathname]);

  const handleDelete = async () => {
    if (!window.confirm("Delete this project? This cannot be undone.")) return;
    await ProjectsApi.delete(pid);
    navigate("/projects");
  };

  const currentKey = location.pathname.split("/").pop() || "dashboard";
  const crumb = crumbMap[currentKey] || { label: currentKey };
  if (location.pathname.includes("/edit/")) {
    crumb.label = "Translation Editor";
    crumb.icon = <FileText className="h-4 w-4" />;
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-surface border-r border-border flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-border">
          <Link to="/projects" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <BarChart3 className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold text-foreground text-sm">LocTool</span>
          </Link>
        </div>

        {project && (
          <div className="px-4 py-3 border-b border-border">
            <div className="text-sm font-medium text-foreground truncate">
              {project.name}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
              <span>→</span>
              <span>{project.target_language_name || project.target_language}</span>
              <Badge variant={statusBadgeVariant(project.status)} className="text-xs">
                {project.status}
              </Badge>
            </div>
          </div>
        )}

        <nav className="flex-1 p-2">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const to = `/project/${pid}/${item.key}`;
              const active = location.pathname.startsWith(to);
              return (
                <li key={item.key}>
                  <Link
                    to={to}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-border my-2" />

          <ul className="space-y-1">
            {adminItems.map((item) => {
              const to = `/project/${pid}/${item.key}`;
              const active = location.pathname.startsWith(to);
              return (
                <li key={item.key}>
                  <Link
                    to={to}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {project && (
          <div className="p-3 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Project
            </Button>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-surface border-b border-border h-14 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <nav
              aria-label="breadcrumb"
              className="flex items-center gap-1 text-sm text-muted-foreground"
            >
              <Link
                to="/projects"
                className="hover:text-foreground transition-colors"
              >
                Projects
              </Link>
              <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
              <span className="font-medium text-foreground">
                {project?.name || "Loading..."}
              </span>
              <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
              <span className="flex items-center gap-1.5">
                {crumb.icon}
                <span className="font-medium text-foreground">{crumb.label}</span>
              </span>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {project?.source_url && (
              <a
                href={project.source_url}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Open source website"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <ThemeToggle />
            <ProfileMenu />
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
