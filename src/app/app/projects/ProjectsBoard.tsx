'use client';

/**
 * Two-board kanban for the Projects page.
 *
 *  - "Opportunities" tab → pre-sale Leads grouped by their pipeline Stage.
 *    Moving a card PATCHes /api/leads/[id] { stageId }.
 *  - "Projects" tab → post-sale Projects grouped by delivery stage.
 *    Moving a card PATCHes /api/projects/[id] { stage }.
 *
 * Native HTML5 drag-and-drop (no extra deps), matching the Leads board.
 */
import * as React from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { GripVertical, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';

export interface OppStage {
  id: string;
  name: string;
  color: string;
}
export interface OppCard {
  id: string;
  title: string;
  stageId: string;
  value: number;
  score: number;
  contactName: string | null;
}
export interface ProjStageDef {
  key: string;
  name: string;
  color: string;
}
export interface ProjCard {
  id: string;
  name: string;
  stage: string;
  totalValue: number;
  amountPaid: number;
  contactName: string | null;
}

const PROJECT_STAGES: ProjStageDef[] = [
  { key: 'KICKOFF', name: 'Kick off', color: '#64748b' },
  { key: 'ONBOARDING', name: 'Onboarding', color: '#3b82f6' },
  { key: 'PLANNING', name: 'Planning', color: '#8b5cf6' },
  { key: 'DELIVERY', name: 'Delivery', color: '#f59e0b' },
  { key: 'COMPLETED', name: 'Completed', color: '#10b981' },
  { key: 'ARCHIVED', name: 'Archived', color: '#475569' },
];

export function ProjectsBoard({
  oppStages,
  opps,
  projects,
  currency,
  locale,
}: {
  oppStages: OppStage[];
  opps: OppCard[];
  projects: ProjCard[];
  currency: string;
  locale: string;
}) {
  const [view, setView] = React.useState<'opps' | 'projects'>(
    projects.length > 0 && opps.length === 0 ? 'projects' : 'opps'
  );
  const [oppItems, setOppItems] = React.useState(opps);
  const [projItems, setProjItems] = React.useState(projects);

  async function moveOpp(id: string, stageId: string) {
    setOppItems((p) => p.map((l) => (l.id === id ? { ...l, stageId } : l)));
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stageId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error('Could not move opportunity');
    }
  }
  async function moveProj(id: string, stage: string) {
    setProjItems((p) => p.map((x) => (x.id === id ? { ...x, stage } : x)));
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error('Could not move project');
    }
  }

  return (
    <div>
      {/* View toggle */}
      <div className="mb-5 inline-flex rounded-xl border bg-[var(--color-surface)] p-1 text-sm">
        <button
          onClick={() => setView('opps')}
          className={`rounded-lg px-4 py-1.5 transition ${
            view === 'opps' ? 'bg-[var(--color-surface-2)] font-medium' : 'text-[var(--color-muted)]'
          }`}
        >
          Opportunities <span className="ml-1 text-xs opacity-70">{oppItems.length}</span>
        </button>
        <button
          onClick={() => setView('projects')}
          className={`rounded-lg px-4 py-1.5 transition ${
            view === 'projects' ? 'bg-[var(--color-surface-2)] font-medium' : 'text-[var(--color-muted)]'
          }`}
        >
          Projects <span className="ml-1 text-xs opacity-70">{projItems.length}</span>
        </button>
      </div>

      {view === 'opps' ? (
        <Board
          columns={oppStages.map((s) => ({ key: s.id, name: s.name, color: s.color }))}
          cards={oppItems.map((o) => ({ id: o.id, col: o.stageId }))}
          onMove={moveOpp}
          renderCard={(id) => {
            const o = oppItems.find((x) => x.id === id)!;
            return (
              <div>
                <div className="font-medium text-sm truncate">{o.title}</div>
                {o.contactName && (
                  <div className="text-xs text-[var(--color-muted)] truncate">{o.contactName}</div>
                )}
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className="text-[var(--color-muted)]">{formatCurrency(o.value, currency, locale)}</span>
                  {o.score > 0 && (
                    <span className="inline-flex items-center gap-1 text-[var(--color-primary-soft)]">
                      <Sparkles className="h-3 w-3" />
                      {o.score}
                    </span>
                  )}
                </div>
              </div>
            );
          }}
          columnTotal={(colKey) =>
            formatCurrency(
              oppItems.filter((o) => o.stageId === colKey).reduce((t, o) => t + o.value, 0),
              currency,
              locale
            )
          }
        />
      ) : (
        <Board
          columns={PROJECT_STAGES}
          cards={projItems.map((p) => ({ id: p.id, col: p.stage }))}
          onMove={moveProj}
          renderCard={(id) => {
            const p = projItems.find((x) => x.id === id)!;
            return (
              <Link href={`/app/projects/${p.id}`} className="block">
                <div className="font-medium text-sm truncate hover:underline">{p.name}</div>
                {p.contactName && (
                  <div className="text-xs text-[var(--color-muted)] truncate">{p.contactName}</div>
                )}
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className="text-[var(--color-muted)]">{formatCurrency(p.totalValue, currency, locale)}</span>
                  {p.amountPaid > 0 && (
                    <span className="text-emerald-500">{formatCurrency(p.amountPaid, currency, locale)} paid</span>
                  )}
                </div>
              </Link>
            );
          }}
          columnTotal={(colKey) =>
            formatCurrency(
              projItems.filter((p) => p.stage === colKey).reduce((t, p) => t + p.totalValue, 0),
              currency,
              locale
            )
          }
        />
      )}
    </div>
  );
}

function Board({
  columns,
  cards,
  onMove,
  renderCard,
  columnTotal,
}: {
  columns: { key: string; name: string; color: string }[];
  cards: { id: string; col: string }[];
  onMove: (id: string, col: string) => void;
  renderCard: (id: string) => React.ReactNode;
  columnTotal: (colKey: string) => string;
}) {
  function onDrop(e: React.DragEvent, col: string) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/card-id');
    if (id) onMove(id, col);
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {columns.map((col) => {
        const colCards = cards.filter((c) => c.col === col.key);
        return (
          <div
            key={col.key}
            className="min-w-[260px] max-w-xs flex-1"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, col.key)}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: col.color }} />
                <h3 className="text-sm font-semibold">{col.name}</h3>
                <span className="chip text-xs">{colCards.length}</span>
              </div>
              <span className="text-xs text-[var(--color-muted)]">{columnTotal(col.key)}</span>
            </div>
            <div className="min-h-[200px] space-y-2 rounded-2xl border bg-[var(--color-surface)]/40 p-2">
              <AnimatePresence>
                {colCards.map((c) => (
                  <motion.div
                    key={c.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    draggable
                    onDragStart={(e) =>
                      (e as unknown as React.DragEvent).dataTransfer.setData('text/card-id', c.id)
                    }
                    className="card flex cursor-grab items-start gap-2 p-3 transition hover:border-[var(--color-primary)]/60 active:cursor-grabbing"
                  >
                    <GripVertical className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--color-muted)]" />
                    <div className="min-w-0 flex-1">{renderCard(c.id)}</div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        );
      })}
    </div>
  );
}
