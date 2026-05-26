'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, Upload, Pencil, Settings2, Save, X, Check, Columns3,
} from 'lucide-react';
import { toast } from 'sonner';
import Papa from 'papaparse';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { FileUpload } from '@/components/ui/FileUpload';
import { formatCurrency } from '@/lib/utils';

export interface Column {
  id: string;
  slug: string;
  name: string;
  type: string;
  required: boolean;
  options: string[] | null;
  helpText: string | null;
}

export interface Row {
  id: string;
  data: Record<string, unknown>;
}

const COL_TYPES = [
  { value: 'TEXT', label: 'Text' },
  { value: 'LONG_TEXT', label: 'Long Text' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'CURRENCY', label: 'Currency' },
  { value: 'DATE', label: 'Date' },
  { value: 'BOOLEAN', label: 'Yes / No' },
  { value: 'SELECT', label: 'Select (single)' },
  { value: 'MULTI_SELECT', label: 'Multi Select' },
  { value: 'IMAGE_URL', label: 'Image URL' },
];

export function TableEditor({
  tableId,
  tableName,
  tableDescription,
  isSystem,
  currency,
  locale,
  canEditSchema,
  canEditRows,
  initialColumns,
  initialRows,
}: {
  tableId: string;
  tableName: string;
  tableDescription: string | null;
  isSystem: boolean;
  currency: string;
  locale: string;
  canEditSchema: boolean;
  canEditRows: boolean;
  initialColumns: Column[];
  initialRows: Row[];
}) {
  const router = useRouter();
  const [columns, setColumns] = React.useState(initialColumns);
  const [rows, setRows] = React.useState(initialRows);
  const [addRowOpen, setAddRowOpen] = React.useState(false);
  const [editRow, setEditRow] = React.useState<Row | null>(null);
  const [addColOpen, setAddColOpen] = React.useState(false);
  const [csvOpen, setCsvOpen] = React.useState(false);
  const [manageColsOpen, setManageColsOpen] = React.useState(false);

  async function deleteRow(id: string) {
    if (!confirm('Delete this row?')) return;
    const res = await fetch(`/api/rows/${id}`, { method: 'DELETE' });
    if (!res.ok) return toast.error('Delete failed');
    setRows((rs) => rs.filter((r) => r.id !== id));
    toast.success('Row deleted');
  }

  async function deleteTable() {
    if (!confirm(`Delete table "${tableName}" and all its rows?`)) return;
    const res = await fetch(`/api/tables/${tableId}`, { method: 'DELETE' });
    if (!res.ok) return toast.error('Delete failed');
    toast.success('Table deleted');
    router.push('/app/catalog');
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold">{tableName}</h1>
          {tableDescription && (
            <p className="mt-1 text-[var(--color-muted)]">{tableDescription}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="chip">{columns.length} columns</span>
            <span className="chip">{rows.length} rows</span>
            {isSystem && <span className="chip">Default · seeded</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEditSchema && (
            <Button variant="secondary" onClick={() => setManageColsOpen(true)}>
              <Settings2 className="h-4 w-4" /> Columns
            </Button>
          )}
          {canEditRows && (
            <Button variant="secondary" onClick={() => setCsvOpen(true)}>
              <Upload className="h-4 w-4" /> Import CSV
            </Button>
          )}
          {canEditRows && (
            <Button onClick={() => setAddRowOpen(true)}>
              <Plus className="h-4 w-4" /> Add row
            </Button>
          )}
        </div>
      </div>

      {/* Data table */}
      <div className="card overflow-hidden p-0">
        {rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-[var(--color-muted)]">No rows yet — add one or import a CSV.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wider text-[var(--color-muted)]">
                <tr>
                  {columns.map((c) => (
                    <th key={c.id} className="px-4 py-3 whitespace-nowrap">
                      {c.name}
                      {c.required && <span className="text-red-400 ml-0.5">*</span>}
                    </th>
                  ))}
                  {canEditRows && <th className="px-4 py-3 w-24" />}
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {rows.map((r) => (
                    <motion.tr
                      key={r.id}
                      layout
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="border-t hover:bg-[var(--color-surface-2)]/50 transition"
                    >
                      {columns.map((c) => (
                        <td key={c.id} className="px-4 py-3 align-top">
                          {renderCell(r.data[c.slug], c.type, currency, locale)}
                        </td>
                      ))}
                      {canEditRows && (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            className="btn-ghost p-1.5"
                            onClick={() => setEditRow(r)}
                            aria-label="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            className="btn-ghost p-1.5 text-red-400 hover:text-red-300"
                            onClick={() => deleteRow(r.id)}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canEditSchema && !isSystem && (
        <div className="mt-6">
          <Button variant="danger" onClick={deleteTable}>
            <Trash2 className="h-4 w-4" /> Delete this table
          </Button>
        </div>
      )}

      {/* MODALS */}
      <RowEditorModal
        open={addRowOpen}
        onClose={() => setAddRowOpen(false)}
        columns={columns}
        title="Add row"
        onSubmit={async (data) => {
          const res = await fetch(`/api/tables/${tableId}/rows`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ data }),
          });
          if (!res.ok) {
            toast.error('Failed to add');
            return false;
          }
          const json = await res.json();
          setRows((rs) => [json.row, ...rs]);
          toast.success('Row added');
          return true;
        }}
      />
      <RowEditorModal
        open={editRow !== null}
        onClose={() => setEditRow(null)}
        columns={columns}
        initial={editRow?.data}
        title="Edit row"
        onSubmit={async (data) => {
          if (!editRow) return false;
          const res = await fetch(`/api/rows/${editRow.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ data }),
          });
          if (!res.ok) {
            toast.error('Failed to save');
            return false;
          }
          const json = await res.json();
          setRows((rs) => rs.map((r) => (r.id === json.row.id ? json.row : r)));
          toast.success('Saved');
          return true;
        }}
      />
      <ColumnsManagerModal
        open={manageColsOpen}
        onClose={() => setManageColsOpen(false)}
        tableId={tableId}
        columns={columns}
        setColumns={setColumns}
      />
      <AddColumnInline
        open={addColOpen}
        onClose={() => setAddColOpen(false)}
        tableId={tableId}
        onCreated={(c) => setColumns((cs) => [...cs, c])}
      />
      <CsvImportModal
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        tableId={tableId}
        columns={columns}
        onImported={() => router.refresh()}
      />
    </>
  );
}

function renderCell(value: unknown, type: string, currency: string, locale: string) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-[var(--color-muted)]">—</span>;
  }
  if (type === 'CURRENCY' && typeof value === 'number') {
    return <span className="font-medium">{formatCurrency(value, currency, locale)}</span>;
  }
  if (type === 'BOOLEAN') {
    return value ? (
      <Check className="h-4 w-4 text-emerald-400" />
    ) : (
      <X className="h-4 w-4 text-[var(--color-muted)]" />
    );
  }
  if (type === 'MULTI_SELECT' && Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1">
        {(value as string[]).map((v) => (
          <span key={v} className="chip">{v}</span>
        ))}
      </div>
    );
  }
  if (type === 'LONG_TEXT') {
    return <span className="line-clamp-2 max-w-md">{String(value)}</span>;
  }
  if (type === 'IMAGE_URL' && typeof value === 'string' && value) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={value} alt="" className="h-10 w-10 rounded object-cover" />
    );
  }
  return <span>{String(value)}</span>;
}

// ─── ROW EDITOR ────────────────────────────────────────────────────────────
function RowEditorModal({
  open, onClose, columns, initial, title, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  columns: Column[];
  initial?: Record<string, unknown>;
  title: string;
  onSubmit: (data: Record<string, unknown>) => Promise<boolean>;
}) {
  const [values, setValues] = React.useState<Record<string, unknown>>(initial ?? {});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setValues(initial ?? {});
  }, [open, initial]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const ok = await onSubmit(values);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      <form onSubmit={submit} className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        {columns.map((c) => (
          <FieldRenderer
            key={c.id}
            col={c}
            value={values[c.slug]}
            onChange={(v) => setValues((s) => ({ ...s, [c.slug]: v }))}
          />
        ))}
        <div className="sticky bottom-0 bg-[var(--color-surface)] pt-3 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}><Save className="h-4 w-4" /> Save</Button>
        </div>
      </form>
    </Modal>
  );
}

function FieldRenderer({
  col, value, onChange,
}: {
  col: Column;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (col.type) {
    case 'LONG_TEXT':
      return (
        <Input
          label={col.name + (col.required ? ' *' : '')}
          hint={col.helpText ?? undefined}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'NUMBER':
    case 'CURRENCY':
      return (
        <Input
          label={col.name + (col.required ? ' *' : '')}
          hint={col.helpText ?? undefined}
          type="number"
          step="any"
          value={(value as number | undefined) ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      );
    case 'DATE':
      return (
        <Input
          label={col.name + (col.required ? ' *' : '')}
          type="date"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'BOOLEAN':
      return (
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--color-border)] bg-[var(--color-surface-2)]"
          />
          <span className="text-sm">{col.name}</span>
        </label>
      );
    case 'SELECT':
      return (
        <Select
          label={col.name + (col.required ? ' *' : '')}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select…</option>
          {(col.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </Select>
      );
    case 'IMAGE_URL':
      return (
        <ImageUrlField
          label={col.name + (col.required ? ' *' : '')}
          value={(value as string) ?? ''}
          onChange={onChange}
        />
      );
    case 'MULTI_SELECT': {
      const arr = (value as string[]) ?? [];
      return (
        <div>
          <label className="label-base">{col.name}</label>
          <div className="flex flex-wrap gap-2">
            {(col.options ?? []).map((o) => {
              const selected = arr.includes(o);
              return (
                <button
                  type="button"
                  key={o}
                  className={`chip cursor-pointer transition ${selected ? 'border-[var(--color-primary)] text-white bg-[var(--color-primary)]/20' : ''}`}
                  onClick={() =>
                    onChange(selected ? arr.filter((x) => x !== o) : [...arr, o])
                  }
                >
                  {o}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    default:
      return (
        <Input
          label={col.name + (col.required ? ' *' : '')}
          hint={col.helpText ?? undefined}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

// ─── COLUMN MANAGER ────────────────────────────────────────────────────────
function ColumnsManagerModal({
  open, onClose, tableId, columns, setColumns,
}: {
  open: boolean;
  onClose: () => void;
  tableId: string;
  columns: Column[];
  setColumns: React.Dispatch<React.SetStateAction<Column[]>>;
}) {
  const [adding, setAdding] = React.useState(false);

  async function removeCol(id: string) {
    if (!confirm('Remove this column? Existing row values for this column will be lost.')) return;
    const res = await fetch(`/api/columns/${id}`, { method: 'DELETE' });
    if (!res.ok) return toast.error('Failed');
    setColumns((cs) => cs.filter((c) => c.id !== id));
    toast.success('Column removed');
  }

  return (
    <Modal open={open} onClose={onClose} title="Manage columns" size="lg">
      <div className="space-y-2 max-h-[50vh] overflow-y-auto">
        {columns.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-3 rounded-xl border bg-[var(--color-surface-2)] px-4 py-3"
          >
            <div className="flex-1">
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-[var(--color-muted)]">
                {c.type}
                {c.required && ' · required'}
              </div>
            </div>
            <button
              onClick={() => removeCol(c.id)}
              className="btn-ghost p-1.5 text-red-400"
              aria-label="Remove"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-4 border-t pt-4">
        {!adding ? (
          <Button onClick={() => setAdding(true)} variant="secondary">
            <Plus className="h-4 w-4" /> Add column
          </Button>
        ) : (
          <AddColumnForm
            tableId={tableId}
            onCancel={() => setAdding(false)}
            onCreated={(c) => {
              setColumns((cs) => [...cs, c]);
              setAdding(false);
            }}
          />
        )}
      </div>
    </Modal>
  );
}

function AddColumnInline({ open, onClose, tableId, onCreated }: {
  open: boolean;
  onClose: () => void;
  tableId: string;
  onCreated: (c: Column) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Add column">
      <AddColumnForm
        tableId={tableId}
        onCancel={onClose}
        onCreated={(c) => {
          onCreated(c);
          onClose();
        }}
      />
    </Modal>
  );
}

function AddColumnForm({
  tableId, onCancel, onCreated,
}: {
  tableId: string;
  onCancel: () => void;
  onCreated: (c: Column) => void;
}) {
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState('TEXT');
  const [required, setRequired] = React.useState(false);
  const [options, setOptions] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = { name, type, required };
      if (type === 'SELECT' || type === 'MULTI_SELECT') {
        body.options = options.split(',').map((s) => s.trim()).filter(Boolean);
      }
      const res = await fetch(`/api/tables/${tableId}/columns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      const col: Column = {
        id: data.column.id,
        slug: data.column.slug,
        name: data.column.name,
        type: data.column.type,
        required: data.column.required,
        options: (data.column.optionsJson as string[] | null) ?? null,
        helpText: data.column.helpText,
      };
      onCreated(col);
      toast.success('Column added');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      <Select label="Type" value={type} onChange={(e) => setType(e.target.value)}>
        {COL_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </Select>
      {(type === 'SELECT' || type === 'MULTI_SELECT') && (
        <Input
          label="Options"
          hint="Comma-separated, e.g. Veg, Non-Veg, Vegan"
          value={options}
          onChange={(e) => setOptions(e.target.value)}
        />
      )}
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
          className="h-4 w-4 rounded"
        />
        Required
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={saving} disabled={!name.trim()}>Add</Button>
      </div>
    </form>
  );
}

// ─── CSV IMPORT ────────────────────────────────────────────────────────────
function CsvImportModal({
  open, onClose, tableId, columns, onImported,
}: {
  open: boolean;
  onClose: () => void;
  tableId: string;
  columns: Column[];
  onImported: () => void;
}) {
  const [csvRows, setCsvRows] = React.useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string | null>>({});
  const [importing, setImporting] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setCsvRows([]); setHeaders([]); setMapping({});
    }
  }, [open]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const hdrs = res.meta.fields ?? [];
        setHeaders(hdrs);
        setCsvRows(res.data as Record<string, string>[]);
        // Auto-map by best match
        const m: Record<string, string | null> = {};
        for (const h of hdrs) {
          const best = columns.find(
            (c) =>
              c.name.toLowerCase() === h.toLowerCase() ||
              c.slug.toLowerCase() === h.toLowerCase().replace(/\s+/g, '-')
          );
          m[h] = best ? best.slug : null;
        }
        setMapping(m);
        toast.success(`Parsed ${res.data.length} rows`);
      },
      error: (err) => toast.error(`Parse error: ${err.message}`),
    });
  }

  async function doImport() {
    setImporting(true);
    try {
      const res = await fetch(`/api/tables/${tableId}/import`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mapping, rows: csvRows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success(`Imported ${data.created} rows · skipped ${data.skipped}`);
      onImported();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Import CSV" size="lg">
      {csvRows.length === 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-muted)]">
            Upload a CSV with headers in the first row. We&apos;ll let you map columns next.
          </p>
          <label className="card flex flex-col items-center justify-center p-10 cursor-pointer hover:border-[var(--color-primary)]/60 transition">
            <Upload className="h-8 w-8 text-[var(--color-muted)] mb-2" />
            <span className="text-sm">Choose a CSV file</span>
            <input type="file" accept=".csv" className="hidden" onChange={onFile} />
          </label>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Columns3 className="h-4 w-4 text-[var(--color-muted)]" />
            <p className="text-sm text-[var(--color-muted)]">
              Map CSV columns → your table columns. Unmapped will be skipped.
            </p>
          </div>
          <div className="space-y-2 max-h-[40vh] overflow-y-auto">
            {headers.map((h) => (
              <div key={h} className="flex items-center gap-3">
                <span className="text-sm font-medium flex-1 min-w-0 truncate">{h}</span>
                <span className="text-[var(--color-muted)]">→</span>
                <select
                  value={mapping[h] ?? ''}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [h]: e.target.value || null }))
                  }
                  className="input-base max-w-xs"
                >
                  <option value="">— skip —</option>
                  {columns.map((c) => (
                    <option key={c.id} value={c.slug}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={doImport} loading={importing}>
              Import {csvRows.length} rows
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ImageUrlField({ label, value, onChange }: { label: string; value: string; onChange: (v: unknown) => void }) {
  return (
    <div>
      <label className="label-base">{label}</label>
      <div className="flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-16 w-16 rounded object-cover border" />
        ) : (
          <div className="h-16 w-16 rounded border bg-[var(--color-surface-2)] flex items-center justify-center text-xs text-[var(--color-muted)]">
            No image
          </div>
        )}
        <div className="flex-1 space-y-2">
          <Input
            placeholder="https://… or upload below"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <FileUpload
            compact
            accept="image/*"
            prefix="catalog"
            onUploaded={(f) => onChange(f.url)}
          />
        </div>
      </div>
    </div>
  );
}
