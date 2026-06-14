import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server, Plus, Trash2, Loader2, AlertCircle, Activity,
  Cpu, HardDrive, Database, Thermometer, Zap, Wifi,
} from 'lucide-react';
import { api, type Server as ServerType, type ServerMetrics, type GpuMetrics } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { useLang } from '../contexts/LangContext';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number | undefined | null): string {
  if (bytes == null || isNaN(bytes) || bytes < 0) return '—';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function fmtPct(v: number | undefined | null): string {
  if (v == null || isNaN(v)) return '—';
  return `${v.toFixed(1)}%`;
}

/** Color-reactive usage bar. Default colour (when pct is low) can be overridden. */
function UsageBar({ pct, low = 'green' }: { pct: number | undefined | null; low?: 'green' | 'violet' | 'cyan' }) {
  const safe = pct == null || isNaN(pct) ? 0 : Math.max(0, Math.min(pct, 100));
  const color =
    safe > 85 ? 'bg-red-500' :
    safe > 60 ? 'bg-amber-400' :
    low === 'green'  ? 'bg-green-500' :
    low === 'cyan'   ? 'bg-cyan-500'  :
                       'bg-violet-500';
  return (
    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}

function statusColor(status: ServerType['status']): 'success' | 'warning' | 'muted' {
  if (status === 'ONLINE') return 'success';
  if (status === 'OFFLINE') return 'warning';
  return 'muted';
}

// ── Inline resource bars (CPU + RAM + GPU VRAM) shown on server card ──────────

function ResourceBars({ live }: { live: ServerMetrics | undefined }) {
  if (!live) return null;

  const gpus    = live.gpus ?? [];
  const cpuPct  = live.cpu?.load_percent;
  const memPct  = live.memory?.usage_percent;
  const memUsed = live.memory?.used_bytes;
  const memTot  = live.memory?.total_bytes;

  const hasCpu = cpuPct != null;
  const hasMem = memPct != null;
  const hasGpu = gpus.length > 0;

  if (!hasCpu && !hasMem && !hasGpu) return null;

  const valColor = (pct: number) =>
    pct > 85 ? 'text-red-400' : pct > 60 ? 'text-amber-400' : 'text-green-400';

  return (
    <div className="flex flex-col gap-2 pt-1">
      {hasCpu && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span className="flex items-center gap-1">
              <Cpu className="w-2.5 h-2.5" /> CPU load
            </span>
            <span className={valColor(cpuPct!)}>
              {fmtPct(cpuPct)} ({live.cpu!.load_avg_1m ?? '—'})
            </span>
          </div>
          <UsageBar pct={cpuPct} low="green" />
        </div>
      )}

      {hasMem && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span className="flex items-center gap-1">
              <Database className="w-2.5 h-2.5" /> RAM
            </span>
            <span className={valColor(memPct!)}>
              {memUsed != null && memTot != null
                ? `${fmtBytes(memUsed)} / ${fmtBytes(memTot)}`
                : fmtPct(memPct)}
            </span>
          </div>
          <UsageBar pct={memPct} low="violet" />
        </div>
      )}

      {gpus.map((gpu) => {
        const pct  = gpu.memory_usage_percent ?? 0;
        const used = gpu.memory_used_mb;
        const tot  = gpu.memory_total_mb;
        return (
          <div key={gpu.index} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-500">
              <span className="flex items-center gap-1">
                <Zap className="w-2.5 h-2.5" />
                GPU {gpu.index}{gpu.model ? ` — ${gpu.model}` : ''}
              </span>
              <span className={valColor(pct)}>
                {used != null && tot != null ? `${used.toFixed(0)} / ${tot.toFixed(0)} MB · ` : ''}
                {fmtPct(pct)}
              </span>
            </div>
            <UsageBar pct={pct} low="green" />
          </div>
        );
      })}
    </div>
  );
}

// ── Register modal ────────────────────────────────────────────────────────────

