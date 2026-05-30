'use client';
import * as React from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check, ArrowUpRight } from 'lucide-react';
import { timeAgo } from '@/lib/utils';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const [open, setOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [unread, setUnread] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnread(data.unread ?? 0);
    } catch { /* ignore */ }
  }

  React.useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', onClickOutside);
      return () => document.removeEventListener('mousedown', onClickOutside);
    }
  }, [open]);

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
    setNotifications((ns) => ns.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnread((u) => Math.max(0, u - 1));
  }

  async function markAllRead() {
    await fetch('/api/notifications/read-all', { method: 'POST' });
    setNotifications((ns) => ns.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnread(0);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost p-2 relative"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 card p-0 overflow-hidden z-50"
          >
            <div className="flex items-center justify-between p-3 border-b">
              <span className="font-medium text-sm">Notifications</span>
              {unread > 0 && (
                <button onClick={markAllRead} className="text-xs text-[var(--color-muted)] hover:text-white">
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-sm text-[var(--color-muted)]">No notifications yet.</div>
              ) : (
                notifications.slice(0, 6).map((n) => (
                  <div
                    key={n.id}
                    className={`px-3 py-2.5 border-b last:border-b-0 transition ${
                      n.readAt ? 'bg-transparent' : 'bg-[var(--color-primary)]/5'
                    } hover:bg-[var(--color-surface-2)]`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        {n.href ? (
                          <Link
                            href={n.href}
                            onClick={() => markRead(n.id)}
                            className="font-medium text-sm hover:text-[var(--color-primary-soft)] line-clamp-1"
                          >
                            {n.title}
                          </Link>
                        ) : (
                          <span className="font-medium text-sm line-clamp-1">{n.title}</span>
                        )}
                        {n.body && <div className="text-xs text-[var(--color-muted)] line-clamp-2 mt-0.5">{n.body}</div>}
                        <div className="text-xs text-[var(--color-muted)] mt-1">{timeAgo(n.createdAt)}</div>
                      </div>
                      {!n.readAt && (
                        <button
                          onClick={() => markRead(n.id)}
                          className="text-[var(--color-muted)] hover:text-white"
                          aria-label="Mark read"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <Link
              href="/app/notifications"
              onClick={() => setOpen(false)}
              className="block text-center p-3 text-xs text-[var(--color-muted)] hover:text-white border-t inline-flex items-center justify-center gap-1 w-full"
            >
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
