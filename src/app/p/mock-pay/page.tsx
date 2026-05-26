import { Suspense } from 'react';
import { MockPay } from './MockPay';

export default function MockPayPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-[var(--color-muted)]">Loading…</div>}>
      <MockPay />
    </Suspense>
  );
}