function RegisterServerModal({ onCreated }: { onCreated: (s: ServerType) => void }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', host: '', node_exporter_port: '9100', cadvisor_port: '8080',
    dcgm_exporter_port: '', gpu_count: '0', gpu_type: '', description: '',
    server_type: 'cpu' as 'cpu' | 'gpu',
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.host.trim()) { setError('Name and host are required'); return; }
    setLoading(true); setError('');
    try {
      const s = await api.servers.create({
        name: form.name.trim(),
        host: form.host.trim(),
        node_exporter_port: parseInt(form.node_exporter_port) || 9100,
        cadvisor_port: parseInt(form.cadvisor_port) || 8080,
        server_type: form.server_type,
        ...(form.server_type === 'gpu' ? {
          dcgm_exporter_port: form.dcgm_exporter_port ? parseInt(form.dcgm_exporter_port) : null,
          gpu_count: parseInt(form.gpu_count) || 0,
          gpu_type: form.gpu_type.trim() || undefined,
        } : {
          dcgm_exporter_port: null,
          gpu_count: 0,
        }),
        description: form.description.trim() || undefined,
      });
      onCreated(s);
      setOpen(false);
      setForm({ name: '', host: '', node_exporter_port: '9100', cadvisor_port: '8080', dcgm_exporter_port: '', gpu_count: '0', gpu_type: '', description: '', server_type: 'cpu' });
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
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">{t('srv_type')}</span>
            <div className="flex gap-2">
              {(['cpu', 'gpu'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    if (type === 'cpu') {
                      setForm((f) => ({ ...f, server_type: 'cpu', gpu_count: '0', gpu_type: '', dcgm_exporter_port: '' }));
                    } else {
                      setForm((f) => ({ ...f, server_type: 'gpu' }));
                    }
                  }}
                  className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                    form.server_type === type
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {t(type === 'cpu' ? 'srv_type_cpu' : 'srv_type_gpu')}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input id="srv-node-port" label={t('srv_node_port')} type="number" value={form.node_exporter_port} onChange={set('node_exporter_port')} />
            <Input id="srv-cadvisor-port" label={t('srv_cadvisor_port')} type="number" value={form.cadvisor_port} onChange={set('cadvisor_port')} />
          </div>
          {form.server_type === 'gpu' && (
            <>
              <Input id="srv-dcgm-port" label={t('srv_dcgm_port')} type="number" placeholder="9400" value={form.dcgm_exporter_port} onChange={set('dcgm_exporter_port')} />
              <div className="grid grid-cols-2 gap-4">
                <Input id="srv-gpu-count" label={t('srv_gpu_count')} type="number" value={form.gpu_count} onChange={set('gpu_count')} />
                <Input id="srv-gpu-type" label={t('srv_gpu_type')} placeholder="RTX 4090" value={form.gpu_type} onChange={set('gpu_type')} />
              </div>
            </>
          )}
          <Input id="srv-desc" label={t('srv_desc')} placeholder="Training node" value={form.description} onChange={set('description')} />
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

// ── Metrics modal ─────────────────────────────────────────────────────────────

function MetricsModal({
  server,
  open,
  onClose,
  onMetricsFetched,
}: {
  server: ServerType;
  open: boolean;
  onClose: () => void;
  onMetricsFetched?: (m: ServerMetrics) => void;
}) {
  const { t } = useLang();
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setMetrics(null); setError('');
    setLoading(true);
    api.servers.metrics(server.id)
      .then((m) => { setMetrics(m); onMetricsFetched?.(m); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [open, server.id]);

  return (
    <Modal open={open} onClose={onClose} title={`${t('srv_metrics_title')} — ${server.name}`} className="max-w-xl">
      {loading && (
        <div className="flex items-center justify-center gap-3 py-12 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin text-violet-500/60" />
          <span className="text-sm">{t('srv_fetching')}</span>
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 p-4 bg-red-500/8 border border-red-500/20 rounded-lg text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="break-all">{error}</span>
          </div>
          <p className="text-xs text-zinc-600 text-center">
            Kiểm tra node-exporter trên {server.host}:{server.node_exporter_port}
          </p>
        </div>
      )}

      {!loading && !error && metrics && (
        <div className="flex flex-col gap-5 max-h-[70vh] overflow-y-auto pr-1">

          {/* Header */}
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className={metrics.online ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
              {metrics.online ? '● Online' : '● Offline'}
            </span>
            <span>{new Date(metrics.timestamp).toLocaleTimeString()}</span>
          </div>

          {!metrics.online && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <AlertCircle className="w-8 h-8 text-zinc-700" />
              <p className="text-sm text-zinc-500">{t('srv_offline')}</p>
              <p className="text-xs text-zinc-600">{server.host}:{server.node_exporter_port}</p>
            </div>
          )}

          {/* CPU */}
          {metrics.cpu && (
            <section className="flex flex-col gap-2">
              <SectionHeader icon={<Cpu className="w-3.5 h-3.5" />} label="CPU" />
              <div className="grid grid-cols-4 gap-3">
                <StatBox label="Cores"    value={metrics.cpu.core_count ?? '—'} />
                <StatBox label="Load 1m"  value={metrics.cpu.load_avg_1m  ?? '—'} />
                <StatBox label="Load 5m"  value={metrics.cpu.load_avg_5m  ?? '—'} />
                <StatBox label="Load 15m" value={metrics.cpu.load_avg_15m ?? '—'} />
              </div>
              {metrics.cpu.load_percent != null && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-col gap-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">Load (normalized by core count)</span>
                    <span className={
                      metrics.cpu.load_percent > 85 ? 'text-red-400' :
                      metrics.cpu.load_percent > 60 ? 'text-amber-400' : 'text-zinc-400'
                    }>
                      {fmtPct(metrics.cpu.load_percent)}
                    </span>
                  </div>
                  <UsageBar pct={metrics.cpu.load_percent} low="green" />
                </div>
              )}
            </section>
          )}

          {/* Memory */}
          {metrics.memory && (
            <section className="flex flex-col gap-2">
              <SectionHeader icon={<Database className="w-3.5 h-3.5" />} label="Memory" />
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-2">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-300">
                    {fmtBytes(metrics.memory.used_bytes)} / {fmtBytes(metrics.memory.total_bytes)}
                  </span>
                  <span className={metrics.memory.usage_percent > 85 ? 'text-red-400' : metrics.memory.usage_percent > 60 ? 'text-amber-400' : 'text-zinc-400'}>
                    {fmtPct(metrics.memory.usage_percent)}
                  </span>
                </div>
                <UsageBar pct={metrics.memory.usage_percent} low="violet" />
              </div>
            </section>
          )}

          {/* Disks */}
          {metrics.disks && metrics.disks.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionHeader icon={<HardDrive className="w-3.5 h-3.5" />} label="Disk" />
              <div className="flex flex-col gap-2">
                {metrics.disks.map((d) => (
                  <div key={d.mountpoint} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-col gap-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400 font-mono">{d.mountpoint}</span>
                      <span className="text-zinc-400">
                        {fmtBytes(d.used_bytes)} / {fmtBytes(d.total_bytes)} · {fmtPct(d.usage_percent)}
                      </span>
                    </div>
                    <UsageBar pct={d.usage_percent} low="cyan" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* GPUs */}
          {metrics.gpus && metrics.gpus.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionHeader icon={<Zap className="w-3.5 h-3.5" />} label="GPU" />
              <div className="flex flex-col gap-3">
                {metrics.gpus.map((gpu) => (
                  <div key={gpu.index} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-zinc-200">GPU {gpu.index} — {gpu.model || 'Unknown'}</span>
                      {gpu.temperature_celsius != null && (
                        <span className="flex items-center gap-1 text-xs text-amber-400">
                          <Thermometer className="w-3.5 h-3.5" /> {gpu.temperature_celsius.toFixed(0)}°C
                        </span>
                      )}
                    </div>

                    {gpu.utilization_percent != null && (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between text-xs text-zinc-500">
                          <span>GPU Utilization</span>
                          <span className="text-zinc-300">{fmtPct(gpu.utilization_percent)}</span>
                        </div>
                        <UsageBar pct={gpu.utilization_percent} low="green" />
                      </div>
                    )}

                    {gpu.memory_total_mb != null && gpu.memory_total_mb > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between text-xs text-zinc-500">
                          <span>
                            VRAM — {gpu.memory_used_mb != null ? gpu.memory_used_mb.toFixed(0) : '?'} / {gpu.memory_total_mb.toFixed(0)} MB
                          </span>
                          <span className="text-zinc-300">{fmtPct(gpu.memory_usage_percent)}</span>
                        </div>
                        <UsageBar pct={gpu.memory_usage_percent} low="green" />
                      </div>
                    )}

                    {(gpu.power_watts != null || gpu.sm_clock_mhz != null || gpu.mem_clock_mhz != null) && (
                      <div className="grid grid-cols-3 gap-3 pt-1 border-t border-zinc-800/60">
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
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Network */}
          {metrics.network && (
            <section className="flex flex-col gap-2">
              <SectionHeader icon={<Wifi className="w-3.5 h-3.5" />} label="Network (total)" />
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
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}

// ── Small shared UI atoms ─────────────────────────────────────────────────────

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
      {icon} {label}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
      <p className="text-lg font-semibold text-zinc-100">{value}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ServersPage() {
  const { t } = useLang();
  const [servers, setServers]           = useState<ServerType[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [deletingId, setDeletingId]     = useState<number | null>(null);
  const [pingingId, setPingingId]       = useState<number | null>(null);
  const [metricsServer, setMetricsServer] = useState<ServerType | null>(null);
  // Cache of fetched live metrics per server id
  const [liveMetrics, setLiveMetrics]   = useState<Record<number, ServerMetrics>>({});

  const storeMetrics = (m: ServerMetrics) =>
    setLiveMetrics((prev) => ({ ...prev, [m.server_id]: m }));

  useEffect(() => {
    api.servers.list()
      .then((list) => {
        setServers(list);
        // Fetch metrics for all ONLINE servers in background
        list
          .filter((s) => s.status === 'ONLINE')
          .forEach((s) => {
            api.servers.metrics(s.id)
              .then(storeMetrics)
              .catch(() => {/* silent */});
          });
      })
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
      setLiveMetrics((prev) => { const next = { ...prev }; delete next[id]; return next; });
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
      const newStatus = result.status as ServerType['status'];
      setServers((prev) =>
        prev.map((s) => s.id === server.id ? { ...s, status: newStatus } : s)
      );
      // Fetch metrics when server is online
      if (newStatus === 'ONLINE') {
        api.servers.metrics(server.id).then(storeMetrics).catch(() => {});
      }
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

      {/* Header */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">{t('srv_title')}</h1>
          <p className="text-sm text-zinc-500 mt-2 leading-relaxed">{t('srv_subtitle')}</p>
        </div>
        <div className="shrink-0 pt-1">
          <RegisterServerModal onCreated={handleCreated} />
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-28 text-zinc-600 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-violet-500/50" />
          <span className="text-sm">{t('loading')}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-5 bg-red-500/8 border border-red-500/20 rounded-xl text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {t('projects_api_error')}: {error}
        </div>
      )}

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

      {!loading && servers.length > 0 && (
        <div className="flex flex-col gap-4">
          <AnimatePresence>
            {servers.map((srv, i) => {
              const live = liveMetrics[srv.id];

              return (
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
                      srv.status === 'ONLINE'  ? 'bg-green-500/10 border-green-500/25' :
                      srv.status === 'OFFLINE' ? 'bg-red-500/10 border-red-500/25'    :
                                                  'bg-zinc-800 border-zinc-700'
                    }`}>
                      <Server className={`w-4.5 h-4.5 ${
                        srv.status === 'ONLINE'  ? 'text-green-400' :
                        srv.status === 'OFFLINE' ? 'text-red-400'   : 'text-zinc-500'
                      }`} strokeWidth={2} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-2.5">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-sm font-semibold text-zinc-100">{srv.name}</span>
                        <Badge variant={statusColor(srv.status)}>{srv.status}</Badge>
                        {srv.gpu_count > 0 && <Badge variant="info">{srv.gpu_count}× GPU</Badge>}
                        {srv.gpu_type && <Badge variant="muted">{srv.gpu_type}</Badge>}
                      </div>

                      <p className="text-xs text-zinc-500 font-mono">{srv.host}</p>

                      {srv.description && (
                        <p className="text-xs text-zinc-600 leading-relaxed">{srv.description}</p>
                      )}

                      {/* CPU / RAM / VRAM inline bars */}
                      {srv.status === 'ONLINE' && (
                        <ResourceBars live={live} />
                      )}

                      {/* Exporter ports */}
                      <div className="flex items-center gap-3 pt-0.5 flex-wrap">
                        <span className="flex items-center gap-1 text-xs text-zinc-600">
                          <Activity className="w-3 h-3" /> node-exporter :{srv.node_exporter_port}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-zinc-600">
                          <Activity className="w-3 h-3" /> cadvisor :{srv.cadvisor_port}
                        </span>
                        {srv.dcgm_exporter_port && (
                          <span className="flex items-center gap-1 text-xs text-zinc-600">
                            <Zap className="w-3 h-3" /> dcgm :{srv.dcgm_exporter_port}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="shrink-0 flex items-center gap-2 pt-0.5">
                      <Button
                        variant="ghost" size="sm"
                        icon={pingingId === srv.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Wifi className="w-3.5 h-3.5" />}
                        onClick={() => handlePing(srv)}
                        disabled={pingingId === srv.id}
                      >
                        {pingingId === srv.id ? t('srv_checking') : t('srv_health')}
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        icon={<Activity className="w-3.5 h-3.5" />}
                        onClick={() => setMetricsServer(srv)}
                      >
                        {t('srv_metrics')}
                      </Button>
                      <Button
                        variant="danger" size="sm"
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
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {metricsServer && (
        <MetricsModal
          server={metricsServer}
          open={!!metricsServer}
          onClose={() => setMetricsServer(null)}
          onMetricsFetched={storeMetrics}
        />
      )}
    </div>
  );
}
