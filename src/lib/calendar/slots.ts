/**
 * Bookable-slot calculation for a MeetingType + host.
 *
 * Inputs:
 *   - meetingType: durationMins, bufferMins, advanceNoticeHours, maxBookingDays, hostUserId
 *   - the host's AvailabilityRules (weekly) and AvailabilityExceptions (per date)
 *   - existing CalendarEvents for the host (busy times)
 *
 * Output:
 *   - { dayIso, slots: [{ start: ISO, end: ISO }] }[] grouped by day
 */
import { prisma } from '../db';

interface MeetingTypeLite {
  durationMins: number;
  bufferMins: number;
  advanceNoticeHours: number;
  maxBookingDays: number;
  hostUserId: string | null;
  tenantId: string;
}

interface Slot { start: string; end: string }

function parseHM(s: string): { h: number; m: number } {
  const [h, m] = s.split(':').map(Number);
  return { h, m };
}

function setHM(d: Date, h: number, m: number): Date {
  const out = new Date(d);
  out.setHours(h, m, 0, 0);
  return out;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function computeBookableSlots(m: MeetingTypeLite): Promise<{ day: string; slots: Slot[] }[]> {
  if (!m.hostUserId) return [];
  const now = new Date();
  const start = new Date(now.getTime() + m.advanceNoticeHours * 3_600_000);
  const end = new Date(now.getTime() + m.maxBookingDays * 86_400_000);

  const [rules, exceptions, busy] = await Promise.all([
    prisma.availabilityRule.findMany({ where: { userId: m.hostUserId } }),
    prisma.availabilityException.findMany({ where: { userId: m.hostUserId, date: { gte: start, lte: end } } }),
    prisma.calendarEvent.findMany({
      where: {
        tenantId: m.tenantId,
        hostUserId: m.hostUserId,
        status: { not: 'CANCELLED' },
        startAt: { lte: end },
        endAt: { gte: start },
      },
      select: { startAt: true, endAt: true },
    }),
  ]);

  const rulesByDay = new Map<number, { startTime: string; endTime: string }[]>();
  for (const r of rules) {
    const arr = rulesByDay.get(r.dayOfWeek) ?? [];
    arr.push({ startTime: r.startTime, endTime: r.endTime });
    rulesByDay.set(r.dayOfWeek, arr);
  }
  const exceptionsByDay = new Map<string, typeof exceptions[number]>();
  for (const e of exceptions) exceptionsByDay.set(dayKey(e.date), e);

  const step = m.durationMins; // step every duration; conflicts/buffer handled below
  const out: { day: string; slots: Slot[] }[] = [];

  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= end) {
    const day = new Date(cursor);
    const key = dayKey(day);
    const dayOfWeek = day.getDay();

    const exception = exceptionsByDay.get(key);
    const windows: { startTime: string; endTime: string }[] = [];

    if (exception) {
      if (exception.blocked) {
        // fully off
      } else if (exception.startTime && exception.endTime) {
        windows.push({ startTime: exception.startTime, endTime: exception.endTime });
      }
    } else {
      windows.push(...(rulesByDay.get(dayOfWeek) ?? []));
    }

    const slots: Slot[] = [];
    for (const w of windows) {
      const { h: sh, m: sm } = parseHM(w.startTime);
      const { h: eh, m: em } = parseHM(w.endTime);
      let slotStart = setHM(day, sh, sm);
      const dayEnd = setHM(day, eh, em);

      while (slotStart.getTime() + m.durationMins * 60_000 <= dayEnd.getTime()) {
        // Must be after `start` (advance notice) and before `end`.
        if (slotStart >= start && slotStart <= end) {
          const slotEnd = new Date(slotStart.getTime() + m.durationMins * 60_000);
          const bufferBefore = m.bufferMins * 60_000;
          const conflict = busy.some((b) =>
            // overlap considering buffer
            slotStart.getTime() < b.endAt.getTime() + bufferBefore &&
            slotEnd.getTime() + bufferBefore > b.startAt.getTime()
          );
          if (!conflict) {
            slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString() });
          }
        }
        slotStart = new Date(slotStart.getTime() + step * 60_000);
      }
    }

    if (slots.length) out.push({ day: key, slots });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
