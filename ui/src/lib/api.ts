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
  description: string | null;
  labels: Label[];
  created_at: string;
  updated_at: string;
}

export const api = {
  projects: {
    list: () => request<Project[]>('/projects/'),
    get: (id: number) => request<Project>(`/projects/${id}`),
    create: (name: string, labels: Label[], description?: string) =>
      request<Project>('/projects/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, labels, description }),
      }),
    update: (id: number, body: { name?: string; labels?: Label[]; description?: string }) =>
      request<Project>(`/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
    uploadFiles: (id: number, files: File[]) => {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      return request<{ uploaded: string[]; count: number }>(`/dataset-versions/${id}/files`, {
        method: 'POST',
        body: form,
      });
    },
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
    downloadUrl: (id: number) => `${BASE_URL}/dataset-versions/${id}/download`,
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
    getDownloadUrl: (id: number) =>
      request<{ url: string; filename: string; expires_seconds: number }>(`/checkpoints/${id}/download-url`),
  },

  // ── Trainers ───────────────────────────────────────────────────────────────

  trainers: {
    list: () => request<Trainer[]>('/trainers/'),
    get: (id: number) => request<Trainer>(`/trainers/${id}`),
    getDocs: async (key: string): Promise<string> => {
      const res = await fetch(`${BASE_URL}/trainers/${key}/docs`);
      if (!res.ok) throw new Error('Docs not found');
      return res.text();
    },
  },

  // ── ML Models ──────────────────────────────────────────────────────────────

  mlModels: {
    list: (projectId: number) => request<MLModel[]>(`/ml-models/?project_id=${projectId}`),
    get: (id: number) => request<MLModel>(`/ml-models/${id}`),
    create: (body: { project_id: number; trainer_id: number; name: string; description?: string }) =>
      request<MLModel>('/ml-models/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    delete: (id: number) => request<void>(`/ml-models/${id}`, { method: 'DELETE' }),
  },

  // ── Experiments ────────────────────────────────────────────────────────────

  experiments: {
    list: (projectId: number) =>
      request<Experiment[]>(`/experiments/?project_id=${projectId}`),
    get: (id: number) => request<Experiment>(`/experiments/${id}`),
    create: (body: {
      project_id: number;
      name: string;
      description?: string;
      ml_model_id: number;
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
    activeOnServer: (serverId: string) =>
      request<{ id: number; name: string; status: string; project_id: number }[]>(
        `/experiments/active-on-server?server_id=${encodeURIComponent(serverId)}`
      ),
    cancel: (id: number) =>
      request<Experiment>(`/experiments/${id}/cancel`, { method: 'POST' }),
    delete: (id: number) =>
      request<void>(`/experiments/${id}`, { method: 'DELETE' }),
  },

  // ── Evaluations ────────────────────────────────────────────────────────────

  evaluations: {
    list: (projectId: number) =>
      request<Evaluation[]>(`/evaluations/?project_id=${projectId}`),
    get: (id: number) => request<Evaluation>(`/evaluations/${id}`),
    create: (body: {
      project_id: number;
      name: string;
      description?: string;
      ml_model_id: number;
      checkpoint_id: number;
      server_id: string;
      dataset_version_ids: number[];
    }) =>
      request<Evaluation>('/evaluations/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    delete: (id: number) => request<void>(`/evaluations/${id}`, { method: 'DELETE' }),
  },

  // ── Visualizations ─────────────────────────────────────────────────────────

  visualizations: {
    list: (projectId: number) =>
      request<Visualization[]>(`/visualizations/?project_id=${projectId}`),
    get: (id: number) => request<Visualization>(`/visualizations/${id}`),
    create: (form: FormData) =>
      request<Visualization>('/visualizations/', { method: 'POST', body: form }),
    resultImages: (id: number) =>
      request<VisualizationResultImage[]>(`/visualizations/${id}/result-images`),
    delete: (id: number) => request<void>(`/visualizations/${id}`, { method: 'DELETE' }),
  },

  // ── Servers ────────────────────────────────────────────────────────────────

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
      server_type?: 'cpu' | 'gpu';
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

// ── Data types ────────────────────────────────────────────────────────────────

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
  ml_model_id?: number | null;
  experiment_id?: number;
  name: string;
  source: 'pretrained' | 'experiment';
  file_path: string;
  metrics?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── Pydantic JSON Schema types (from model_json_schema()) ─────────────────────

export interface PydanticProperty {
  title?: string;
  type?: string;
  default?: unknown;
  description?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  pattern?: string;
  // UI hints embedded via json_schema_extra on Field(...)
  ui_group?: string;
  ui_options?: (string | number)[];
  ui_hidden?: boolean;
  // For Optional[X] types Pydantic emits anyOf
  anyOf?: Array<{ type?: string; [key: string]: unknown }>;
}

export interface PydanticJsonSchema {
  title?: string;
  description?: string;
  properties: Record<string, PydanticProperty>;
  required?: string[];
}

// ── Trainers ──────────────────────────────────────────────────────────────────

export interface Trainer {
  id: number;
  key: string;
  name: string;
  description?: string;
  train_params_schema: PydanticJsonSchema;
  infer_params_schema?: PydanticJsonSchema;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── ML Models ─────────────────────────────────────────────────────────────────

export interface MLModel {
  id: number;
  project_id: number;
  trainer_id: number;
  trainer?: Trainer;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
}

// ── Experiments ───────────────────────────────────────────────────────────────

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
  ml_model_id: number;
  name: string;
  description: string | null;
  server_id: string;
  pretrained_ckpt_id: number | null;
  sampling_strategy: SamplingStrategy;
  train_params: Record<string, unknown>;
  status: ExperimentStatus;
  celery_task_id: string | null;
  mlflow_run_id: string | null;
  metrics: Record<string, unknown> | null;
  output_ckpt_id: number | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  datasets?: ExperimentDataset[];
}

// ── Evaluations ───────────────────────────────────────────────────────────────

export type EvaluationStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface EvaluationDatasetResult {
  dataset_version_id: number;
  name: string;
  metrics: Record<string, number>;
}

export interface Evaluation {
  id: number;
  project_id: number;
  ml_model_id: number;
  checkpoint_id: number;
  name: string;
  description: string | null;
  server_id: string;
  status: EvaluationStatus;
  celery_task_id: string | null;
  overall_metrics: Record<string, number> | null;
  dataset_results: EvaluationDatasetResult[] | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  datasets?: { id: number; dataset_version_id: number }[];
}

// ── Visualizations ────────────────────────────────────────────────────────────

export type VisualizationStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface Detection {
  box: [number, number, number, number];
  score: number;
  class_id: number;
  class_name: string;
}

export interface VisualizationResult {
  filename: string;
  output_filename: string;
  output_key: string | null;
  detections: Detection[];
}

export interface VisualizationResultImage extends VisualizationResult {
  output_url: string | null;
}

export interface Visualization {
  id: number;
  project_id: number;
  ml_model_id: number;
  checkpoint_id: number;
  name: string;
  server_id: string;
  confidence: number;
  status: VisualizationStatus;
  celery_task_id: string | null;
  input_image_keys: string[] | null;
  results: VisualizationResult[] | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Servers ────────────────────────────────────────────────────────────────────

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
  server_type: 'cpu' | 'gpu';
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
    load_percent: number | null;
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
