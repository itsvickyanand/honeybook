'use client';
import * as React from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, AlertCircle, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface Tmpl { name: string; language: string; status: string; category: string }

export function WhatsAppTemplates() {
  const [list, setList] = React.useState<Tmpl[]>([]);
  const [mock, setMock] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch('/api/whatsapp/templates')
      .then((r) => r.json())
      .then((d) => {
        setList(d.templates ?? []);
        setMock(!!d.mock);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-3">
      {mock && (
        <div className="card p-4 bg-amber-500/10 border-amber-500/40 text-amber-200 text-sm flex gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            Showing mock templates — set <code>WHATSAPP_TOKEN</code> + <code>WHATSAPP_WABA_ID</code> for the real list.
            <Link href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" className="ml-1 underline">
              Manage in Meta <ExternalLink className="inline h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
      {loading ? (
        <div className="card p-12 text-center text-[var(--color-muted)]">Loading…</div>
      ) : list.length === 0 ? (
        <div className="card p-12 text-center text-[var(--color-muted)]">
          <MessageSquare className="mx-auto h-8 w-8 mb-2" />
          No templates yet.
        </div>
      ) : (
        list.map((t) => (
          <div key={`${t.name}-${t.language}`} className="card p-4 flex items-center gap-3">
            <div className="flex-1">
              <div className="font-medium">{t.name}</div>
              <div className="text-xs text-[var(--color-muted)] mt-0.5">{t.language} · {t.category}</div>
            </div>
            <span className={`chip ${t.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
              {t.status}
            </span>
          </div>
        ))
      )}
    </motion.div>
  );
}
