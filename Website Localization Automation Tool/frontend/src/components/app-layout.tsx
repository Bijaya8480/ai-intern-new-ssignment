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
  Plus,
  Globe,
  FileText,
  Rocket,
  Settings,
  BarChart3,
  Trash2,
  ExternalLink,
  Menu,
} from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { ProfileMenu } from "./profile-menu";
import { Button } from "./ui/button";
import { Badge, statusBadgeVariant } from "./ui/badge";
import { Separator } from "./ui/separator";
import { Tooltip } from "./ui/tooltip";
import { Breadcrumbs } from "./ui/page-header";
import { GlobalSearch } from "./global-search";
import { LanguageSwitcher } from "./language-switcher";
import { useSidebar } from "../lib/sidebar-store";

interface NavItem {
  name: string;
  icon: React.ForwardRefExoticComponent<
    React.SVGProps<SVGSVGElement> & { title?: string }
  >;
  key: string;
}

const rootNavItems: NavItem[] = [
  { name: "Dashboard", icon: LayoutDashboard, key: "dashboard" },
  { name: "Create Project", icon: Plus, key: "create" },
];

const projectNavItems: NavItem[] = [
  { name: "Dashboard", icon: LayoutDashboard, key: "dashboard" },
  { name: "Crawl", icon: Globe, key: "crawl" },
  { name: "Pages", icon: FileText, key: "pages" },
  { name: "Review", icon: BarChart3, key: "review" },
  { name: "Publish", icon: Rocket, key: "publish" },
];

const adminNavItems: NavItem[] = [
  { name: "Details", icon: BarChart3, key: "details" },
  { name: "Settings", icon: Settings, key: "settings" },
];

const breadcrumbMap: Record<string, string> = {
  dashboard: "Dashboard",
  crawl: "Crawl Progress",
  pages: "Website Analysis",
  edit: "Translation Editor",
  review: "Translation Review",
  publish: "Publish",
  details: "Project Details",
  settings: "Settings",
  projects: "Dashboard",
  create: "Create Project",
};

