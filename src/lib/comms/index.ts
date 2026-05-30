/**
 * Comms facade. UI/API code uses these helpers — they enqueue the right job.
 * Workers do the actual provider calls.
 */
import { enqueue, JOB_NAMES } from '../queue';

export interface SendEmailArgs {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}
export interface SendSmsArgs {
  to: string;
  body: string;
  senderId?: string;
}
export interface SendWhatsAppArgs {
  to: string;
  type: 'template' | 'text';
  template?: { name: string; languageCode: string; components?: unknown[] };
  body?: string;
}

export async function sendEmail(args: SendEmailArgs) {
  return enqueue(JOB_NAMES.EMAIL_SEND, args as unknown as Record<string, unknown>);
}
export async function sendSms(args: SendSmsArgs) {
  return enqueue(JOB_NAMES.SMS_SEND, args as unknown as Record<string, unknown>);
}
export async function sendWhatsApp(args: SendWhatsAppArgs) {
  return enqueue(JOB_NAMES.WHATSAPP_SEND, args as unknown as Record<string, unknown>);
}
