import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { CheckpointsPage } from './pages/CheckpointsPage';
import { LangProvider } from './contexts/LangContext';

export default function App() {
  return (
    <LangProvider>
      <BrowserRouter>
        <div className="flex min-h-screen bg-[#0a0f1a]">
          <Sidebar />
          <main className="flex-1 py-12 px-8 md:px-16 overflow-y-auto bg-gradient-to-br from-[#0a0f1a] via-[#0e1629] to-[#070b13]">
            <div className="max-w-7xl mx-auto w-full">
              <Routes>
                <Route path="/" element={<ProjectsPage />} />
                <Route path="/projects/:id" element={<ProjectDetailPage />} />
                <Route path="/checkpoints" element={<CheckpointsPage />} />
              </Routes>
            </div>
          </main>
        </div>
      </BrowserRouter>
    </LangProvider>
  );
}
