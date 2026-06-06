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
    listImages: (id: number, offset = 0, limit = 4) =>
      request<ImageListResponse>(`/dataset-versions/${id}/images?offset=${offset}&limit=${limit}`),
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

  experiments: {
    list: (projectId: number) =>
      request<Experiment[]>(`/experiments/?project_id=${projectId}`),
    get: (id: number) => request<Experiment>(`/experiments/${id}`),
    create: (body: {
      project_id: number;
      name: string;
      description?: string;
      trainer_type: string;
      server_id: string;
      datasets: { dataset_version_id: number; role: string; sampling_weight: number }[];
      sampling_strategy: string;
      pretrained_ckpt_id?: number | null;
      train_params: Record<string, unknown>;
    }) =>
      request<Experiment>('/experiments/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    cancel: (id: number) =>
      request<Experiment>(`/experiments/${id}/cancel`, { method: 'POST' }),
    delete: (id: number) =>
      request<void>(`/experiments/${id}`, { method: 'DELETE' }),
    trainerSchemas: () =>
      request<Record<string, { trainer_type: string; display_name: string }>>('/experiments/trainer-schemas'),
    trainerSchema: (trainerType: string) =>
      request<TrainerSchema>(`/experiments/trainer-schemas/${trainerType}`),
  },

  servers: {
    list: () => request<Server[]>('/servers/'),
    get: (id: number) => request<Server>(`/servers/${id}`),
    create: (body: {
      name: string;
      host: string;
      node_exporter_port?: number;
      cadvisor_port?: number;
      dcgm_exporter_port?: number | null;
      description?: string;
      gpu_count?: number;
      gpu_type?: string;
    }) =>
      request<Server>('/servers/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    update: (id: number, body: Partial<Omit<Server, 'id' | 'status' | 'created_at' | 'updated_at'>>) =>
      request<Server>(`/servers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    delete: (id: number) => request<void>(`/servers/${id}`, { method: 'DELETE' }),
    health: (id: number) =>
      request<{ server_id: number; host: string; status: string; checked_at: string }>(`/servers/${id}/health`),
    metrics: (id: number, includeContainers = false) =>
      request<ServerMetrics>(`/servers/${id}/metrics?include_containers=${includeContainers}`),
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

export interface DatasetImage {
  filename: string;
  key: string;
  url: string;
  size_bytes: number;
}

export interface ImageListResponse {
  items: DatasetImage[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
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

// ── Experiments ────────────────────────────────────────────────────────────

// ── Trainer param schema ────────────────────────────────────────────────────

export type ParamType = 'integer' | 'float' | 'boolean' | 'select' | 'string';

export interface ParamDef {
  key: string;
  label: string;
  type: ParamType;
  default: unknown;
  description: string;
  group: string;
  min?: number;
  max?: number;
  step?: number;
  options?: (string | number)[];
}

export interface TrainerSchema {
  trainer_type: string;
  display_name: string;
  description: string;
  params: ParamDef[];
  group_order: string[];
  group_labels: Record<string, string>;
}

export type ExperimentStatus = 'PENDING' | 'DOWNLOADING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type DatasetRole = 'TRAIN' | 'VALIDATION' | 'TEST';
export type SamplingStrategy = 'CONCAT' | 'WEIGHTED' | 'ROUND_ROBIN';

export interface ExperimentDataset {
  id: number;
  experiment_id: number;
  dataset_version_id: number;
  role: DatasetRole;
  sampling_weight: number;
}

export interface Experiment {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
  trainer_type: string;
  server_id: string;
  pretrained_ckpt_id: number | null;
  sampling_strategy: SamplingStrategy;
  train_params: Record<string, unknown>;
  status: ExperimentStatus;
  celery_task_id: string | null;
  metrics: Record<string, unknown> | null;
  output_ckpt_id: number | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  datasets?: ExperimentDataset[];
}

// ── Servers ────────────────────────────────────────────────────────────────

export interface Server {
  id: number;
  name: string;
  host: string;
  node_exporter_port: number;
  cadvisor_port: number;
  dcgm_exporter_port: number | null;
  description: string | null;
  gpu_count: number;
  gpu_type: string | null;
  status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
  created_at: string;
  updated_at: string;
}

export interface GpuMetrics {
  index: number;
  model: string;
  uuid: string | null;
  utilization_percent?: number;
  mem_copy_util_percent?: number;
  memory_used_mb?: number;
  memory_free_mb?: number;
  memory_total_mb?: number;
  memory_usage_percent?: number;
  temperature_celsius?: number;
  power_watts?: number;
  sm_clock_mhz?: number;
  mem_clock_mhz?: number;
  pcie_tx_kb_s?: number;
  pcie_rx_kb_s?: number;
}

export interface ServerMetrics {
  server_id: number;
  server_name: string;
  host: string;
  timestamp: string;
  online: boolean;
  cpu?: {
    core_count: number | null;
    load_avg_1m: number | null;
    load_avg_5m: number | null;
    load_avg_15m: number | null;
  };
  memory?: {
    total_bytes: number;
    used_bytes: number;
    free_bytes: number;
    usage_percent: number;
  };
  disks?: Array<{
    mountpoint: string;
    total_bytes: number;
    used_bytes: number;
    free_bytes: number;
    usage_percent: number;
  }>;
  gpus?: GpuMetrics[];
  network?: {
    receive_bytes_total: number;
    transmit_bytes_total: number;
  };
}
