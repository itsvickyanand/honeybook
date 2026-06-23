'use client';
/**
 * Top-level builder shell. Owns the blocks state + DnD context.
 *
 * Layout:
 *   ┌────────────┬──────────────────────────────────┬─────────────┐
 *   │  Palette   │  Canvas (sortable list of cards) │  EditPanel  │
 *   │  (left)    │                                  │  (right)    │
 *   └────────────┴──────────────────────────────────┴─────────────┘
 *
 * Drag interactions:
 *   - Palette item → Canvas       (creates a new block at drop position)
 *   - Canvas card  → Canvas card  (reorders)
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, MeasuringStrategy,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { toast } from 'sonner';
import { ArrowLeft, Save, Eye, Loader2 } from 'lucide-react';
import type { Block, BlockType } from '@/lib/proposals/blocks';
import { BLOCK_LIBRARY } from '@/lib/proposals/blocks';
import { insertBlock, newBlock, removeBlock, updateBlock } from '@/lib/proposals/blocks-client';
import { Canvas } from './Canvas';
import { Palette } from './Palette';
import { EditPanel } from './EditPanel';
import { PreviewDrawer } from './PreviewDrawer';
import { HistoryButton } from './HistoryButton';

export interface BuilderProps {
  templateId: string;
  templateName: string;
  initialBlocks: Block[];
  vendorName: string;
  brandColor: string;
  galleries: { id: string; title: string }[];
  meetingTypes: { id: string; name: string; slug: string }[];
}

/** Drag IDs in the palette are prefixed so we can distinguish them from canvas
 *  sortable IDs (which are block.id). */
const PALETTE_PREFIX = 'palette:';

