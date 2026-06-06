import { Outlet, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, type Project } from '../lib/api';
import { ProjectSubSidebar } from './ProjectSubSidebar';

export function ProjectLayout() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    api.projects.get(projectId).then(setProject).catch(() => {});
  }, [projectId]);

  return (
    <div className="flex flex-1 min-h-screen">
      <ProjectSubSidebar projectId={projectId} projectName={project?.name} />

      <main className="flex-1 overflow-y-auto bg-mesh">
        <div className="max-w-5xl mx-auto w-full px-12 py-12 lg:px-20 lg:py-14">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
