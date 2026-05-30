'use client';
import { NotificationBell } from './NotificationBell';
import { SearchTrigger } from './SearchTrigger';
import { ThemeToggle } from './ThemeToggle';

export function Topbar() {
  return (
    <div className="sticky top-0 z-30 border-b bg-[var(--color-bg)]/80 backdrop-blur">
      <div className="flex items-center gap-3 px-6 py-2.5">
        <div className="flex-1">
          <SearchTrigger />
        </div>
        <ThemeToggle />
        <NotificationBell />
      </div>
    </div>
  );
}
