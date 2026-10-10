import { Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./components/app-layout";
import { SidebarProvider } from "./lib/sidebar-store";
import { SearchProvider } from "./lib/search-context";
import Dashboard from "./pages/Dashboard";
import ProjectDashboard from "./pages/ProjectDashboard";
import CreateProject from "./pages/CreateProject";
import CrawlProgressPage from "./pages/CrawlProgress";
import WebsiteAnalysis from "./pages/WebsiteAnalysis";
import TranslationEditor from "./pages/TranslationEditor";
import TranslationReview from "./pages/TranslationReview";
import Publish from "./pages/Publish";
import Settings from "./pages/Settings";
import ProjectDetails from "./pages/ProjectDetails";

export default function App() {
  return (
    <SearchProvider>
      <SidebarProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/projects" replace />} />
            <Route path="projects" element={<Dashboard />} />
            <Route path="create" element={<CreateProject />} />

            <Route path="project/:projectId">
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<ProjectDashboard />} />
              <Route path="crawl" element={<CrawlProgressPage />} />
              <Route path="pages" element={<WebsiteAnalysis />} />
              <Route path="edit/:pageId" element={<TranslationEditor />} />
              <Route path="review" element={<TranslationReview />} />
              <Route path="publish" element={<Publish />} />
              <Route path="settings" element={<Settings />} />
              <Route path="details" element={<ProjectDetails />} />
            </Route>

            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Route>
        </Routes>
      </SidebarProvider>
    </SearchProvider>
  );
}