export function AppLayout() {
  const { collapsed, toggle } = useSidebar();
  const { projectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isProject = !!projectId;
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    if (!projectId) return;
    ProjectsApi.get(projectId)
      .then(setProject)
      .catch(() => {});
  }, [projectId]);

  const handleDelete = async () => {
    if (!projectId) return;
    if (!window.confirm("Delete this project? This cannot be undone.")) return;
    await ProjectsApi.delete(projectId);
    navigate("/projects");
  };

  const currentKey = isProject
    ? location.pathname.split("/").pop() || "dashboard"
    : location.pathname.split("/")[1] || "dashboard";

  const breadcrumbItems = isProject
    ? [
        { label: "Projects", href: "/projects" },
        { label: project?.name || "Loading…" },
        { label: breadcrumbMap[currentKey] || currentKey },
      ]
    : [{ label: breadcrumbMap[currentKey] || "Dashboard" }];

  const navItems = isProject ? projectNavItems : rootNavItems;

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && e.ctrlKey) {
      // placeholder for global search activation
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f7fb]">
      {/* Sidebar */}
      <aside
        className={cn(
          "relative z-20 flex flex-col border-r border-slate-800 bg-[#111827] text-slate-100 transition-all duration-200",
          collapsed ? "w-[68px]" : "w-64"
        )}
      >
        {/* Logo / Brand */}
        <div className="h-[68px] flex items-center gap-3 px-5 border-b border-slate-800/90">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500 shadow-lg shadow-blue-950/30">
            <Globe className="h-[18px] w-[18px] text-white" />
          </div>
          {!collapsed && (
            <div>
              <span className="block font-semibold tracking-tight text-white">LocTool</span>
              <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Localization</span>
            </div>
          )}
        </div>

        {isProject && project && (
          <div className="mx-3 mt-5 mb-3 rounded-xl border border-slate-700/70 bg-white/[0.035] p-3">
            {!collapsed ? (
              <>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Current project
                </div>
                <div className="text-sm font-semibold text-slate-100 truncate">
                  {project.name}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-xs text-slate-400">
                    {project.target_language_name || project.target_language}
                  </span>
                  <Badge
                    variant={statusBadgeVariant(project.status)}
                    className="text-xs"
                  >
                    {project.status}
                  </Badge>
                </div>
              </>
            ) : (
              <div className="flex justify-center" title={project.name}>
                <span className="text-xs font-medium text-slate-200">
                  {project.name?.[0] || "?"}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3">
          {!collapsed && <div className="px-5 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Workspace</div>}
          <ul className="space-y-1 px-3">
             {navItems.map((item) => {
               const Icon = item.icon;
               const to = isProject
                 ? `/project/${projectId}/${item.key}`
                 : `/${item.key}`;
               const active = location.pathname.startsWith(to);
               return (
                 <li key={item.key}>
                   <Tooltip content={item.name} side="right" delayMs={300}>
                     <Link
                       to={to}
                       className={cn(
                         "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all",
                         active
                           ? "bg-blue-500/15 text-blue-200 shadow-inner shadow-blue-200/5"
                           : "text-slate-400 hover:bg-white/5 hover:text-slate-50"
                       )}
                     >
                       <Icon className="h-4 w-4 shrink-0" />
                       {!collapsed && <span>{item.name}</span>}
                     </Link>
                   </Tooltip>
                 </li>
               );
             })}
          </ul>

          {isProject && (
            <>
              <Separator className="my-4 border-slate-800" />
              {!collapsed && <div className="px-5 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Manage</div>}
              <ul className="space-y-1 px-3">
                {adminNavItems.map((item) => {
                  const Icon = item.icon;
                  const to = `/project/${projectId}/${item.key}`;
                  const active = location.pathname.startsWith(to);
                  return (
                    <li key={item.key}>
                      <Tooltip content={item.name} side="right" delayMs={300}>
                        <Link
                          to={to}
                          className={cn(
                            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all",
                            active
                              ? "bg-blue-500/15 text-blue-200 shadow-inner shadow-blue-200/5"
                              : "text-slate-400 hover:bg-white/5 hover:text-slate-50"
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {!collapsed && <span>{item.name}</span>}
                        </Link>
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </nav>

        {/* Delete Project */}
        <div className="p-3 border-t border-slate-800">
          {isProject && project && (
            <Tooltip content="Delete project" side="right" delayMs={300}>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-red-300 hover:text-red-200 hover:bg-red-400/10"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4" />
                {!collapsed && <span>Delete Project</span>}
              </Button>
            </Tooltip>
          )}
          {!isProject && (
            <Tooltip content={collapsed ? "Expand sidebar" : "Collapse sidebar"} side="right" delayMs={300}>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center text-slate-400 hover:bg-white/5 hover:text-slate-50"
                onClick={toggle}
              >
                <Menu className="h-4 w-4" />
              </Button>
            </Tooltip>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Nav */}
        <header className="h-[68px] flex-shrink-0 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-5 backdrop-blur">
          <div className="flex items-center gap-3">
            <Tooltip content={collapsed ? "Expand sidebar" : "Collapse sidebar"} side="bottom" delayMs={300}>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 rounded-xl border border-slate-200 bg-white p-0 text-slate-600 shadow-sm hover:bg-slate-50"
                onClick={toggle}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <Menu className="h-4 w-4" />
              </Button>
            </Tooltip>

            <div className="hidden sm:block">
              <Breadcrumbs items={breadcrumbItems} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <GlobalSearch />
            {isProject && project?.source_url && (
              <Tooltip content="Open source website" side="bottom" delayMs={300}>
                <a
                  href={project.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Tooltip>
            )}
            <ThemeToggle />
            <ProfileMenu />
          </div>
        </header>

        <main className="workspace-grid flex-1 overflow-auto bg-[#f5f7fb]">
          <div className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
