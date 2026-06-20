import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { ProjectLayout } from './components/ProjectLayout';
import { ProjectsPage } from './pages/ProjectsPage';
import { ServersPage } from './pages/ServersPage';
import { TrainersPage } from './pages/TrainersPage';
import { VisualizePage } from './pages/VisualizePage';
import { DatasetsPage } from './pages/project/DatasetsPage';
import { DatasetDetailPage } from './pages/project/DatasetDetailPage';
import { ProjectCheckpointsPage } from './pages/project/ProjectCheckpointsPage';
import { ExperimentsPage } from './pages/project/ExperimentsPage';
import { ModelsPage } from './pages/project/ModelsPage';
import { TasksPage } from './pages/project/TasksPage';
import { EvaluationPage } from './pages/project/EvaluationPage';
import { VisualizationsPage } from './pages/project/VisualizationsPage';
import { LangProvider } from './contexts/LangContext';

function AppShell() {
  const { pathname } = useLocation();
  const insideProject = /^\/projects\/\d+/.test(pathname);

  return (
    <div className="flex min-h-screen bg-[#09090b]">
      {!insideProject && <Sidebar />}

      <div className="flex-1 flex min-h-screen overflow-hidden">
        <Routes>
          {/* Top-level routes */}
          <Route path="/" element={<PageShell><ProjectsPage /></PageShell>} />
          <Route path="/servers"   element={<PageShell><ServersPage /></PageShell>} />
          <Route path="/trainers"  element={<PageShell><TrainersPage /></PageShell>} />
          <Route path="/visualize" element={<PageShell><VisualizePage /></PageShell>} />

          {/* Project routes — ProjectLayout renders sub-sidebar + <Outlet /> */}
          <Route path="/projects/:id" element={<ProjectLayout />}>
            <Route index element={<Navigate to="datasets" replace />} />
            <Route path="datasets"        element={<DatasetsPage />} />
            <Route path="datasets/:dvId"  element={<DatasetDetailPage />} />
            <Route path="checkpoints"     element={<ProjectCheckpointsPage />} />
            <Route path="models"          element={<ModelsPage />} />
            <Route path="experiments"     element={<ExperimentsPage />} />
            <Route path="tasks"           element={<TasksPage />} />
            <Route path="evaluation"      element={<EvaluationPage />} />
            <Route path="visualize"       element={<VisualizationsPage />} />
          </Route>
        </Routes>
      </div>
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 overflow-y-auto bg-mesh">
      <div className="max-w-5xl mx-auto w-full px-12 py-12 lg:px-20 lg:py-14">
        {children}
      </div>
    </main>
  );
}

export default function App() {
  return (
    <LangProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </LangProvider>
  );
}
