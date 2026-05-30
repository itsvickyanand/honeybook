/**
 * Audit log helper — call from any mutating server action.
 */
import { prisma } from './db';

export interface AuditArgs {
  tenantId: string;
  userId?: string;
  action: 'create' | 'update' | 'delete' | 'login' | 'export' | 'send' | 'pay' | 'sign';
  entity: string;
  entityId?: string;
  diff?: unknown;
  ip?: string;
  userAgent?: string;
}

export async function audit(args: AuditArgs) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: args.tenantId,
        userId: args.userId,
        action: args.action,
        entity: args.entity,
        entityId: args.entityId,
        diff: args.diff as object | undefined,
        ip: args.ip,
        userAgent: args.userAgent,
      },
    });
  } catch {
    // never let audit failures crash the caller
  }
}
