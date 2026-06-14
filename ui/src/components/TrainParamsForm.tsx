import { type PydanticJsonSchema, type PydanticProperty } from '../lib/api';

interface Props {
  schema: PydanticJsonSchema;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}

const selectCls =
  'w-full px-3 py-2.5 rounded-lg text-sm text-zinc-100 ' +
  'bg-zinc-900/60 border border-zinc-800 outline-none ' +
  'hover:border-zinc-700 focus:border-violet-500/50 ' +
  'focus:ring-2 focus:ring-violet-500/10 transition-all duration-150';

// ── Resolve effective type from Pydantic property ─────────────────────────────

function resolveType(prop: PydanticProperty): string {
  if (prop.type) return prop.type;
  if (prop.anyOf) {
    const nonNull = prop.anyOf.find((x) => x.type && x.type !== 'null');
    return nonNull?.type ?? 'string';
  }
  return 'string';
}

function resolveMin(prop: PydanticProperty): number | undefined {
  if (prop.minimum !== undefined) return prop.minimum;
  if (prop.exclusiveMinimum !== undefined) return prop.exclusiveMinimum;
  return undefined;
}

function resolveMax(prop: PydanticProperty): number | undefined {
  if (prop.maximum !== undefined) return prop.maximum;
  if (prop.exclusiveMaximum !== undefined) return prop.exclusiveMaximum;
  return undefined;
}

// ── Single field renderer ────────────────────────────────────────────────────

function ParamField({
  fieldKey,
  prop,
  value,
  onChange,
}: {
  fieldKey: string;
  prop: PydanticProperty;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const type    = resolveType(prop);
  const inputId = `tp-${fieldKey}`;
  const label   = prop.title ?? fieldKey;
  const min     = resolveMin(prop);
  const max     = resolveMax(prop);
  const options = prop.ui_options;

  const labelEl = (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={inputId} className="text-[11px] font-medium text-zinc-400 uppercase tracking-widest">
        {label}
      </label>
      {prop.description && (
        <p className="text-[10px] text-zinc-600 leading-snug">{prop.description}</p>
      )}
    </div>
  );

  if (type === 'boolean') {
    const checked = Boolean(value ?? prop.default);
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

  if (options && options.length > 0) {
    const isNumericOptions = options.every((o) => typeof o === 'number');
    return (
      <div className="flex flex-col gap-1.5">
        {labelEl}
        <select
          id={inputId}
          className={selectCls}
          value={String(value ?? prop.default ?? '')}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(isNumericOptions ? Number(raw) : raw);
          }}
        >
          {options.map((opt) => (
            <option key={String(opt)} value={String(opt)}>{String(opt)}</option>
          ))}
        </select>
      </div>
    );
  }

  if (type === 'integer' || type === 'number') {
    return (
      <div className="flex flex-col gap-1.5">
        {labelEl}
        <input
          id={inputId}
          type="number"
          className={selectCls}
          value={value as number ?? prop.default ?? 0}
          min={min}
          max={max}
          step={type === 'integer' ? 1 : 'any'}
          onChange={(e) => {
            const n = type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value);
            if (!isNaN(n)) onChange(n);
          }}
        />
      </div>
    );
  }

  // string / fallback
  return (
    <div className="flex flex-col gap-1.5">
      {labelEl}
      <input
        id={inputId}
        type="text"
        className={selectCls}
        value={String(value ?? prop.default ?? '')}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ── Main form ────────────────────────────────────────────────────────────────

export function TrainParamsForm({ schema, values, onChange }: Props) {
  const set = (key: string, v: unknown) => onChange({ ...values, [key]: v });

  const properties = schema.properties ?? {};

  // Filter hidden fields, group the rest
  const grouped: Record<string, Array<[string, PydanticProperty]>> = {};

  for (const [key, prop] of Object.entries(properties)) {
    if (prop.ui_hidden) continue;
    const group = prop.ui_group ?? 'general';
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push([key, prop]);
  }

  const groupOrder = Object.keys(grouped);

  if (groupOrder.length === 0) {
    return <p className="text-xs text-zinc-600 italic">No configurable parameters.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {schema.description && (
        <p className="text-xs text-zinc-500 leading-relaxed border-l-2 border-violet-500/30 pl-3">
          {schema.description}
        </p>
      )}

      {groupOrder.map((group) => {
        const fields = grouped[group];
        const boolFields  = fields.filter(([, p]) => resolveType(p) === 'boolean');
        const otherFields = fields.filter(([, p]) => resolveType(p) !== 'boolean');

        return (
          <div key={group} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest shrink-0">
                {group}
              </p>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>

            {otherFields.length > 0 && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                {otherFields.map(([key, prop]) => (
                  <ParamField
                    key={key}
                    fieldKey={key}
                    prop={prop}
                    value={values[key] ?? prop.default}
                    onChange={(v) => set(key, v)}
                  />
                ))}
              </div>
            )}

            {boolFields.length > 0 && (
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                {boolFields.map(([key, prop]) => (
                  <ParamField
                    key={key}
                    fieldKey={key}
                    prop={prop}
                    value={values[key] ?? prop.default}
                    onChange={(v) => set(key, v)}
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

export function defaultsFromSchema(schema: PydanticJsonSchema): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    if (prop.ui_hidden) continue;
    if ('default' in prop && prop.default !== undefined) {
      result[key] = prop.default;
    }
  }
  return result;
}
