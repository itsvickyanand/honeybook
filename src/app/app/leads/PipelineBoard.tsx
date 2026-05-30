'use client';
import * as React from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { GripVertical, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';

interface Stage {
  id: string;
  name: string;
  color: string;
  isClosedWon: boolean;
  isClosedLost: boolean;
}

interface Lead {
  id: string;
  title: string;
  stageId: string;
  value: number;
  score: number;
  contactName: string | null;
  source: string | null;
}

export function PipelineBoard({
  stages, leads, currency, locale,
}: {
  stages: Stage[];
  leads: Lead[];
  currency: string;
  locale: string;
}) {
  const [items, setItems] = React.useState(leads);
  const byStage = React.useMemo(() => {
    const m = new Map<string, Lead[]>();
    for (const s of stages) m.set(s.id, []);
    for (const l of items) (m.get(l.stageId) ?? m.set(l.stageId, []).get(l.stageId)!).push(l);
    return m;
  }, [items, stages]);

  async function moveTo(leadId: string, stageId: string) {
    setItems((prev) => prev.map((l) => (l.id === leadId ? { ...l, stageId } : l)));
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stageId }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      toast.error('Could not move lead');
    }
  }

  function onDragStart(e: React.DragEvent, leadId: string) {
    e.dataTransfer.setData('text/lead-id', leadId);
    e.dataTransfer.effectAllowed = 'move';
  }
  function onDrop(e: React.DragEvent, stageId: string) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/lead-id');
    if (id) moveTo(id, stageId);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {stages.map((stage) => {
        const stageLeads = byStage.get(stage.id) ?? [];
        const stageTotal = stageLeads.reduce((t, l) => t + l.value, 0);
        return (
          <div
            key={stage.id}
            className="flex-1 min-w-[260px] max-w-xs"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, stage.id)}
          >
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: stage.color }}
                />
                <h3 className="font-semibold text-sm">{stage.name}</h3>
                <span className="chip text-xs">{stageLeads.length}</span>
              </div>
              <span className="text-xs text-[var(--color-muted)]">
                {formatCurrency(stageTotal, currency, locale)}
              </span>
            </div>
            <div className="space-y-2 min-h-[200px] rounded-2xl border bg-[var(--color-surface)]/40 p-2">
              <AnimatePresence>
                {stageLeads.map((l) => (
                  <motion.div
                    key={l.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    draggable
                    onDragStart={(e) => onDragStart(e as unknown as React.DragEvent, l.id)}
                    className="card p-3 cursor-grab active:cursor-grabbing hover:border-[var(--color-primary)]/60 transition"
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="h-3.5 w-3.5 text-[var(--color-muted)] mt-1 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{l.title}</div>
                        {l.contactName && (
                          <div className="text-xs text-[var(--color-muted)] truncate">{l.contactName}</div>
                        )}
                        <div className="mt-1.5 flex items-center justify-between text-xs">
                          <span className="text-[var(--color-muted)]">
                            {formatCurrency(l.value, currency, locale)}
                          </span>
                          {l.score > 0 && (
                            <span className="inline-flex items-center gap-1 text-[var(--color-primary-soft)]">
                              <Sparkles className="h-3 w-3" />
                              {l.score}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
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
