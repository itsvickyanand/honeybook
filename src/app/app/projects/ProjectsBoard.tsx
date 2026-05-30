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
import { GripVertical, Sparkles, Rocket, LayoutGrid, List, CheckCircle2, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils';

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
  tasksTotal: number;
  tasksOpen: number;
  tasksOverdue: number;
  serviceDate: string | null;
  serviceType: string | null;
  leadSource: string | null;
}

export function ProjectsBoard({
  oppStages,
  projStages,
  opps,
  projects,
  currency,
  locale,
}: {
  oppStages: OppStage[];
  projStages: ProjStageDef[];
  opps: OppCard[];
  projects: ProjCard[];
  currency: string;
  locale: string;
}) {
  const PROJECT_STAGES = projStages;
  const projStageKeys = new Set(projStages.map((s) => s.key));
  const firstProjKey = projStages[0]?.key ?? 'new';
  const [layout, setLayout] = React.useState<'board' | 'list'>('board');
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
  const [starting, setStarting] = React.useState<string | null>(null);
  async function startProject(leadId: string) {
    setStarting(leadId);
    try {
      const res = await fetch('/api/projects/from-opportunity', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ leadId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      // Move it off the Opportunities board and into Projects.
      const opp = oppItems.find((o) => o.id === leadId);
      setOppItems((p) => p.filter((o) => o.id !== leadId));
      if (data.project) {
        setProjItems((p) => [
          { id: data.project.id, name: data.project.name, stage: 'new', totalValue: opp?.value ?? 0, amountPaid: 0, contactName: opp?.contactName ?? null, tasksTotal: 0, tasksOpen: 0, tasksOverdue: 0, serviceDate: null, serviceType: null, leadSource: opp?.contactName ? null : null },
          ...p,
        ]);
      }
      toast.success('Project started — tasks seeded. Switch to Projects to view.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStarting(null);
    }
  }

  return (
    <div>
      {/* View + layout toggles */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border bg-[var(--color-surface)] p-1 text-sm">
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
        {view === 'projects' && (
          <div className="inline-flex rounded-xl border bg-[var(--color-surface)] p-1 text-sm">
            <button onClick={() => setLayout('board')} className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 transition ${layout === 'board' ? 'bg-[var(--color-surface-2)] font-medium' : 'text-[var(--color-muted)]'}`}>
              <LayoutGrid className="h-3.5 w-3.5" /> Board
            </button>
            <button onClick={() => setLayout('list')} className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 transition ${layout === 'list' ? 'bg-[var(--color-surface-2)] font-medium' : 'text-[var(--color-muted)]'}`}>
              <List className="h-3.5 w-3.5" /> List
            </button>
          </div>
        )}
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
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); startProject(o.id); }}
                  disabled={starting === o.id}
                  className="mt-2 inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-muted)] transition hover:border-[var(--color-primary)]/50 hover:text-[var(--color-text)] disabled:opacity-50"
                >
                  <Rocket className="h-3 w-3" />
                  {starting === o.id ? 'Starting…' : 'Start project (no payment)'}
                </button>
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
      ) : layout === 'list' ? (
        <ProjectList projects={projItems} stages={PROJECT_STAGES} currency={currency} locale={locale} />
      ) : (
        <Board
          columns={PROJECT_STAGES}
          cards={projItems.map((p) => ({ id: p.id, col: projStageKeys.has(p.stage) ? p.stage : firstProjKey }))}
          onMove={moveProj}
          renderCard={(id) => {
            const p = projItems.find((x) => x.id === id)!;
            return <ProjectCard p={p} currency={currency} locale={locale} />;
          }}
          columnTotal={(colKey) =>
            formatCurrency(
              projItems.filter((p) => (projStageKeys.has(p.stage) ? p.stage : firstProjKey) === colKey).reduce((t, p) => t + p.totalValue, 0),
              currency,
              locale
            )
          }
        />
      )}
    </div>
  );
}

function ProjectCard({ p, currency, locale }: { p: ProjCard; currency: string; locale: string }) {
  return (
    <Link href={`/app/projects/${p.id}`} className="block">
      <div className="font-medium text-sm truncate hover:underline">{p.name}</div>
      {p.contactName && <div className="text-xs text-[var(--color-muted)] truncate">{p.contactName}</div>}
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[var(--color-muted)]">
        <CheckCircle2 className="h-3 w-3" />
        {p.tasksOpen}/{p.tasksTotal} tasks
        {p.tasksOverdue > 0 && <span className="text-red-400">· {p.tasksOverdue} overdue</span>}
      </div>
      {p.serviceDate && (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--color-muted)]">
          <CalendarDays className="h-3 w-3" /> {formatDate(p.serviceDate)}
        </div>
      )}
      {p.serviceType && <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">Service: {p.serviceType}</div>}
      {p.leadSource && <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">Lead source: {p.leadSource}</div>}
      <div className="mt-1.5 flex items-center justify-between text-xs">
        <span className="text-[var(--color-muted)]">{formatCurrency(p.totalValue, currency, locale)}</span>
        {p.amountPaid > 0 && <span className="text-emerald-500">{formatCurrency(p.amountPaid, currency, locale)} paid</span>}
      </div>
    </Link>
  );
}

function ProjectList({ projects, stages, currency, locale }: { projects: ProjCard[]; stages: ProjStageDef[]; currency: string; locale: string }) {
  const stageName = (key: string) => stages.find((s) => s.key === key)?.name ?? key;
  return (
    <div className="card overflow-hidden p-0">
      <table className="w-full text-sm">
        <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wider text-[var(--color-muted)]">
          <tr>
            <th className="px-4 py-3">Project</th>
            <th className="px-4 py-3">Stage</th>
            <th className="px-4 py-3">Service date</th>
            <th className="px-4 py-3 text-right">Tasks</th>
            <th className="px-4 py-3 text-right">Value</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id} className="border-t hover:bg-[var(--color-surface-2)]/50">
              <td className="px-4 py-3">
                <Link href={`/app/projects/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                {p.contactName && <div className="text-xs text-[var(--color-muted)]">{p.contactName}</div>}
              </td>
              <td className="px-4 py-3"><span className="chip text-xs">{stageName(p.stage)}</span></td>
              <td className="px-4 py-3 text-[var(--color-muted)]">{p.serviceDate ? formatDate(p.serviceDate) : '—'}</td>
              <td className="px-4 py-3 text-right">{p.tasksOpen}/{p.tasksTotal}{p.tasksOverdue > 0 && <span className="text-red-400"> · {p.tasksOverdue}!</span>}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(p.totalValue, currency, locale)}</td>
            </tr>
          ))}
          {projects.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-[var(--color-muted)]">No projects yet.</td></tr>
          )}
        </tbody>
      </table>
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
