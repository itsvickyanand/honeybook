/**
 * Tiny ICS (iCalendar) generator — enough to attach to confirmation emails so
 * clients can add the meeting to their calendar.
 */
function fold(line: string): string {
  return line.match(/.{1,72}/g)?.join('\r\n ') ?? line;
}
function fmt(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export interface IcsEvent {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
  organizerName?: string;
  organizerEmail?: string;
  attendeeName?: string;
  attendeeEmail?: string;
}

export function buildIcs(e: IcsEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Avantus//Calendar//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(e.start)}`,
    `DTEND:${fmt(e.end)}`,
    fold(`SUMMARY:${e.summary.replace(/\n/g, ' ')}`),
    e.description ? fold(`DESCRIPTION:${e.description.replace(/\n/g, '\\n')}`) : '',
    e.location ? fold(`LOCATION:${e.location.replace(/\n/g, ' ')}`) : '',
    e.organizerEmail ? `ORGANIZER;CN=${e.organizerName ?? ''}:mailto:${e.organizerEmail}` : '',
    e.attendeeEmail ? `ATTENDEE;CN=${e.attendeeName ?? ''};RSVP=TRUE:mailto:${e.attendeeEmail}` : '',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n');
}
