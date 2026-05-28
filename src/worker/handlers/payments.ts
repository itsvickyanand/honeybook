import { Job } from 'bullmq';
import { reconcilePayment } from '../../lib/payments/reconcile';

/**
 * BullMQ wrapper around the shared reconcilePayment() core.
 * The same core also runs inline from the webhook + mock-pay handlers so the
 * loop closes even without a worker process. Idempotent.
 */
export async function handlePaymentReconcile(job: Job): Promise<unknown> {
  const { paymentId } = job.data as { paymentId: string };
  return reconcilePayment(paymentId);
}
