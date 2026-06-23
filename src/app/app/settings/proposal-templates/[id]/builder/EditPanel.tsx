'use client';
/**
 * Right rail editor — switches by block type.
 *
 * Rich-text blocks (text, about) use Tiptap. Everything else uses plain inputs.
 * Each block type's editor is small enough to keep inline; if the file grows
 * too large later, split into editors/*.tsx.
 */
import * as React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Bold, Italic, Link as LinkIcon, List, Trash2, Plus, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type {
  Block, CoverProps, TextProps, AboutProps, ServicesProps, PricingProps,
  InclusionsProps, TermsProps, GalleryProps, QuoteProps, SignProps, VideoProps,
  CalendarBookingProps, FaqProps, PaymentScheduleProps,
} from '@/lib/proposals/blocks';
import { MergeFieldInput, MergeFieldTextarea } from './MergeField';

export interface EditPanelProps {
  templateId: string;
  block: Block | null;
  onChange: (patch: object) => void;
  galleries: { id: string; title: string }[];
  meetingTypes: { id: string; name: string; slug: string }[];
}

export function EditPanel({ templateId, block, onChange, galleries, meetingTypes }: EditPanelProps) {
  if (!block) {
    return (
      <div className="text-sm text-[var(--color-muted)]">
        <div className="mb-1 font-semibold text-white">Edit block</div>
        <p className="text-xs">Click a block on the canvas to edit its content.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">Editing</div>
        <div className="font-semibold capitalize">{block.type.replace('-', ' ')}</div>
      </div>
      {renderEditor(block, onChange, { templateId, galleries, meetingTypes })}
    </div>
  );
}

interface EditorCtx {
  templateId: string;
  galleries: { id: string; title: string }[];
  meetingTypes: { id: string; name: string; slug: string }[];
}

function renderEditor(block: Block, onChange: (p: object) => void, ctx: EditorCtx) {
  switch (block.type) {
    case 'cover':            return <CoverEditor props={block.props} onChange={onChange} />;
    case 'text':             return <TextEditor props={block.props} onChange={onChange} templateId={ctx.templateId} />;
    case 'about':            return <AboutEditor props={block.props} onChange={onChange} templateId={ctx.templateId} />;
    case 'services':         return <ServicesEditor props={block.props} onChange={onChange} />;
    case 'pricing':          return <PricingEditor props={block.props} onChange={onChange} />;
    case 'inclusions':       return <InclusionsEditor props={block.props} onChange={onChange} />;
    case 'terms':            return <TermsEditor props={block.props} onChange={onChange} />;
    case 'gallery':          return <GalleryEditor props={block.props} onChange={onChange} galleries={ctx.galleries} />;
    case 'quote':            return <QuoteEditor props={block.props} onChange={onChange} templateId={ctx.templateId} />;
    case 'sign':             return <SignEditor props={block.props} onChange={onChange} />;
    case 'video':            return <VideoEditor props={block.props} onChange={onChange} />;
    case 'calendar-booking': return <CalendarBookingEditor props={block.props} onChange={onChange} meetingTypes={ctx.meetingTypes} />;
    case 'faq':              return <FaqEditor props={block.props} onChange={onChange} templateId={ctx.templateId} />;
    case 'payment-schedule': return <PaymentScheduleEditor props={block.props} onChange={onChange} />;
    default: return null;
  }
}

// ─── shared form pieces ──────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">{children}</label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input-base mt-1 w-full text-sm ${props.className ?? ''}`} />;
}
function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`input-base mt-1 w-full text-sm ${props.className ?? ''}`} />;
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`input-base mt-1 w-full text-sm ${props.className ?? ''}`} />;
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint && <div className="mt-1 text-[10px] text-[var(--color-muted)]">{hint}</div>}
    </div>
  );
}

