// Storage layer for call logs. Everything that touches the database lives here,
// so the rest of the dialer module only calls these functions. This version is
// repointed at the host app's own Prisma client (@/lib/db) and its `CallLog`
// model — the standalone module shipped its own Neon/Prisma client here instead.
import { prisma } from "@/lib/db";

/** Create or update the call row keyed by Twilio Call SID. */
export async function upsertCallLog(callSid, data) {
  return prisma.callLog.upsert({
    where: { callSid },
    create: { callSid, ...data },
    update: data,
  });
}

/** Patch an existing call row by Call SID. Tolerates a missing row. */
export async function updateCallLogBySid(callSid, data) {
  const result = await prisma.callLog.updateMany({ where: { callSid }, data });
  return result.count;
}

export async function getCallLogById(id) {
  return prisma.callLog.findUnique({ where: { id } });
}

export async function getCallLogBySid(callSid) {
  return prisma.callLog.findUnique({ where: { callSid } });
}

/**
 * List logs, filtered by any combination of tenant / lead / contact / phone.
 * Reads are always scoped by `tenantId` from the caller (server-side) so one
 * tenant can never see another's calls.
 *
 * @param {object} [opts]
 * @param {string} [opts.tenantId]
 * @param {string} [opts.leadId]
 * @param {string} [opts.contactId]
 * @param {string} [opts.phone]
 * @param {number} [opts.limit]
 */
export async function listCallLogs({
  tenantId,
  leadId,
  contactId,
  phone,
  limit = 100,
} = {}) {
  const where = {};
  if (tenantId) where.tenantId = tenantId;
  if (leadId) where.leadId = leadId;
  if (contactId) where.contactId = contactId;
  if (phone) where.toNumber = phone;
  return prisma.callLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
