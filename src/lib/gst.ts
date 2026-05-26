/**
 * GST e-invoicing (NIC IRP via aggregator).
 *
 * Supports a "mock" provider for dev so the IRN flow runs end-to-end.
 * Real aggregator providers (ClearTax, Masters India, etc.) wire here.
 */
import type { Invoice } from '@prisma/client';
import { nanoid } from 'nanoid';

export async function generateIrnForInvoice(invoice: Invoice): Promise<{ irn: string; qrCode: string }> {
  const provider = process.env.GST_IRP_PROVIDER || 'mock';
  if (provider === 'mock') {
    return {
      irn: `MOCK-${nanoid(32)}`,
      qrCode: '', // a real impl returns a base64 QR PNG
    };
  }
  // Real-provider hookup goes here. Different aggregators have different APIs;
  // we don't lock in one until you pick.
  throw new Error(`Unsupported GST IRP provider: ${provider}`);
}
