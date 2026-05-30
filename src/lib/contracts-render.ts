/**
 * Pure contract rendering helpers — NO server imports, safe for client bundles.
 */
export const MERGE_FIELDS = [
  '{{clientName}}', '{{vendorName}}', '{{businessName}}', '{{projectName}}',
  '{{total}}', '{{eventDate}}', '{{date}}',
];

export const DEFAULT_CONTRACT_HTML = `<h1>Service Agreement</h1>
<p>This agreement is made on <strong>{{date}}</strong> between <strong>{{businessName}}</strong> ("the Service Provider") and <strong>{{clientName}}</strong> ("the Client").</p>

<h2>1. Services</h2>
<p>The Service Provider agrees to provide the services described in the attached proposal/quote for the project <strong>{{projectName}}</strong>, scheduled for <strong>{{eventDate}}</strong>.</p>

<h2>2. Fees & Payment</h2>
<p>The total fee for the services is <strong>{{total}}</strong>, payable as per the schedule set out in the proposal. A non-refundable retainer secures the booking.</p>

<h2>3. Cancellation</h2>
<p>Cancellations must be made in writing. Retainers are non-refundable. Cancellations within 30 days of the service date may incur the full fee.</p>

<h2>4. Liability</h2>
<p>The Service Provider's liability is limited to the total fees paid. The Service Provider is not liable for circumstances beyond reasonable control.</p>

<h2>5. Acceptance</h2>
<p>By signing below, the Client agrees to the terms of this agreement.</p>
<p style="margin-top:32px">Client: <strong>{{clientName}}</strong></p>
<p>Service Provider: <strong>{{vendorName}}</strong>, {{businessName}}</p>`;

export interface ContractVars {
  clientName?: string | null;
  vendorName?: string | null;
  businessName?: string | null;
  projectName?: string | null;
  total?: string | null;
  eventDate?: string | null;
  date?: string | null;
}

export function renderContract(bodyHtml: string, vars: ContractVars): string {
  const map: Record<string, string> = {
    clientName: vars.clientName ?? '',
    vendorName: vars.vendorName ?? '',
    businessName: vars.businessName ?? '',
    projectName: vars.projectName ?? '',
    total: vars.total ?? '',
    eventDate: vars.eventDate ?? '',
    date: vars.date ?? new Date().toLocaleDateString('en-IN'),
  };
  return bodyHtml.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => map[k] ?? '');
}

export function contractDocument(innerHtml: string, _title = 'Agreement'): string {
  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#14141d;max-width:760px;margin:40px auto;padding:0 24px;line-height:1.6}
  h1{font-size:24px;margin-bottom:8px} h2{font-size:16px;margin-top:24px}
  p{font-size:13px} strong{color:#000}
  .sig{margin-top:48px;border-top:1px solid #ddd;padding-top:16px;font-size:12px;color:#555}
</style></head><body>${innerHtml}</body></html>`;
}
