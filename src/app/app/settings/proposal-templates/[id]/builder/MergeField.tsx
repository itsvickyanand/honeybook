'use client';
/**
 * Drop-in replacements for <input> and <textarea> that pop a merge-field
 * dropdown when the user types `{{`. Pressing Enter / clicking inserts the
 * token at the caret. ArrowUp / ArrowDown navigate, Escape dismisses.
 *
 * Why this matters: vendors authoring templates want to drop {{clientName}}
 * into a cover title without remembering exact field names. Same vocabulary as
 * the renderer (lib/proposals/render.ts).
 */
import * as React from 'react';

export const MERGE_FIELDS: { token: string; label: string; example: string }[] = [
  { token: 'clientName',   label: 'Client name',   example: 'Priya Sharma' },
  { token: 'vendorName',   label: 'Vendor name',   example: 'Avantus Studio' },
  { token: 'businessName', label: 'Business name', example: 'Avantus Studio' },
  { token: 'projectName',  label: 'Project name',  example: 'December wedding' },
  { token: 'total',        label: 'Total',         example: '₹ 1,59,300' },
  { token: 'eventDate',    label: 'Event date',    example: 'Sat, 12 Dec 2026' },
  { token: 'date',         label: "Today's date",  example: new Date().toLocaleDateString('en-IN') },
];

interface DropdownState {
  open: boolean;
  query: string;
  /** caret offset in the input where `{{` started (i.e. index of first `{`). */
  triggerStart: number;
  /** highlighted item in the filtered list */
  activeIndex: number;
}

function filtered(query: string) {
  if (!query) return MERGE_FIELDS;
  const q = query.toLowerCase();
  return MERGE_FIELDS.filter(
    (f) => f.token.toLowerCase().includes(q) || f.label.toLowerCase().includes(q),
  );
}

/** Shared core: tracks `{{` position + dropdown state for any text element. */
function useMergeDropdown<T extends HTMLInputElement | HTMLTextAreaElement>(
  value: string,
  setValue: (v: string) => void,
  elementRef: React.RefObject<T | null>,
) {
  const [state, setState] = React.useState<DropdownState>({
    open: false, query: '', triggerStart: -1, activeIndex: 0,
  });

  // Recompute open/query whenever the caret or value changes.
  function syncFromCaret() {
    const el = elementRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    // Find the most recent `{{` before the caret with no whitespace/`}` between.
    const before = value.slice(0, caret);
    const lastOpen = before.lastIndexOf('{{');
    if (lastOpen === -1) { setState((s) => ({ ...s, open: false })); return; }
    const between = before.slice(lastOpen + 2);
    if (/[\s}]/.test(between)) { setState((s) => ({ ...s, open: false })); return; }
    setState({ open: true, query: between, triggerStart: lastOpen, activeIndex: 0 });
  }

  function onChange(e: React.ChangeEvent<T>) {
    setValue(e.target.value);
    // Defer to next tick so selectionStart reflects the new value.
    queueMicrotask(syncFromCaret);
  }

  function onKeyUp() { syncFromCaret(); }
  function onBlur() {
    // Delay so a click on a dropdown item lands before we close.
    setTimeout(() => setState((s) => ({ ...s, open: false })), 100);
  }

  function insert(token: string) {
    const el = elementRef.current;
    if (!el || state.triggerStart < 0) return;
    const caret = el.selectionStart ?? value.length;
    const next =
      value.slice(0, state.triggerStart) +
      `{{${token}}}` +
      value.slice(caret);
    setValue(next);
    setState((s) => ({ ...s, open: false }));
    // Restore caret right after the inserted token.
    queueMicrotask(() => {
      const pos = state.triggerStart + token.length + 4;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<T>) {
    if (!state.open) return;
    const items = filtered(state.query);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setState((s) => ({ ...s, activeIndex: Math.min(s.activeIndex + 1, items.length - 1) }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setState((s) => ({ ...s, activeIndex: Math.max(s.activeIndex - 1, 0) }));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      const pick = items[state.activeIndex];
      if (pick) { e.preventDefault(); insert(pick.token); }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setState((s) => ({ ...s, open: false }));
    }
  }

  return { state, items: filtered(state.query), onChange, onKeyDown, onKeyUp, onBlur, insert };
}

interface MergeInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (next: string) => void;
}

export function MergeFieldInput({ value, onChange, ...rest }: MergeInputProps) {
  const ref = React.useRef<HTMLInputElement>(null);
  const m = useMergeDropdown(value, onChange, ref);
  return (
    <div className="relative">
      <input
        {...rest}
        ref={ref}
        value={value}
        onChange={m.onChange}
        onKeyDown={(e) => { rest.onKeyDown?.(e); m.onKeyDown(e); }}
        onKeyUp={(e) => { rest.onKeyUp?.(e); m.onKeyUp(); }}
        onBlur={(e) => { rest.onBlur?.(e); m.onBlur(); }}
        className={`input-base mt-1 w-full text-sm ${rest.className ?? ''}`}
      />
      <Dropdown items={m.items} active={m.state.activeIndex} open={m.state.open} onPick={m.insert} />
    </div>
  );
}

interface MergeTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (next: string) => void;
}

export function MergeFieldTextarea({ value, onChange, ...rest }: MergeTextareaProps) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const m = useMergeDropdown(value, onChange, ref);
  return (
    <div className="relative">
      <textarea
        {...rest}
        ref={ref}
        value={value}
        onChange={m.onChange}
        onKeyDown={(e) => { rest.onKeyDown?.(e); m.onKeyDown(e); }}
        onKeyUp={(e) => { rest.onKeyUp?.(e); m.onKeyUp(); }}
        onBlur={(e) => { rest.onBlur?.(e); m.onBlur(); }}
        className={`input-base mt-1 w-full text-sm ${rest.className ?? ''}`}
      />
      <Dropdown items={m.items} active={m.state.activeIndex} open={m.state.open} onPick={m.insert} />
    </div>
  );
}

function Dropdown({
  items, active, open, onPick,
}: {
  items: typeof MERGE_FIELDS;
  active: number;
  open: boolean;
  onPick: (token: string) => void;
}) {
  if (!open || !items.length) return null;
  return (
    <div className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 text-sm shadow-xl">
      {items.map((it, i) => (
        <button
          key={it.token}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onPick(it.token); }}
          className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left ${i === active ? 'bg-[var(--color-surface-2)]' : 'hover:bg-[var(--color-surface-2)]/60'}`}
        >
          <span>
            <span className="font-mono text-xs text-[var(--color-primary-soft)]">{`{{${it.token}}}`}</span>
            <span className="ml-2 text-[var(--color-muted)]">{it.label}</span>
          </span>
          <span className="text-xs text-[var(--color-muted)]">{it.example}</span>
        </button>
      ))}
    </div>
  );
}
