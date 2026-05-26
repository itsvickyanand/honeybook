'use client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Check } from 'lucide-react';

export function NotificationsActions() {
  const router = useRouter();
  async function markAll() {
    const res = await fetch('/api/notifications/read-all', { method: 'POST' });
    if (!res.ok) return toast.error('Failed');
    toast.success('All read');
    router.refresh();
  }
  return (
    <Button variant="secondary" onClick={markAll}>
      <Check className="h-4 w-4" /> Mark all read
    </Button>
  );
}
