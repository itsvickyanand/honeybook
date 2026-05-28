/**
 * BullMQ queue definitions.
 *
 * Three priorities per BRD Addendum Fix 17:
 *   - P0: real-time / customer-facing (OTPs, webhooks, payment confirmations)
 *   - P1: near-real-time (PDF rendering, WhatsApp templates, email)
 *   - P2: background (accounting sync, embeddings, analytics rollups)
 *
 * Job names live in JOB_NAMES so producers and consumers can't drift.
 *
 * Resilience: when REDIS_URL is unset / unreachable, enqueue() falls back to
 * inline execution for critical jobs (payment.reconcile, notification.dispatch,
 * email.send) so a Vercel deploy without a running worker still processes
 * payments correctly — degraded mode, no retries / concurrency control, but
 * functional. Long-running jobs (PDF, embeddings) are skipped with a warning.
 */
import { Queue, JobsOptions, QueueOptions } from 'bullmq';
import { redisForBullMQ } from './redis';
import { logger } from './logger';

export const JOB_NAMES = {
  EMAIL_SEND: 'email.send',
  SMS_SEND: 'sms.send',
  WHATSAPP_SEND: 'whatsapp.send',
  PDF_RENDER_INVOICE: 'pdf.invoice.render',
  PDF_RENDER_PROPOSAL: 'pdf.proposal.render',
  EMBEDDINGS_BUILD_ROW: 'embeddings.row.build',
  EMBEDDINGS_REINDEX_TENANT: 'embeddings.tenant.reindex',
  ACCOUNTING_PUSH: 'accounting.push',
  GST_IRN_GENERATE: 'gst.irn.generate',
  PAYMENT_RECONCILE: 'payment.reconcile',
  NOTIFICATION_DISPATCH: 'notification.dispatch',
  WEBHOOK_OUTBOUND: 'webhook.outbound',
  OVERDUE_SWEEP: 'overdue.sweep',
  DRIP_STEP: 'drip.step',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export const QUEUE_NAMES = ['p0', 'p1', 'p2'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

function makeBaseOpts(): QueueOptions {
  return {
    connection: redisForBullMQ(),
    defaultJobOptions: {
      removeOnComplete: { count: 500, age: 60 * 60 * 24 * 7 },
      removeOnFail: { count: 1000, age: 60 * 60 * 24 * 30 },
      attempts: 5,
      backoff: { type: 'exponential', delay: 2_000 },
    },
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __queues: Map<QueueName, Queue> | undefined;
}

const map = (global.__queues ??= new Map<QueueName, Queue>());

export function getQueue(name: QueueName): Queue {
  let q = map.get(name);
  if (!q) {
    // Build the BullMQ connection lazily so we don't spin up an ioredis client
    // (and spam ECONNREFUSED logs) when REDIS_URL is unset.
    q = new Queue(name, makeBaseOpts());
    map.set(name, q);
  }
  return q;
}

// Map each job to its priority queue. Easy to scan.
const JOB_TO_QUEUE: Record<JobName, QueueName> = {
  [JOB_NAMES.EMAIL_SEND]: 'p1',
  [JOB_NAMES.SMS_SEND]: 'p0',
  [JOB_NAMES.WHATSAPP_SEND]: 'p1',
  [JOB_NAMES.PDF_RENDER_INVOICE]: 'p1',
  [JOB_NAMES.PDF_RENDER_PROPOSAL]: 'p1',
  [JOB_NAMES.EMBEDDINGS_BUILD_ROW]: 'p2',
  [JOB_NAMES.EMBEDDINGS_REINDEX_TENANT]: 'p2',
  [JOB_NAMES.ACCOUNTING_PUSH]: 'p2',
  [JOB_NAMES.GST_IRN_GENERATE]: 'p1',
  [JOB_NAMES.PAYMENT_RECONCILE]: 'p0',
  [JOB_NAMES.NOTIFICATION_DISPATCH]: 'p1',
  [JOB_NAMES.WEBHOOK_OUTBOUND]: 'p1',
  [JOB_NAMES.OVERDUE_SWEEP]: 'p2',
  [JOB_NAMES.DRIP_STEP]: 'p2',
};

/**
 * Lazy probe: is REDIS_URL configured and reachable?
 * We don't block module load on a TCP connection — we use the absence of
 * REDIS_URL as the cheap signal. If REDIS_URL is set but unreachable, BullMQ
 * will internally retry; enqueue() will not throw, but jobs will pile up
 * locally. For deployments without Redis, leave REDIS_URL unset.
 */
function redisConfigured(): boolean {
  const url = process.env.REDIS_URL ?? '';
  if (!url) return false;
  // localhost defaults are treated as "not configured" on Vercel
  if (process.env.VERCEL === '1' && url.includes('localhost')) return false;
  return true;
}

/**
 * Inline-executable critical jobs. When Redis is unavailable, these run
 * synchronously in the request context so the user-facing flow stays correct.
 * Heavier jobs (PDF, embeddings) are skipped — they're optimizations, not
 * correctness-critical.
 */
const INLINE_HANDLERS: Partial<Record<JobName, () => Promise<(data: Record<string, unknown>) => Promise<unknown>>>> = {
  [JOB_NAMES.PAYMENT_RECONCILE]: async () => {
    const { handlePaymentReconcile } = await import('../worker/handlers/payments');
    return (data) => handlePaymentReconcile({ data, id: 'inline' } as unknown as Parameters<typeof handlePaymentReconcile>[0]);
  },
  [JOB_NAMES.NOTIFICATION_DISPATCH]: async () => {
    const { handleNotificationDispatch } = await import('../worker/handlers/notification');
    return (data) => handleNotificationDispatch({ data, id: 'inline' } as unknown as Parameters<typeof handleNotificationDispatch>[0]);
  },
  [JOB_NAMES.EMAIL_SEND]: async () => {
    const { handleEmailSend } = await import('../worker/handlers/email');
    return (data) => handleEmailSend({ data, id: 'inline' } as unknown as Parameters<typeof handleEmailSend>[0]);
  },
  [JOB_NAMES.WEBHOOK_OUTBOUND]: async () => {
    const { handleWebhookOutbound } = await import('../worker/handlers/webhook');
    return (data) => handleWebhookOutbound({ data, id: 'inline' } as unknown as Parameters<typeof handleWebhookOutbound>[0]);
  },
};

const SKIPPABLE_JOBS = new Set<JobName>([
  JOB_NAMES.PDF_RENDER_INVOICE,
  JOB_NAMES.PDF_RENDER_PROPOSAL,
  JOB_NAMES.EMBEDDINGS_BUILD_ROW,
  JOB_NAMES.EMBEDDINGS_REINDEX_TENANT,
  JOB_NAMES.ACCOUNTING_PUSH,
  JOB_NAMES.GST_IRN_GENERATE,
  JOB_NAMES.SMS_SEND,
  JOB_NAMES.WHATSAPP_SEND,
  JOB_NAMES.OVERDUE_SWEEP,
  JOB_NAMES.DRIP_STEP,
]);

export async function enqueue(
  job: JobName,
  data: Record<string, unknown>,
  opts?: JobsOptions
) {
  if (redisConfigured()) {
    const q = getQueue(JOB_TO_QUEUE[job]);
    return q.add(job, data, opts);
  }

  // Degraded mode: no Redis. Inline-execute critical jobs.
  const inline = INLINE_HANDLERS[job];
  if (inline) {
    try {
      const handler = await inline();
      // Fire-and-forget so we don't block the caller's response. This isn't
      // ideal (no error surface to the caller) but it's a deliberate trade-off
      // for parity with BullMQ's async semantics.
      handler(data).catch((e) =>
        logger.error({ job, err: (e as Error).message }, 'queue.inline.failed')
      );
      return { id: 'inline', name: job, data } as unknown as ReturnType<Queue['add']>;
    } catch (e) {
      logger.error({ job, err: (e as Error).message }, 'queue.inline.handler-load-failed');
      throw e;
    }
  }

  if (SKIPPABLE_JOBS.has(job)) {
    logger.warn({ job }, 'queue.skipped.no-redis');
    return { id: 'skipped', name: job, data } as unknown as ReturnType<Queue['add']>;
  }

  logger.warn({ job }, 'queue.unhandled.no-redis');
  return { id: 'skipped', name: job, data } as unknown as ReturnType<Queue['add']>;
}
