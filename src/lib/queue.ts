/**
 * BullMQ queue definitions.
 *
 * Three priorities per BRD Addendum Fix 17:
 *   - P0: real-time / customer-facing (OTPs, webhooks, payment confirmations)
 *   - P1: near-real-time (PDF rendering, WhatsApp templates, email)
 *   - P2: background (accounting sync, embeddings, analytics rollups)
 *
 * Job names live in JOB_NAMES so producers and consumers can't drift.
 */
import { Queue, JobsOptions, QueueOptions } from 'bullmq';
import { redisForBullMQ } from './redis';

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
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export const QUEUE_NAMES = ['p0', 'p1', 'p2'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

const baseOpts: QueueOptions = {
  connection: redisForBullMQ(),
  defaultJobOptions: {
    removeOnComplete: { count: 500, age: 60 * 60 * 24 * 7 },
    removeOnFail: { count: 1000, age: 60 * 60 * 24 * 30 },
    attempts: 5,
    backoff: { type: 'exponential', delay: 2_000 },
  },
};

declare global {
  // eslint-disable-next-line no-var
  var __queues: Map<QueueName, Queue> | undefined;
}

const map = (global.__queues ??= new Map<QueueName, Queue>());

export function getQueue(name: QueueName): Queue {
  let q = map.get(name);
  if (!q) {
    q = new Queue(name, baseOpts);
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
};

export async function enqueue(
  job: JobName,
  data: Record<string, unknown>,
  opts?: JobsOptions
) {
  const q = getQueue(JOB_TO_QUEUE[job]);
  return q.add(job, data, opts);
}
