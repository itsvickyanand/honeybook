import { Suspense } from 'react';
import { ResetForm } from './ResetForm';

export default function ResetPage() {
  return (
    <Suspense fallback={<div className="card p-8 max-w-md w-full">Loading…</div>}>
      <ResetForm />
    </Suspense>
  );
}
