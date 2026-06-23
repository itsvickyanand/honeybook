'use client';
/**
 * Sidebar palette — draggable chips for each of the 14 block types.
 * Grouped by category so vendors find what they need quickly.
 *
 * Each chip is wrapped in useDraggable so the top-level DndContext picks it up
 * as `palette:<type>` — the Builder's onDragEnd distinguishes these from
 * canvas-block IDs by that prefix and creates a fresh block on drop.
 */
import * as React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  Layout, Type, Building2, ListTree, IndianRupee, CheckSquare, ScrollText,
  Image as ImageIcon, MessageSquareQuote, PenSquare, Video, CalendarPlus,
  HelpCircle, CalendarRange,
} from 'lucide-react';
import { BLOCK_LIBRARY, type BlockType } from '@/lib/proposals/blocks';

const ICONS: Record<BlockType, React.ComponentType<{ className?: string }>> = {
  cover: Layout,
  text: Type,
  about: Building2,
  services: ListTree,
  pricing: IndianRupee,
  inclusions: CheckSquare,
  terms: ScrollText,
  gallery: ImageIcon,
  quote: MessageSquareQuote,
  sign: PenSquare,
  video: Video,
  'calendar-booking': CalendarPlus,
  faq: HelpCircle,
  'payment-schedule': CalendarRange,
};

const CATEGORY_LABELS: Record<string, string> = {
  header: 'Header',
  content: 'Content',
  services: 'Services & pricing',
  social: 'Social proof',
  action: 'Actions',
  media: 'Media',
};

export function Palette({ palettePrefix }: { palettePrefix: string }) {
  // Group the library by category, preserving order within each category.
  const groups = React.useMemo(() => {
    const m = new Map<string, typeof BLOCK_LIBRARY>();
    for (const entry of BLOCK_LIBRARY) {
      const list = m.get(entry.category) ?? [];
      list.push(entry);
      m.set(entry.category, list);
    }
    return [...m.entries()];
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold">Blocks</h2>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          Drag onto the canvas, or click an existing block to edit it.
        </p>
      </div>

      {groups.map(([category, items]) => (
        <div key={category}>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            {CATEGORY_LABELS[category] ?? category}
          </div>
          <div className="space-y-1.5">
            {items.map((it) => (
              <PaletteItem
                key={it.type}
                type={it.type}
                label={it.label}
                description={it.description}
                Icon={ICONS[it.type]}
                dragId={`${palettePrefix}${it.type}`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PaletteItem({
  dragId,
  label,
  description,
  Icon,
}: {
  type: BlockType;
  dragId: string;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: dragId });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      title={description}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
      }}
      className="group flex w-full items-start gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2 text-left text-xs transition hover:border-[var(--color-primary)]/60 active:cursor-grabbing"
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-primary-soft)]" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{label}</div>
        <div className="truncate text-[10px] text-[var(--color-muted)]">{description}</div>
      </div>
    </button>
  );
}
