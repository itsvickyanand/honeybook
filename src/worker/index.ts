/**
 * Worker process — runs separately from the Next.js server.
 *
 * Start with:  npm run dev:worker  (watch)
 * Or:          npm run start:worker (prod)
 *
 * Per BRD Addendum Fix 17, workers MUST run on a separate process from the API
 * so CPU-heavy work (PDF rendering, Sharp, AI calls) doesn't starve request threads.
 */
import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { redisForBullMQ } from '../lib/redis';
import { logger } from '../lib/logger';
import { JOB_NAMES, QueueName } from '../lib/queue';

import { handleEmailSend } from './handlers/email';
import { handleSmsSend } from './handlers/sms';
import { handleWhatsappSend } from './handlers/whatsapp';
import { handlePdfRenderInvoice, handlePdfRenderProposal } from './handlers/pdf';
import { handleEmbeddingsBuildRow, handleEmbeddingsReindexTenant } from './handlers/embeddings';
import { handleAccountingPush } from './handlers/accounting';
import { handleGstIrnGenerate } from './handlers/gst';
import { handlePaymentReconcile } from './handlers/payments';
import { handleNotificationDispatch } from './handlers/notification';
import { handleWebhookOutbound } from './handlers/webhook';

const HANDLERS: Record<string, (job: Job) => Promise<unknown>> = {
  [JOB_NAMES.EMAIL_SEND]: handleEmailSend,
  [JOB_NAMES.SMS_SEND]: handleSmsSend,
  [JOB_NAMES.WHATSAPP_SEND]: handleWhatsappSend,
  [JOB_NAMES.PDF_RENDER_INVOICE]: handlePdfRenderInvoice,
  [JOB_NAMES.PDF_RENDER_PROPOSAL]: handlePdfRenderProposal,
  [JOB_NAMES.EMBEDDINGS_BUILD_ROW]: handleEmbeddingsBuildRow,
  [JOB_NAMES.EMBEDDINGS_REINDEX_TENANT]: handleEmbeddingsReindexTenant,
  [JOB_NAMES.ACCOUNTING_PUSH]: handleAccountingPush,
  [JOB_NAMES.GST_IRN_GENERATE]: handleGstIrnGenerate,
  [JOB_NAMES.PAYMENT_RECONCILE]: handlePaymentReconcile,
  [JOB_NAMES.NOTIFICATION_DISPATCH]: handleNotificationDispatch,
  [JOB_NAMES.WEBHOOK_OUTBOUND]: handleWebhookOutbound,
};

async function processor(job: Job) {
  const handler = HANDLERS[job.name];
  if (!handler) throw new Error(`Unknown job: ${job.name}`);
  const start = Date.now();
  logger.info({ job: job.name, id: job.id, queue: job.queueName }, 'job.start');
  try {
    const result = await handler(job);
    logger.info({ job: job.name, id: job.id, ms: Date.now() - start }, 'job.ok');
    return result;
  } catch (e) {
    logger.error({ job: job.name, id: job.id, err: (e as Error).message, ms: Date.now() - start }, 'job.fail');
    throw e;
  }
}

const QUEUE_CONCURRENCY: Record<QueueName, number> = {
  p0: 20, // OTPs, payments — burst-tolerant
  p1: 10, // PDFs, WhatsApp
  p2: 4,  // background: embeddings, accounting
};

const workers: Worker[] = [];
for (const queue of ['p0', 'p1', 'p2'] as QueueName[]) {
  const w = new Worker(queue, processor, {
    connection: redisForBullMQ(),
    concurrency: QUEUE_CONCURRENCY[queue],
  });
  w.on('failed', (job, err) => {
    logger.error({ queue, job: job?.name, err: err.message }, 'worker.failed');
  });
  workers.push(w);
  logger.info({ queue, concurrency: QUEUE_CONCURRENCY[queue] }, 'worker.online');
}

async function shutdown(sig: string) {
  logger.info({ sig }, 'worker.shutdown');
  for (const w of workers) await w.close();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
