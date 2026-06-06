import { type ParamDef, type TrainerSchema } from '../lib/api';

interface Props {
  schema: TrainerSchema;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}

const selectCls =
  'w-full px-3 py-2.5 rounded-lg text-sm text-zinc-100 ' +
  'bg-zinc-900/60 border border-zinc-800 outline-none ' +
  'hover:border-zinc-700 focus:border-violet-500/50 ' +
  'focus:ring-2 focus:ring-violet-500/10 transition-all duration-150';

// ── Single field renderer ────────────────────────────────────────────────────

function ParamField({
  param,
  value,
  onChange,
}: {
  param: ParamDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const { key, label, type, description, min, max, step, options } = param;
  const inputId = `tp-${key}`;

  const labelEl = (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={inputId} className="text-[11px] font-medium text-zinc-400 uppercase tracking-widest">
        {label}
      </label>
      {description && (
        <p className="text-[10px] text-zinc-600 leading-snug">{description}</p>
      )}
    </div>
  );

  if (type === 'boolean') {
    const checked = Boolean(value);
    return (
      <div className="flex flex-col gap-1.5">
        {labelEl}
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          id={inputId}
          onClick={() => onChange(!checked)}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40 ${
            checked ? 'bg-violet-600' : 'bg-zinc-700'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
              checked ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    );
  }

  if (type === 'select' && options) {
    return (
      <div className="flex flex-col gap-1.5">
        {labelEl}
        <select
          id={inputId}
          className={selectCls}
          value={String(value ?? param.default)}
          onChange={(e) => {
            const raw = e.target.value;
            // preserve numeric options as numbers
            const isNum = options.every((o) => typeof o === 'number');
            onChange(isNum ? Number(raw) : raw);
          }}
        >
          {options.map((opt) => (
            <option key={String(opt)} value={String(opt)}>
              {String(opt)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // integer or float
  return (
    <div className="flex flex-col gap-1.5">
      {labelEl}
      <input
        id={inputId}
        type="number"
        className={selectCls}
        value={value as number ?? param.default}
        min={min}
        max={max}
        step={type === 'integer' ? 1 : (step ?? 'any')}
        onChange={(e) => {
          const n = type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value);
          if (!isNaN(n)) onChange(n);
        }}
      />
    </div>
  );
}

// ── Main form ────────────────────────────────────────────────────────────────

export function TrainParamsForm({ schema, values, onChange }: Props) {
  const set = (key: string, v: unknown) => onChange({ ...values, [key]: v });

  // Group params
  const grouped: Record<string, ParamDef[]> = {};
  for (const param of schema.params) {
    const g = param.group ?? 'other';
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(param);
  }

  const orderedGroups = [
    ...schema.group_order.filter((g) => grouped[g]),
    ...Object.keys(grouped).filter((g) => !schema.group_order.includes(g)),
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Trainer description */}
      {schema.description && (
        <p className="text-xs text-zinc-500 leading-relaxed border-l-2 border-violet-500/30 pl-3">
          {schema.description}
        </p>
      )}

      {orderedGroups.map((group) => {
        const params = grouped[group];
        const groupLabel = schema.group_labels[group] ?? group;

        // Split booleans out for separate row
        const boolParams = params.filter((p) => p.type === 'boolean');
        const otherParams = params.filter((p) => p.type !== 'boolean');

        return (
          <div key={group} className="flex flex-col gap-3">
            {/* Group header */}
            <div className="flex items-center gap-3">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest shrink-0">
                {groupLabel}
              </p>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>

            {/* Non-boolean params — 2-column grid */}
            {otherParams.length > 0 && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                {otherParams.map((param) => (
                  <ParamField
                    key={param.key}
                    param={param}
                    value={values[param.key] ?? param.default}
                    onChange={(v) => set(param.key, v)}
                  />
                ))}
              </div>
            )}

            {/* Boolean params — flex row of toggles */}
            {boolParams.length > 0 && (
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                {boolParams.map((param) => (
                  <ParamField
                    key={param.key}
                    param={param}
                    value={values[param.key] ?? param.default}
                    onChange={(v) => set(param.key, v)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Utility: build default values from schema ─────────────────────────────────

export function defaultsFromSchema(schema: TrainerSchema): Record<string, unknown> {
  return Object.fromEntries(schema.params.map((p) => [p.key, p.default]));
}
