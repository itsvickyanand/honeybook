import { Job } from 'bullmq';
import { prisma } from '../../lib/db';
import { sendEmail, sendWhatsApp, sendSms } from '../../lib/comms';
import { enqueue, JOB_NAMES } from '../../lib/queue';
import { logger } from '../../lib/logger';

interface DripStepData {
  enrollmentId: string;
  stepIdx: number;
}

interface DripStep {
  channel: 'email' | 'whatsapp' | 'sms';
  delayHours: number;
  subject?: string;
  body: string;
  whatsappTemplate?: { name: string; languageCode: string };
}

/**
 * Execute one step of a drip sequence for a single enrollment, then schedule
 * the next step.
 */
export async function handleDripStep(job: Job): Promise<unknown> {
  const data = job.data as DripStepData;
  const enrollment = await prisma.dripEnrollment.findUnique({
    where: { id: data.enrollmentId },
    include: { sequence: true, contact: true },
  });
  if (!enrollment || enrollment.status !== 'ACTIVE') return { skipped: true };

  const steps = (enrollment.sequence.stepsJson as unknown as DripStep[]) ?? [];
  const step = steps[data.stepIdx];
  if (!step) {
    await prisma.dripEnrollment.update({ where: { id: enrollment.id }, data: { status: 'COMPLETED' } });
    return { completed: true };
  }

  // Send via configured channel
  try {
    if (step.channel === 'email' && enrollment.contact?.email) {
      await sendEmail({
        to: enrollment.contact.email,
        subject: step.subject ?? 'A note from us',
        text: step.body,
        html: `<p>${step.body.replace(/\n/g, '<br>')}</p>`,
      });
    } else if (step.channel === 'whatsapp' && enrollment.contact?.phone) {
      await sendWhatsApp({
        to: enrollment.contact.phone,
        type: step.whatsappTemplate ? 'template' : 'text',
        template: step.whatsappTemplate,
        body: step.body,
      });
    } else if (step.channel === 'sms' && enrollment.contact?.phone) {
      await sendSms({ to: enrollment.contact.phone, body: step.body });
    }
  } catch (e) {
    logger.warn({ err: (e as Error).message, enrollment: enrollment.id, step: data.stepIdx }, 'drip.send-failed');
  }

  await prisma.dripEnrollment.update({
    where: { id: enrollment.id },
    data: { currentStepIdx: data.stepIdx + 1, lastStepAt: new Date() },
  });

  // Schedule the next step
  const next = steps[data.stepIdx + 1];
  if (next) {
    await enqueue(
      JOB_NAMES.DRIP_STEP,
      { enrollmentId: enrollment.id, stepIdx: data.stepIdx + 1 },
      { delay: next.delayHours * 60 * 60 * 1000 }
    );
  } else {
    await prisma.dripEnrollment.update({ where: { id: enrollment.id }, data: { status: 'COMPLETED' } });
  }

  return { stepIdx: data.stepIdx };
}
