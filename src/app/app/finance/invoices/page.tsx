import { redirect } from 'next/navigation';

/**
 * Finance → Invoices tab. The full invoice management UI already lives at
 * /app/invoices; redirect there rather than duplicate.
 */
export default function FinanceInvoicesPage() {
  redirect('/app/invoices');
}
