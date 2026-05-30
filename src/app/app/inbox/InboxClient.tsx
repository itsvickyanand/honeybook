'use client';
import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, MessageSquare, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { timeAgo } from '@/lib/utils';

interface Thread {
  id: string;
  channel: string;
  contactName: string | null;
  proposalTitle: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

interface Message {
  id: string;
  direction: string;
  body: string;
  createdAt: string;
}

export function InboxClient({ threads, currentUserId }: { threads: Thread[]; currentUserId: string }) {
  void currentUserId;
  const [active, setActive] = React.useState<string | null>(threads[0]?.id ?? null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);

  async function load(threadId: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/chat/threads/${threadId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.thread.messages.map((m: { id: string; direction: string; body: string; createdAt: string }) => ({ ...m })));
    } finally { setLoading(false); }
  }

  React.useEffect(() => { if (active) load(active); }, [active]);

  // Poll for new messages every 5s when a thread is open
  React.useEffect(() => {
    if (!active) return;
    const t = setInterval(() => load(active), 5000);
    return () => clearInterval(t);
  }, [active]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!active || !draft.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/chat/threads/${active}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: draft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setMessages((m) => [...m, { id: data.message.id, direction: 'OUTBOUND', body: draft.trim(), createdAt: new Date().toISOString() }]);
      setDraft('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSending(false); }
  }

  const activeThread = threads.find((t) => t.id === active);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] h-[calc(100vh-7rem)]">
      <aside className="border-r overflow-y-auto">
        <div className="p-4 border-b">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Inbox className="h-5 w-5 text-[var(--color-primary-soft)]" /> Inbox
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-1">{threads.length} threads</p>
        </div>
        {threads.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--color-muted)]">
            <MessageSquare className="mx-auto h-8 w-8 mb-2" />
            No conversations yet.
          </div>
        ) : (
          <div>
            {threads.map((t) => (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={`w-full text-left px-4 py-3 border-b transition ${
                  t.id === active ? 'bg-[var(--color-surface-2)]' : 'hover:bg-[var(--color-surface-2)]/60'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] text-xs font-semibold">
                    {(t.contactName ?? '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate">{t.contactName ?? 'Client'}</span>
                      <span className="text-xs text-[var(--color-muted)]">{t.lastMessageAt ? timeAgo(t.lastMessageAt) : ''}</span>
                    </div>
                    {t.proposalTitle && <div className="text-xs text-[var(--color-muted)] truncate">{t.proposalTitle}</div>}
                    {t.lastMessage && <div className="text-xs text-[var(--color-muted)] truncate mt-0.5">{t.lastMessage}</div>}
                    <span className="chip text-[10px] mt-1">{t.channel}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section className="flex flex-col">
        {activeThread ? (
          <>
            <div className="p-4 border-b">
              <div className="font-semibold">{activeThread.contactName ?? 'Client'}</div>
              {activeThread.proposalTitle && (
                <div className="text-xs text-[var(--color-muted)] mt-0.5">{activeThread.proposalTitle}</div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loading && messages.length === 0 ? (
                <div className="text-center text-[var(--color-muted)] text-sm">Loading…</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-[var(--color-muted)] text-sm py-12">No messages yet.</div>
              ) : (
                <AnimatePresence initial={false}>
                  {messages.map((m) => (
                    <motion.div
                      key={m.id}
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${m.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-xs md:max-w-sm rounded-2xl px-3 py-2 text-sm ${
                        m.direction === 'OUTBOUND'
                          ? 'bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] text-white'
                          : 'bg-[var(--color-surface-2)] text-[var(--color-text)]'
                      }`}>
                        <div>{m.body}</div>
                        <div className="mt-1 text-[10px] opacity-70 text-right">{timeAgo(m.createdAt)}</div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
            <form onSubmit={send} className="p-3 border-t flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Reply…"
                className="input-base flex-1"
              />
              <Button type="submit" loading={sending} disabled={!draft.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[var(--color-muted)]">
            Select a conversation
          </div>
        )}
      </section>
    </div>
  );
}