const REWRITE_PRESETS: { tone: 'warm' | 'formal' | 'concise' | 'playful'; label: string }[] = [
  { tone: 'warm',    label: 'Make warmer' },
  { tone: 'formal',  label: 'Make formal' },
  { tone: 'concise', label: 'Tighten / concise' },
  { tone: 'playful', label: 'Make playful' },
];

/** Sparkles button that opens a 4-preset menu (+ custom). Sends the current
 *  text to /api/proposal-templates/[id]/rewrite and pushes the rewritten copy
 *  back through onApply. */
function AiRewriteButton({
  templateId, text, kind, onApply,
}: {
  templateId: string;
  text: string;
  kind: 'plain' | 'html';
  onApply: (next: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [customOpen, setCustomOpen] = React.useState(false);
  const [custom, setCustom] = React.useState('');

  async function run(tone: 'warm' | 'formal' | 'concise' | 'playful' | 'custom', customInstruction?: string) {
    setBusy(true); setOpen(false); setCustomOpen(false);
    try {
      const res = await fetch(`/api/proposal-templates/${templateId}/rewrite`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, tone, customInstruction, kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Rewrite failed');
      onApply(data.text);
      if (data.mock) toast('Demo mode — add ANTHROPIC_API_KEY for AI rewrites');
      else toast.success('Rewritten');
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        disabled={busy || !text.trim()}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] hover:border-[var(--color-primary)]/60 disabled:opacity-50"
        title="Rewrite with AI"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-[var(--color-primary-soft)]" />}
        AI rewrite
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 text-sm shadow-xl">
          {REWRITE_PRESETS.map((p) => (
            <button
              key={p.tone}
              type="button"
              onClick={() => run(p.tone)}
              className="block w-full px-3 py-1.5 text-left hover:bg-[var(--color-surface-2)]"
            >
              {p.label}
            </button>
          ))}
          <div className="my-1 border-t border-[var(--color-border)]" />
          <button
            type="button"
            onClick={() => { setOpen(false); setCustomOpen(true); }}
            className="block w-full px-3 py-1.5 text-left hover:bg-[var(--color-surface-2)]"
          >
            Custom instruction…
          </button>
        </div>
      )}
      {customOpen && (
        <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm shadow-xl">
          <Label>Your instruction</Label>
          <textarea
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="e.g. Mention our 10 years of experience"
            rows={3}
            className="input-base mt-1 w-full text-sm"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setCustomOpen(false)} className="btn-ghost text-xs">Cancel</button>
            <button
              type="button"
              onClick={() => custom.trim() && run('custom', custom.trim())}
              disabled={!custom.trim()}
              className="btn-primary text-xs"
            >
              Rewrite
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Tiptap rich-text editor — used by text / about / faq.a fields. */
function RichText({ value, onChange, placeholder }: { value: string; onChange: (html: string) => void; placeholder?: string }) {
  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false })],
    content: value,
    onUpdate({ editor }) { onChange(editor.getHTML()); },
    editorProps: {
      attributes: {
        class: 'min-h-[100px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] prose prose-sm prose-invert max-w-none',
      },
    },
    immediatelyRender: false,
  });
  // Keep editor in sync when the parent swaps blocks (without reinit each keystroke).
  React.useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) editor.commands.setContent(value, { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  if (!editor) return null;
  return (
    <div>
      <div className="mb-1 flex gap-1">
        <RTButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-3 w-3" /></RTButton>
        <RTButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-3 w-3" /></RTButton>
        <RTButton active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-3 w-3" /></RTButton>
        <RTButton
          active={editor.isActive('link')}
          onClick={() => {
            const url = window.prompt('URL', editor.getAttributes('link').href ?? 'https://');
            if (url === null) return;
            if (url === '') editor.chain().focus().unsetLink().run();
            else editor.chain().focus().setLink({ href: url }).run();
          }}
        ><LinkIcon className="h-3 w-3" /></RTButton>
      </div>
      <EditorContent editor={editor} />
      {placeholder && !value && <div className="mt-1 text-[10px] text-[var(--color-muted)]">{placeholder}</div>}
    </div>
  );
}
function RTButton({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded p-1 text-xs ${active ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary-soft)]' : 'text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]'}`}
    >
      {children}
    </button>
  );
}

