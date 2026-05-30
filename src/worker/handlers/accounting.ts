import { Job } from 'bullmq';
import { prisma } from '../../lib/db';
import { logger } from '../../lib/logger';
import { pushInvoiceToZoho } from '../../lib/accounting/zoho';

export async function handleAccountingPush(job: Job): Promise<unknown> {
  const { tenantId, provider, entityType, entityId } = job.data as {
    tenantId: string;
    provider: string;
    entityType: string;
    entityId: string;
  };

  const log = await prisma.accountingSyncLog.create({
    data: { tenantId, provider, entityType, entityId, status: 'PENDING' },
  });

  try {
    let externalId: string | null = null;
    if (provider === 'zoho' && entityType === 'invoice') {
      externalId = await pushInvoiceToZoho(tenantId, entityId);
    } else {
      logger.warn({ provider, entityType }, 'accounting.unsupported-pair');
    }
    await prisma.accountingSyncLog.update({
      where: { id: log.id },
      data: { status: 'OK', externalId },
    });
    if (externalId && entityType === 'invoice') {
      await prisma.invoice.update({ where: { id: entityId }, data: { syncStatus: 'SYNCED' } });
    }
    return { externalId };
  } catch (e) {
    await prisma.accountingSyncLog.update({
      where: { id: log.id },
      data: { status: 'FAILED', error: (e as Error).message },
    });
    if (entityType === 'invoice') {
      await prisma.invoice.update({ where: { id: entityId }, data: { syncStatus: 'FAILED' } }).catch(() => {});
    }
    throw e;
  }
}
