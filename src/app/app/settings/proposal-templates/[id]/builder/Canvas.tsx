'use client';
/**
 * The sortable vertical canvas. Each block is a BlockCard. The bottom drop-zone
 * (`canvas-end`) lets vendors drop a palette item below all existing blocks
 * when the canvas is shorter than the viewport.
 */
import * as React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import type { Block } from '@/lib/proposals/blocks';
import { BLOCK_LIBRARY } from '@/lib/proposals/blocks';
import { renderBlock } from '@/lib/proposals/blocks-render';
import { sampleVars } from '@/lib/proposals/blocks-client';

export interface CanvasProps {
  blocks: Block[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  brandColor: string;
  vendorName: string;
}

export function Canvas({ blocks, selectedId, onSelect, onDelete, brandColor, vendorName }: CanvasProps) {
  if (blocks.length === 0) {
    return <EmptyState />;
  }
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      {blocks.map((b) => (
        <BlockCard
          key={b.id}
          block={b}
          selected={selectedId === b.id}
          onSelect={() => onSelect(b.id)}
          onDelete={() => onDelete(b.id)}
          brandColor={brandColor}
          vendorName={vendorName}
        />
      ))}
      <DropEnd />
    </div>
  );
}

function EmptyState() {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas-end' });
  return (
    <div
      ref={setNodeRef}
      className={`mx-auto flex max-w-2xl flex-col items-center justify-center rounded-2xl border-2 border-dashed p-16 text-center transition ${
        isOver ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5' : 'border-[var(--color-border)]'
      }`}
    >
      <div className="mb-2 text-sm font-semibold">Drag a block here to start</div>
      <p className="text-xs text-[var(--color-muted)]">Pick from the palette on the left — Cover usually goes first.</p>
    </div>
  );
}

function DropEnd() {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas-end' });
  return (
    <div
      ref={setNodeRef}
      className={`flex items-center justify-center rounded-xl border-2 border-dashed py-4 text-xs transition ${
        isOver
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-primary-soft)]'
          : 'border-[var(--color-border)] text-[var(--color-muted)]'
      }`}
    >
      Drop a block here to add it at the end
    </div>
  );
}

function BlockCard({
  block,
  selected,
  onSelect,
  onDelete,
  brandColor,
  vendorName,
}: {
  block: Block;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  brandColor: string;
  vendorName: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const libraryEntry = BLOCK_LIBRARY.find((b) => b.type === block.type);

  // Render the block's HTML preview using the production renderer. We pass a
  // minimal context — services/pricing/payment-schedule blocks will be mostly
  // empty here (no live proposal data) but everything still renders.
  const previewHtml = React.useMemo(
    () => {
      try {
        return renderBlock(block, {
          doc: {
            title: 'Sample',
            greeting: '',
            intro: '',
            sections: [],
            inclusions: [],
            terms: [],
            validityDays: 14,
            discount: 0,
            taxRate: 18,
            taxLabel: 'GST',
            currency: 'INR',
            vendorName,
            clientName: 'Priya Sharma',
          },
          vars: sampleVars(vendorName),
          accentColor: brandColor,
          vendorLogoUrl: null,
          totals: {
            subTotal: '₹ 2,00,000',
            discount: '₹ 0',
            tax: '₹ 40,000',
            total: '₹ 2,40,000',
            taxLabel: 'GST',
            taxRate: 18,
          },
          galleries: [],
          paymentSchedule: [],
          defaultDepositPercent: 50,
          appUrl: '',
          formatShortDate: (d) => new Date(d).toLocaleDateString('en-IN'),
        });
      } catch {
        return `<div style="padding:24px;color:#888;font-size:13px;">Couldn't render preview.</div>`;
      }
    },
    [block, brandColor, vendorName],
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      onClick={onSelect}
      className={`group relative cursor-pointer rounded-xl border bg-[var(--color-surface)] transition ${
        selected ? 'border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/30' : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/40'
      }`}
    >
      {/* Block toolbar — appears on hover */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
        <div className="flex items-center gap-2">
          <button
            ref={setNodeRef as never}
            {...attributes}
            {...listeners}
            type="button"
            aria-label="Drag to reorder"
            onClick={(e) => e.stopPropagation()}
            className="-ml-1 cursor-grab p-1 text-[var(--color-muted)] hover:text-white active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <span className="font-semibold">{libraryEntry?.label ?? block.type}</span>
        </div>
        <button
          type="button"
          aria-label="Delete block"
          onClick={(e) => { e.stopPropagation(); if (confirm('Remove this block?')) onDelete(); }}
          className="rounded p-1 text-[var(--color-muted)] opacity-0 transition hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Live preview of the block */}
      <div
        className="pointer-events-none p-2 text-[13px]"
        // The renderer output is trusted (we own it). Wrap in a scoped container
        // so block CSS doesn't bleed into the builder chrome.
        dangerouslySetInnerHTML={{ __html: previewHtml }}
      />
    </div>
  );
}