/** Simple list editor — items add / edit / remove. */
function ItemList({
  items, onChange, addLabel = 'Add item', placeholder,
}: { items: string[]; onChange: (next: string[]) => void; addLabel?: string; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <input
            value={it}
            placeholder={placeholder}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            className="input-base w-full text-sm"
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="rounded p-1.5 text-[var(--color-muted)] hover:bg-red-500/10 hover:text-red-300"
            aria-label="Remove item"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, ''])}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-muted)] hover:border-[var(--color-primary)]/60 hover:text-white"
      >
        <Plus className="h-3 w-3" /> {addLabel}
      </button>
    </div>
  );
}

// ─── individual editors ──────────────────────────────────────────────────────
function CoverEditor({ props, onChange }: { props: CoverProps; onChange: (p: object) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Title" hint="Type {{ for merge fields">
        <MergeFieldInput value={props.title} onChange={(v) => onChange({ title: v })} />
      </Field>
      <Field label="Subtitle" hint="Type {{ for merge fields">
        <MergeFieldInput value={props.subtitle ?? ''} onChange={(v) => onChange({ subtitle: v })} placeholder="e.g. From {{vendorName}}" />
      </Field>
      <Field label="Kicker (optional)" hint="Type {{ for merge fields">
        <MergeFieldInput value={props.kicker ?? ''} onChange={(v) => onChange({ kicker: v })} placeholder="e.g. {{date}}" />
      </Field>
      <Field label="Hero image URL (optional)">
        <Input value={props.imageUrl ?? ''} onChange={(e) => onChange({ imageUrl: e.target.value || null })} placeholder="https://..." />
      </Field>
      <p className="text-[10px] text-[var(--color-muted)]">Available merge fields: {'{{clientName}}, {{vendorName}}, {{businessName}}, {{projectName}}, {{date}}, {{eventDate}}, {{total}}'}</p>
    </div>
  );
}

function TextEditor({ props, onChange, templateId }: { props: TextProps; onChange: (p: object) => void; templateId: string }) {
  return (
    <div className="space-y-3">
      <Field label="Body">
        <RichText value={props.html} onChange={(html) => onChange({ html })} />
        <div className="mt-2 flex justify-end">
          <AiRewriteButton templateId={templateId} text={props.html} kind="html" onApply={(html) => onChange({ html })} />
        </div>
      </Field>
      <Field label="Variant">
        <Select value={props.variant ?? 'normal'} onChange={(e) => onChange({ variant: e.target.value })}>
          <option value="normal">Normal paragraph</option>
          <option value="callout">Callout box (highlighted)</option>
        </Select>
      </Field>
    </div>
  );
}

function AboutEditor({ props, onChange, templateId }: { props: AboutProps; onChange: (p: object) => void; templateId: string }) {
  return (
    <div className="space-y-3">
      <Field label="About copy">
        <RichText value={props.html} onChange={(html) => onChange({ html })} />
        <div className="mt-2 flex justify-end">
          <AiRewriteButton templateId={templateId} text={props.html} kind="html" onApply={(html) => onChange({ html })} />
        </div>
      </Field>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!props.showLogo} onChange={(e) => onChange({ showLogo: e.target.checked })} />
        Show vendor logo above the text
      </label>
    </div>
  );
}

function ServicesEditor({ props, onChange }: { props: ServicesProps; onChange: (p: object) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Layout">
        <Select value={props.layout ?? 'detailed'} onChange={(e) => onChange({ layout: e.target.value })}>
          <option value="detailed">Detailed (with descriptions)</option>
          <option value="compact">Compact (one line each)</option>
        </Select>
      </Field>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!props.showItemImages} onChange={(e) => onChange({ showItemImages: e.target.checked })} />
        Show item images when available
      </label>
      <p className="text-[10px] text-[var(--color-muted)]">Services + line items come from the proposal itself — not editable here.</p>
    </div>
  );
}

