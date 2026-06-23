/**
 * Client-side helpers for the block builder. Pure — no server imports.
 *
 *   newBlock(type)         → create a Block with defaultProps + fresh id
 *   moveBlock(blocks, src, dst) → reorder (used by dnd onDragEnd)
 *   updateBlock(blocks, id, props) → immutable patch
 *   removeBlock(blocks, id)
 *   sampleVars()           → realistic merge-field values for live preview
 */
import { nanoid } from 'nanoid';
import type { Block, BlockType } from './blocks';
import { BLOCK_LIBRARY } from './blocks';
import type { ProposalVars } from './render';

export function newBlock(type: BlockType): Block {
  const entry = BLOCK_LIBRARY.find((b) => b.type === type);
  if (!entry) throw new Error(`Unknown block type: ${type}`);
  // The BLOCK_LIBRARY default-props factories are typed per-variant, but the
  // union narrowing isn't expressible in TS without a giant switch. The cast
  // here is safe — each library entry returns props matching its `type`.
  return { id: nanoid(10), type, props: entry.defaultProps() } as Block;
}

export function moveBlock<T extends Block>(blocks: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return blocks;
  const next = blocks.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function updateBlock<T extends Block>(
  blocks: T[],
  id: string,
  patch: Partial<T['props']>,
): T[] {
  return blocks.map((b) => (b.id === id ? ({ ...b, props: { ...b.props, ...patch } } as T) : b));
}

export function insertBlock<T extends Block>(blocks: T[], block: T, atIndex?: number): T[] {
  if (atIndex === undefined || atIndex >= blocks.length) return [...blocks, block];
  const next = blocks.slice();
  next.splice(atIndex, 0, block);
  return next;
}

export function removeBlock<T extends Block>(blocks: T[], id: string): T[] {
  return blocks.filter((b) => b.id !== id);
}

/** Sample merge-field values used in the builder's live preview. */
export function sampleVars(vendorName: string): ProposalVars {
  return {
    clientName: 'Priya Sharma',
    vendorName,
    businessName: vendorName,
    projectName: 'December event',
    total: '₹ 2,40,000',
    eventDate: 'Sat, 12 Dec 2026',
    date: new Date().toLocaleDateString('en-IN'),
  };
}
