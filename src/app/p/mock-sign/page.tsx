import { Suspense } from 'react';
import { MockSign } from './MockSign';

export default function MockSignPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-[var(--color-muted)]">Loading…</div>}>
      <MockSign />
    </Suspense>
  );
}