function PricingEditor({ props, onChange }: { props: PricingProps; onChange: (p: object) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Layout">
        <Select value={props.layout ?? 'breakdown'} onChange={(e) => onChange({ layout: e.target.value })}>
          <option value="breakdown">Breakdown (sub-total + tax + total)</option>
          <option value="summary">Summary (just the final number)</option>
        </Select>
      </Field>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={props.showTaxBreakdown !== false} onChange={(e) => onChange({ showTaxBreakdown: e.target.checked })} />
        Show GST / tax line
      </label>
    </div>
  );
}

function InclusionsEditor({ props, onChange }: { props: InclusionsProps; onChange: (p: object) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Title">
        <Input value={props.title ?? ''} onChange={(e) => onChange({ title: e.target.value })} />
      </Field>
      <Field label="Items">
        <ItemList items={props.items} onChange={(items) => onChange({ items })} placeholder="e.g. GST included" />
      </Field>
    </div>
  );
}

function TermsEditor({ props, onChange }: { props: TermsProps; onChange: (p: object) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Title">
        <Input value={props.title ?? ''} onChange={(e) => onChange({ title: e.target.value })} />
      </Field>
      <Field label="Terms">
        <ItemList items={props.items} onChange={(items) => onChange({ items })} placeholder="e.g. 50% advance to confirm" />
      </Field>
    </div>
  );
}

