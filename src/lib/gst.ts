/**
 * GST e-invoicing (NIC IRP via aggregator).
 *
 * Adapters:
 *   - mock      — returns a synthetic IRN. Default in dev.
 *   - cleartax  — ClearTax IRP API (real). Requires GST_IRP_KEY + GST_IRP_GSPID.
 */
import type { Invoice } from '@prisma/client';
import { nanoid } from 'nanoid';
import { logger } from './logger';

export async function generateIrnForInvoice(invoice: Invoice): Promise<{ irn: string; qrCode: string }> {
  const provider = process.env.GST_IRP_PROVIDER || 'mock';
  if (provider === 'mock' || !process.env.GST_IRP_KEY) {
    return { irn: `MOCK-${nanoid(32)}`, qrCode: '' };
  }

  if (provider === 'cleartax') {
    // ClearTax v1 e-invoicing API. Endpoint, headers and payload shape per their docs.
    // See: https://docs.cleartax.in/e-invoicing/
    const res = await fetch('https://gsp.cleartax.in/einvoice/v1/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.GST_IRP_KEY,
        ...(process.env.GST_IRP_GSPID ? { 'x-gspid': process.env.GST_IRP_GSPID } : {}),
      },
      body: JSON.stringify(buildClearTaxPayload(invoice)),
    });
    if (!res.ok) {
      const text = await res.text();
      logger.error({ invoiceId: invoice.id, status: res.status, text }, 'gst.cleartax.failed');
      throw new Error(`ClearTax IRP ${res.status}`);
    }
    const data = (await res.json()) as { Irn: string; SignedQRCode: string };
    return { irn: data.Irn, qrCode: data.SignedQRCode };
  }

  throw new Error(`Unsupported GST IRP provider: ${provider}`);
}

interface ContentJson {
  lineItems?: { name: string; hsn?: string; quantity: number; unitPrice: number; amount: number }[];
  billToPlaceOfSupply?: string;
}

function buildClearTaxPayload(invoice: Invoice) {
  const content = (invoice.contentJson ?? {}) as ContentJson;
  const lineItems = content.lineItems ?? [];
  return {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: 'B2B' },
    DocDtls: { Typ: 'INV', No: invoice.number ?? invoice.id, Dt: invoice.issueDate.toISOString().slice(0, 10).split('-').reverse().join('/') },
    SellerDtls: {
      // Vendor org details — TODO pull from Tenant + provider seller config
      Gstin: process.env.GST_SELLER_GSTIN ?? '00AAAAA0000A1Z5',
      LglNm: 'Avantus Vendor',
      Pos: invoice.placeOfSupply.replace('IN-', ''),
    },
    BuyerDtls: {
      Gstin: 'URP',
      LglNm: 'Client',
      Pos: (content.billToPlaceOfSupply ?? invoice.placeOfSupply).replace('IN-', ''),
    },
    ItemList: lineItems.map((li, i) => ({
      SlNo: String(i + 1),
      PrdDesc: li.name,
      IsServc: 'Y',
      HsnCd: li.hsn ?? '999799',
      Qty: li.quantity,
      Unit: 'OTH',
      UnitPrice: li.unitPrice,
      TotAmt: li.amount,
      AssAmt: li.amount,
      GstRt: 18,
      IgstAmt: invoice.igst,
      CgstAmt: invoice.cgst,
      SgstAmt: invoice.sgst,
      TotItemVal: li.amount,
    })),
    ValDtls: {
      AssVal: invoice.subtotal,
      CgstVal: invoice.cgst,
      SgstVal: invoice.sgst,
      IgstVal: invoice.igst,
      TotInvVal: invoice.total,
    },
  };
}