/** "Saved 12s ago" / "Saved 3m ago" / "Saved at 14:23". */
function formatTimeAgo(t: Date): string {
  const diff = Math.floor((Date.now() - t.getTime()) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `at ${t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function Builder({
  templateId,
  templateName,
  initialBlocks,
  vendorName,
  brandColor,
  galleries,
  meetingTypes,
}: BuilderProps) {
  const router = useRouter();
  const [blocks, setBlocks] = React.useState<Block[]>(initialBlocks);
  const [selectedId, setSelectedId] = React.useState<string | null>(initialBlocks[0]?.id ?? null);
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  const [, forceTick] = React.useReducer((x: number) => x + 1, 0);

  const selectedBlock = React.useMemo(
    () => blocks.find((b) => b.id === selectedId) ?? null,
    [blocks, selectedId],
  );

  // Mark dirty whenever blocks change after first render.
  const firstRender = React.useRef(true);
  React.useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setDirty(true);
  }, [blocks]);

  // Debounced autosave: 1.5s after the last edit settles. Manual save still
  // available via the button for explicit user intent.
  const lastSaved = React.useRef<string>(JSON.stringify(initialBlocks));
  React.useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => { save(false); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, dirty]);

  // Warn before navigating away with unsaved changes.
  React.useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // Cmd/Ctrl+S — force save shortcut.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks]);

  // Refresh the "Saved Xs ago" label every 10s so it stays current.
  React.useEffect(() => {
    if (!lastSavedAt) return;
    const t = setInterval(forceTick, 10_000);
    return () => clearInterval(t);
  }, [lastSavedAt]);

  async function save(explicit: boolean) {
    const snapshot = JSON.stringify(blocks);
    if (snapshot === lastSaved.current) {
      setDirty(false);
      if (explicit) toast.success('No changes to save');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/proposal-templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ blocks }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Save failed');
      }
      lastSaved.current = snapshot;
      setDirty(false);
      setLastSavedAt(new Date());
      if (explicit) toast.success('Saved');

      // Fire-and-forget: take a history snapshot. Only on explicit saves to
      // keep the cap of 5 versions meaningful (autosaves every 1.5s would
      // churn the history with near-identical entries).
      if (explicit) {
        fetch(`/api/proposal-templates/${templateId}/versions`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        }).catch(() => { /* non-critical */ });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ─── DnD handlers ──────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function onDragStart(e: DragStartEvent) {
    setActiveDragId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveDragId(null);
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;

    // Case 1: dragging from the palette — create a new block at the drop pos.
    if (activeId.startsWith(PALETTE_PREFIX)) {
      const type = activeId.slice(PALETTE_PREFIX.length) as BlockType;
      const block = newBlock(type);
      // Drop targets are existing block IDs OR the special "canvas-end" sentinel.
      const overIndex = overId === 'canvas-end'
        ? blocks.length
        : blocks.findIndex((b) => b.id === overId);
      setBlocks((prev) => insertBlock(prev, block, overIndex === -1 ? undefined : overIndex));
      setSelectedId(block.id);
      return;
    }

    // Case 2: reordering canvas blocks.
    if (activeId !== overId) {
      const oldIndex = blocks.findIndex((b) => b.id === activeId);
      const newIndex = overId === 'canvas-end'
        ? blocks.length - 1
        : blocks.findIndex((b) => b.id === overId);
      if (oldIndex >= 0 && newIndex >= 0) {
        setBlocks((prev) => arrayMove(prev, oldIndex, newIndex));
      }
    }
  }

  function onDragCancel() { setActiveDragId(null); }

  // ─── block actions ─────────────────────────────────────────────────────────
  function onBlockUpdate(id: string, patch: object) {
    setBlocks((prev) => updateBlock(prev as Block[], id, patch as never));
  }
  function onBlockDelete(id: string) {
    setBlocks((prev) => removeBlock(prev as Block[], id));
    if (selectedId === id) setSelectedId(null);
  }
  function onBlockSelect(id: string) {
    setSelectedId(id);
  }

  // Build a quick lookup for the drag-overlay preview.
  const draggedPaletteEntry = activeDragId?.startsWith(PALETTE_PREFIX)
    ? BLOCK_LIBRARY.find((b) => b.type === activeDragId.slice(PALETTE_PREFIX.length))
    : null;
  const draggedCanvasBlock = activeDragId && !activeDragId.startsWith(PALETTE_PREFIX)
    ? blocks.find((b) => b.id === activeDragId)
    : null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
    >
      <div className="flex h-screen flex-col bg-[var(--color-bg)]">
        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/app/settings/proposal-templates"
              className="btn-ghost text-sm"
              onClick={(e) => {
                if (dirty && !confirm('You have unsaved changes. Leave anyway?')) e.preventDefault();
              }}
            >
              <ArrowLeft className="h-4 w-4" /> Templates
            </Link>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{templateName}</div>
              <div className="text-xs text-[var(--color-muted)]">
                {saving ? 'Saving…' : dirty ? 'Unsaved changes' : lastSavedAt ? `Saved ${formatTimeAgo(lastSavedAt)}` : 'All changes saved'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <HistoryButton templateId={templateId} onRestored={() => router.refresh()} />
            <button onClick={() => setPreviewOpen(true)} className="btn-ghost text-sm">
              <Eye className="h-4 w-4" /> Preview
            </button>
            <button onClick={() => save(true)} disabled={saving} className="btn-primary text-sm">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
          </div>
        </header>

        {/* Three-column body */}
        <div className="grid flex-1 min-h-0 grid-cols-[260px_1fr_320px]">
          <aside className="overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <Palette palettePrefix={PALETTE_PREFIX} />
          </aside>

          <main className="overflow-y-auto p-6">
            <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              <Canvas
                blocks={blocks}
                selectedId={selectedId}
                onSelect={onBlockSelect}
                onDelete={onBlockDelete}
                brandColor={brandColor}
                vendorName={vendorName}
              />
            </SortableContext>
          </main>

          <aside className="overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <EditPanel
              templateId={templateId}
              block={selectedBlock}
              onChange={(patch) => selectedBlock && onBlockUpdate(selectedBlock.id, patch)}
              galleries={galleries}
              meetingTypes={meetingTypes}
            />
          </aside>
        </div>

        {/* Drag preview */}
        <DragOverlay>
          {draggedPaletteEntry ? (
            <div className="rounded-lg border border-[var(--color-primary)] bg-[var(--color-surface)] px-3 py-2 text-sm shadow-lg">
              {draggedPaletteEntry.label}
            </div>
          ) : draggedCanvasBlock ? (
            <div className="rounded-lg border border-[var(--color-primary)] bg-[var(--color-surface)] px-3 py-2 text-sm shadow-lg">
              {BLOCK_LIBRARY.find((b) => b.type === draggedCanvasBlock.type)?.label}
            </div>
          ) : null}
        </DragOverlay>

        <PreviewDrawer
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          blocks={blocks}
          brandColor={brandColor}
          vendorName={vendorName}
          onJumpToFirstBlock={() => router.refresh()}
        />
      </div>
    </DndContext>
  );
}
