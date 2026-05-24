const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, options);
  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Projects ──────────────────────────────────────────────────────────────────

export interface Label {
  name: string;
  color?: string;
  [key: string]: unknown;
}

export interface Project {
  id: number;
  name: string;
  labels: Label[];
  created_at: string;
  updated_at: string;
}

export const api = {
  projects: {
    list: () => request<Project[]>('/projects/'),
    get: (id: number) => request<Project>(`/projects/${id}`),
    create: (name: string, labels: Label[]) =>
      request<Project>('/projects/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, labels }),
      }),
  },

  // ── Dataset Versions ───────────────────────────────────────────────────────

  datasetVersions: {
    list: (projectId?: number) => {
      const qs = projectId ? `?project_id=${projectId}` : '';
      return request<DatasetVersion[]>(`/dataset-versions/${qs}`);
    },
    get: (id: number) => request<DatasetVersion>(`/dataset-versions/${id}`),
    create: (form: FormData) =>
      request<DatasetVersion>('/dataset-versions/', { method: 'POST', body: form }),
    update: (id: number, body: { name?: string; version?: string; description?: string }) =>
      request<DatasetVersion>(`/dataset-versions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    delete: (id: number) => request<void>(`/dataset-versions/${id}`, { method: 'DELETE' }),
    uploadLabels: (id: number, files: File[]) => {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      return request<DatasetVersion>(`/dataset-versions/${id}/upload-labels`, {
        method: 'POST',
        body: form,
      });
    },
  },

  // ── Checkpoints ────────────────────────────────────────────────────────────

  checkpoints: {
    list: (projectId?: number) => {
      const qs = projectId ? `?project_id=${projectId}` : '';
      return request<Checkpoint[]>(`/checkpoints/${qs}`);
    },
    get: (id: number) => request<Checkpoint>(`/checkpoints/${id}`),
    upload: (form: FormData) =>
      request<Checkpoint>('/checkpoints/', { method: 'POST', body: form }),
    delete: (id: number) => request<void>(`/checkpoints/${id}`, { method: 'DELETE' }),
  },
};

export interface DatasetVersion {
  id: number;
  project_id: number;
  name: string;
  version: string;
  description?: string;
  storage_path: string;
  label_type: 'unlabeled' | 'human';
  created_at: string;
  updated_at: string;
}

export interface Checkpoint {
  id: number;
  project_id: number;
  experiment_id?: number;
  name: string;
  source: 'pretrained' | 'experiment';
  file_path: string;
  metrics?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
