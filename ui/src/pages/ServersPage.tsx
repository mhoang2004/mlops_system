import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server, Plus, Trash2, Loader2, AlertCircle, Activity,
  Cpu, HardDrive, Database, Thermometer, Zap, Wifi,
} from 'lucide-react';
import { api, type Server as ServerType, type ServerMetrics } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { useLang } from '../contexts/LangContext';

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function UsageBar({ pct, color = 'violet' }: { pct: number; color?: string }) {
  const colorMap: Record<string, string> = {
    violet: 'bg-violet-500',
    cyan: 'bg-cyan-500',
    amber: 'bg-amber-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
  };
  const bar = pct > 85 ? 'red' : pct > 65 ? 'amber' : color;
  return (
    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${colorMap[bar] ?? colorMap.violet}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

function statusColor(status: ServerType['status']) {
  if (status === 'ONLINE') return 'success';
  if (status === 'OFFLINE') return 'warning';
  return 'muted';
}

// ── Register modal ──────────────────────────────────────────────────────────

function RegisterServerModal({ onCreated }: { onCreated: (s: ServerType) => void }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', host: '', node_exporter_port: '9100', cadvisor_port: '8080',
    dcgm_exporter_port: '', gpu_count: '0', gpu_type: '', description: '',
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.host.trim()) {
      setError('Name and host are required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const s = await api.servers.create({
        name: form.name.trim(),
        host: form.host.trim(),
        node_exporter_port: parseInt(form.node_exporter_port) || 9100,
        cadvisor_port: parseInt(form.cadvisor_port) || 8080,
        dcgm_exporter_port: form.dcgm_exporter_port ? parseInt(form.dcgm_exporter_port) : null,
        gpu_count: parseInt(form.gpu_count) || 0,
        gpu_type: form.gpu_type.trim() || undefined,
        description: form.description.trim() || undefined,
      });
      onCreated(s);
      setOpen(false);
      setForm({ name: '', host: '', node_exporter_port: '9100', cadvisor_port: '8080', dcgm_exporter_port: '', gpu_count: '0', gpu_type: '', description: '' });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setOpen(true)}>
        {t('srv_register')}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('srv_register_title')}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Input id="srv-name" label={t('srv_name')} placeholder="gpu-node-01" value={form.name} onChange={set('name')} />
            <Input id="srv-host" label={t('srv_host')} placeholder="192.168.1.100" value={form.host} onChange={set('host')} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input id="srv-node-port" label={t('srv_node_port')} type="number" value={form.node_exporter_port} onChange={set('node_exporter_port')} />
            <Input id="srv-cadvisor-port" label={t('srv_cadvisor_port')} type="number" value={form.cadvisor_port} onChange={set('cadvisor_port')} />
            <Input id="srv-dcgm-port" label={t('srv_dcgm_port')} type="number" placeholder="9400" value={form.dcgm_exporter_port} onChange={set('dcgm_exporter_port')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input id="srv-gpu-count" label={t('srv_gpu_count')} type="number" value={form.gpu_count} onChange={set('gpu_count')} />
            <Input id="srv-gpu-type" label={t('srv_gpu_type')} placeholder="RTX 4090" value={form.gpu_type} onChange={set('gpu_type')} />
          </div>
          <Input id="srv-desc" label={t('srv_desc')} placeholder="Training node with 2x GPU" value={form.description} onChange={set('description')} />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Button>
            <Button type="submit" loading={loading} icon={<Server className="w-3.5 h-3.5" />}>
              {t('srv_register')}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ── Metrics modal ───────────────────────────────────────────────────────────

function MetricsModal({ server, open, onClose }: { server: ServerType; open: boolean; onClose: () => void }) {
  const { t } = useLang();
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setMetrics(null);
    setError('');
    setLoading(true);
    api.servers.metrics(server.id)
      .then(setMetrics)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, server.id]);

  return (
    <Modal open={open} onClose={onClose} title={`${t('srv_metrics_title')} — ${server.name}`}>
      {loading && (
        <div className="flex items-center justify-center gap-3 py-12 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin text-violet-500/60" />
          <span className="text-sm">{t('srv_fetching')}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/8 border border-red-500/20 rounded-lg text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {metrics && !loading && (
        <div className="flex flex-col gap-5">
          {/* Status header */}
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className={metrics.online ? 'text-green-400' : 'text-red-400'}>
              {metrics.online ? '● Online' : '● Offline'}
            </span>
            <span>{new Date(metrics.timestamp).toLocaleTimeString()}</span>
          </div>

          {!metrics.online && (
            <p className="text-sm text-zinc-500 text-center py-4">{t('srv_offline')}</p>
          )}

          {/* CPU */}
          {metrics.cpu && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                <Cpu className="w-3.5 h-3.5" /> CPU
              </div>
              <div className="grid grid-cols-4 gap-3">
                {metrics.cpu.core_count != null && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
                    <p className="text-lg font-semibold text-zinc-100">{metrics.cpu.core_count}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Cores</p>
                  </div>
                )}
                {metrics.cpu.load_avg_1m != null && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
                    <p className="text-lg font-semibold text-zinc-100">{metrics.cpu.load_avg_1m}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Load 1m</p>
                  </div>
                )}
                {metrics.cpu.load_avg_5m != null && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
                    <p className="text-lg font-semibold text-zinc-100">{metrics.cpu.load_avg_5m}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Load 5m</p>
                  </div>
                )}
                {metrics.cpu.load_avg_15m != null && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
                    <p className="text-lg font-semibold text-zinc-100">{metrics.cpu.load_avg_15m}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Load 15m</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Memory */}
          {metrics.memory && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                <Database className="w-3.5 h-3.5" /> Memory
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-2">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-300">{fmtBytes(metrics.memory.used_bytes)} / {fmtBytes(metrics.memory.total_bytes)}</span>
                  <span className={metrics.memory.usage_percent > 85 ? 'text-red-400' : 'text-zinc-400'}>
                    {metrics.memory.usage_percent}%
                  </span>
                </div>
                <UsageBar pct={metrics.memory.usage_percent} color="violet" />
              </div>
            </div>
          )}

          {/* Disks */}
          {metrics.disks && metrics.disks.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                <HardDrive className="w-3.5 h-3.5" /> Disk
              </div>
              <div className="flex flex-col gap-2">
                {metrics.disks.map((d) => (
                  <div key={d.mountpoint} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-col gap-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400 font-mono">{d.mountpoint}</span>
                      <span className="text-zinc-400">{fmtBytes(d.used_bytes)} / {fmtBytes(d.total_bytes)} · {d.usage_percent}%</span>
                    </div>
                    <UsageBar pct={d.usage_percent} color="cyan" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GPUs */}
          {metrics.gpus && metrics.gpus.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                <Zap className="w-3.5 h-3.5" /> GPU
              </div>
              <div className="flex flex-col gap-3">
                {metrics.gpus.map((gpu) => (
                  <div key={gpu.index} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-zinc-200">GPU {gpu.index} — {gpu.model}</span>
                      {gpu.temperature_celsius != null && (
                        <span className="flex items-center gap-1 text-xs text-amber-400">
                          <Thermometer className="w-3.5 h-3.5" /> {gpu.temperature_celsius}°C
                        </span>
                      )}
                    </div>

                    {gpu.utilization_percent != null && (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between text-xs text-zinc-500">
                          <span>GPU Utilization</span>
                          <span className="text-zinc-300">{gpu.utilization_percent}%</span>
                        </div>
                        <UsageBar pct={gpu.utilization_percent} color="green" />
                      </div>
                    )}

                    {gpu.memory_total_mb != null && (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between text-xs text-zinc-500">
                          <span>VRAM — {gpu.memory_used_mb?.toFixed(0)} / {gpu.memory_total_mb.toFixed(0)} MB</span>
                          <span className="text-zinc-300">{gpu.memory_usage_percent}%</span>
                        </div>
                        <UsageBar pct={gpu.memory_usage_percent ?? 0} color="violet" />
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-3 pt-1">
                      {gpu.power_watts != null && (
                        <div className="text-center">
                          <p className="text-sm font-semibold text-zinc-100">{gpu.power_watts.toFixed(0)} W</p>
                          <p className="text-xs text-zinc-600">Power</p>
                        </div>
                      )}
                      {gpu.sm_clock_mhz != null && (
                        <div className="text-center">
                          <p className="text-sm font-semibold text-zinc-100">{gpu.sm_clock_mhz} MHz</p>
                          <p className="text-xs text-zinc-600">SM Clock</p>
                        </div>
                      )}
                      {gpu.mem_clock_mhz != null && (
                        <div className="text-center">
                          <p className="text-sm font-semibold text-zinc-100">{gpu.mem_clock_mhz} MHz</p>
                          <p className="text-xs text-zinc-600">Mem Clock</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Network */}
          {metrics.network && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                <Wifi className="w-3.5 h-3.5" /> Network (total)
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
                  <p className="text-sm font-semibold text-zinc-100">↓ {fmtBytes(metrics.network.receive_bytes_total)}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Received</p>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
                  <p className="text-sm font-semibold text-zinc-100">↑ {fmtBytes(metrics.network.transmit_bytes_total)}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Transmitted</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export function ServersPage() {
  const { t } = useLang();
  const [servers, setServers] = useState<ServerType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [pingingId, setPingingId] = useState<number | null>(null);
  const [metricsServer, setMetricsServer] = useState<ServerType | null>(null);

  useEffect(() => {
    api.servers.list()
      .then(setServers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleCreated = (s: ServerType) => setServers((prev) => [s, ...prev]);

  const handleDelete = async (id: number) => {
    if (!confirm(t('srv_delete_confirm'))) return;
    setDeletingId(id);
    try {
      await api.servers.delete(id);
      setServers((prev) => prev.filter((s) => s.id !== id));
    } catch {
      alert(t('delete_failed'));
    } finally {
      setDeletingId(null);
    }
  };

  const handlePing = async (server: ServerType) => {
    setPingingId(server.id);
    try {
      const result = await api.servers.health(server.id);
      setServers((prev) =>
        prev.map((s) => s.id === server.id ? { ...s, status: result.status as ServerType['status'] } : s)
      );
    } catch {
      setServers((prev) =>
        prev.map((s) => s.id === server.id ? { ...s, status: 'OFFLINE' } : s)
      );
    } finally {
      setPingingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-12">

      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">{t('srv_title')}</h1>
          <p className="text-sm text-zinc-500 mt-2 leading-relaxed">{t('srv_subtitle')}</p>
        </div>
        <div className="shrink-0 pt-1">
          <RegisterServerModal onCreated={handleCreated} />
        </div>
      </div>

      {/* ── Loading ─────────────────────────────────────────────── */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-28 text-zinc-600 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-violet-500/50" />
          <span className="text-sm">{t('loading')}</span>
        </div>
      )}

      {/* ── Error ───────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 p-5 bg-red-500/8 border border-red-500/20 rounded-xl text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {t('projects_api_error')}: {error}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────── */}
      {!loading && !error && servers.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-zinc-800 rounded-xl"
        >
          <div className="w-14 h-14 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5">
            <Server className="w-6 h-6 text-zinc-600" />
          </div>
          <p className="text-base font-medium text-zinc-300">{t('srv_empty')}</p>
          <p className="text-sm text-zinc-600 mt-2 leading-relaxed">{t('srv_empty_hint')}</p>
        </motion.div>
      )}

      {/* ── Server list ─────────────────────────────────────────── */}
      {!loading && servers.length > 0 && (
        <div className="flex flex-col gap-4">
          <AnimatePresence>
            {servers.map((srv, i) => (
              <motion.div
                key={srv.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2, delay: i * 0.04 }}
              >
                <Card className="p-6 flex items-start gap-5 hover:border-zinc-700/60 transition-colors duration-150">

                  {/* Status icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border ${
                    srv.status === 'ONLINE'
                      ? 'bg-green-500/10 border-green-500/25'
                      : srv.status === 'OFFLINE'
                      ? 'bg-red-500/10 border-red-500/25'
                      : 'bg-zinc-800 border-zinc-700'
                  }`}>
                    <Server className={`w-4.5 h-4.5 ${
                      srv.status === 'ONLINE' ? 'text-green-400' :
                      srv.status === 'OFFLINE' ? 'text-red-400' : 'text-zinc-500'
                    }`} strokeWidth={2} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-2.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-sm font-semibold text-zinc-100">{srv.name}</span>
                      <Badge variant={statusColor(srv.status)}>{srv.status}</Badge>
                      {srv.gpu_count > 0 && (
                        <Badge variant="info">{srv.gpu_count}× GPU</Badge>
                      )}
                      {srv.gpu_type && (
                        <Badge variant="muted">{srv.gpu_type}</Badge>
                      )}
                    </div>

                    <p className="text-xs text-zinc-500 font-mono">{srv.host}</p>

                    {srv.description && (
                      <p className="text-xs text-zinc-600 leading-relaxed">{srv.description}</p>
                    )}

                    {/* Exporter ports */}
                    <div className="flex items-center gap-3 pt-0.5 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-zinc-600">
                        <Activity className="w-3 h-3" />
                        node-exporter :{srv.node_exporter_port}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-zinc-600">
                        <Activity className="w-3 h-3" />
                        cadvisor :{srv.cadvisor_port}
                      </span>
                      {srv.dcgm_exporter_port && (
                        <span className="flex items-center gap-1 text-xs text-zinc-600">
                          <Zap className="w-3 h-3" />
                          dcgm :{srv.dcgm_exporter_port}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="shrink-0 flex items-center gap-2 pt-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={pingingId === srv.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Wifi className="w-3.5 h-3.5" />}
                      onClick={() => handlePing(srv)}
                      disabled={pingingId === srv.id}
                    >
                      {pingingId === srv.id ? t('srv_checking') : t('srv_health')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Activity className="w-3.5 h-3.5" />}
                      onClick={() => setMetricsServer(srv)}
                    >
                      {t('srv_metrics')}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      icon={deletingId === srv.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                      onClick={() => handleDelete(srv.id)}
                      disabled={deletingId === srv.id}
                    >
                      {t('delete')}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Metrics modal ────────────────────────────────────────── */}
      {metricsServer && (
        <MetricsModal
          server={metricsServer}
          open={!!metricsServer}
          onClose={() => setMetricsServer(null)}
        />
      )}
    </div>
  );
}
