/**
 * Schedules repeatable jobs (cron-style) on BullMQ.
 * Called once on worker boot.
 */
import { getQueue, JobName, JOB_NAMES } from './queue';

interface Schedule {
  job: JobName;
  cron: string;
  data: Record<string, unknown>;
}

const SCHEDULES: Schedule[] = [
  // Every day at 09:00 IST, sweep overdue invoices
  { job: 'overdue.sweep' as JobName, cron: '0 9 * * *', data: {} },
];

export async function registerSchedules() {
  for (const s of SCHEDULES) {
    const q = getQueue('p2');
    await q.add(s.job, s.data, {
      repeat: { pattern: s.cron, tz: 'Asia/Kolkata' },
      jobId: `repeat:${s.job}`,
    });
  }
}

// Add the overdue sweep job name to JOB_NAMES via re-export indirection in queue.ts is cleaner;
// for now, the cast above is fine — handlers map by string.
export const OVERDUE_SWEEP = 'overdue.sweep';
export { JOB_NAMES };