function GalleryEditor({ props, onChange, galleries }: { props: GalleryProps; onChange: (p: object) => void; galleries: { id: string; title: string }[] }) {
  return (
    <div className="space-y-3">
      <Field label="Pick a gallery">
        <Select value={props.galleryId ?? ''} onChange={(e) => onChange({ galleryId: e.target.value || null })}>
          <option value="">— Auto (most recent) —</option>
          {galleries.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
        </Select>
      </Field>
      <Field label="Layout">
        <Select value={props.layout ?? 'grid'} onChange={(e) => onChange({ layout: e.target.value })}>
          <option value="grid">Grid</option>
          <option value="mosaic">Mosaic</option>
          <option value="carousel">Carousel</option>
        </Select>
      </Field>
      <Field label="Max items to show">
        <Input type="number" min={1} max={20} value={props.maxItems ?? 6} onChange={(e) => onChange({ maxItems: Number(e.target.value) || 6 })} />
      </Field>
    </div>
  );
}

function QuoteEditor({ props, onChange, templateId }: { props: QuoteProps; onChange: (p: object) => void; templateId: string }) {
  return (
    <div className="space-y-3">
      <Field label="Quote" hint="Type {{ for merge fields">
        <MergeFieldTextarea rows={3} value={props.text} onChange={(v) => onChange({ text: v })} />
        <div className="mt-2 flex justify-end">
          <AiRewriteButton templateId={templateId} text={props.text} kind="plain" onApply={(text) => onChange({ text })} />
        </div>
      </Field>
      <Field label="Author">
        <Input value={props.author ?? ''} onChange={(e) => onChange({ author: e.target.value })} placeholder="e.g. Anjali R." />
      </Field>
      <Field label="Author role / company (optional)">
        <Input value={props.authorRole ?? ''} onChange={(e) => onChange({ authorRole: e.target.value })} />
      </Field>
    </div>
  );
}

function SignEditor({ props, onChange }: { props: SignProps; onChange: (p: object) => void }) {
  const providers = new Set(props.providers ?? ['digio', 'docusign']);
  function toggle(p: 'digio' | 'docusign') {
    const next = new Set(providers);
    if (next.has(p)) next.delete(p); else next.add(p);
    onChange({ providers: [...next] });
  }
  return (
    <div className="space-y-3">
      <Field label="Heading">
        <Input value={props.title ?? ''} onChange={(e) => onChange({ title: e.target.value })} />
      </Field>
      <div>
        <Label>Signing methods</Label>
        <div className="mt-1 space-y-1">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={providers.has('digio')} onChange={() => toggle('digio')} /> Aadhaar (Digio)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={providers.has('docusign')} onChange={() => toggle('docusign')} /> DocuSign
          </label>
        </div>
      </div>
    </div>
  );
}

function VideoEditor({ props, onChange }: { props: VideoProps; onChange: (p: object) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Embed URL">
        <Input value={props.url} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://www.youtube.com/embed/..." />
      </Field>
      <Field label="Caption (optional)">
        <Input value={props.caption ?? ''} onChange={(e) => onChange({ caption: e.target.value })} />
      </Field>
      <p className="text-[10px] text-[var(--color-muted)]">Use the embed URL (e.g. youtube.com/embed/&lt;id&gt;) — not the watch URL.</p>
    </div>
  );
}

function CalendarBookingEditor({ props, onChange, meetingTypes }: { props: CalendarBookingProps; onChange: (p: object) => void; meetingTypes: { id: string; name: string; slug: string }[] }) {
  return (
    <div className="space-y-3">
      <Field label="Title">
        <Input value={props.title ?? ''} onChange={(e) => onChange({ title: e.target.value })} />
      </Field>
      <Field label="Meeting type">
        <Select value={props.meetingTypeSlug ?? ''} onChange={(e) => onChange({ meetingTypeSlug: e.target.value || null })}>
          <option value="">— Pick a meeting type —</option>
          {meetingTypes.map((m) => <option key={m.id} value={m.slug}>{m.name}</option>)}
        </Select>
      </Field>
      {meetingTypes.length === 0 && (
        <p className="text-[10px] text-[var(--color-muted)]">No active meeting types — create one in Settings → Scheduling first.</p>
      )}
    </div>
  );
}

function FaqEditor({ props, onChange, templateId: _templateId }: { props: FaqProps; onChange: (p: object) => void; templateId: string }) {
  function updateItem(i: number, patch: Partial<{ q: string; a: string }>) {
    onChange({ items: props.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  }
  return (
    <div className="space-y-3">
      <Field label="Title">
        <Input value={props.title ?? ''} onChange={(e) => onChange({ title: e.target.value })} />
      </Field>
      <Label>Questions</Label>
      <div className="space-y-3">
        {props.items.map((it, i) => (
          <div key={i} className="rounded-md border border-[var(--color-border)] p-2">
            <Input value={it.q} onChange={(e) => updateItem(i, { q: e.target.value })} placeholder="Question" />
            <div className="mt-2">
              <RichText value={it.a} onChange={(html) => updateItem(i, { a: html })} placeholder="Answer (rich text)" />
            </div>
            <button
              type="button"
              onClick={() => onChange({ items: props.items.filter((_, j) => j !== i) })}
              className="mt-2 inline-flex items-center gap-1 text-[10px] text-red-300 hover:text-red-200"
            >
              <Trash2 className="h-3 w-3" /> Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ items: [...props.items, { q: '', a: '' }] })}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-muted)] hover:border-[var(--color-primary)]/60 hover:text-white"
        >
          <Plus className="h-3 w-3" /> Add Q&A
        </button>
      </div>
    </div>
  );
}

function PaymentScheduleEditor({ props, onChange }: { props: PaymentScheduleProps; onChange: (p: object) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Title">
        <Input value={props.title ?? ''} onChange={(e) => onChange({ title: e.target.value })} />
      </Field>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={props.fallbackToDeposit !== false} onChange={(e) => onChange({ fallbackToDeposit: e.target.checked })} />
        Show advance/balance when no real schedule exists yet
      </label>
      <p className="text-[10px] text-[var(--color-muted)]">Live schedule rows are read from the project — this block can only hint at the shape when the proposal is first created.</p>
    </div>
  );
}
