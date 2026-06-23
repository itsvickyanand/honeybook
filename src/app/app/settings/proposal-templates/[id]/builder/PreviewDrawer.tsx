'use client';
/**
 * Live preview drawer — full-canvas render of the current blocks against
 * realistic sample data. The same renderer the portal uses, so what you see
 * here is what clients see.
 */
import * as React from 'react';
import { X, Smartphone, Monitor, Tablet } from 'lucide-react';
import type { Block } from '@/lib/proposals/blocks';
import { renderBlocks, type RenderContext } from '@/lib/proposals/blocks-render';
import { sampleVars } from '@/lib/proposals/blocks-client';

export function PreviewDrawer({
  open, onClose, blocks, brandColor, vendorName, onJumpToFirstBlock: _onJumpToFirstBlock,
}: {
  open: boolean;
  onClose: () => void;
  blocks: Block[];
  brandColor: string;
  vendorName: string;
  onJumpToFirstBlock?: () => void;
}) {
  const [device, setDevice] = React.useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const deviceWidth: Record<typeof device, string> = {
    desktop: 'max-w-3xl',
    tablet:  'max-w-[768px]',
    mobile:  'max-w-[420px]',
  };

  const html = React.useMemo(() => {
    if (!open) return '';
    const ctx: RenderContext = {
      doc: {
        title: 'Sample proposal',
        greeting: '',
        intro: 'A short intro paragraph appears here in real proposals.',
        sections: [
          {
            id: 's1',
            title: 'Services',
            intro: '',
            items: [
              { id: 'i1', name: 'Wedding photography — full day', description: '10 hours of coverage', unitPrice: 80000, unit: 'package', quantity: 1, amount: 80000, alternates: [] },
              { id: 'i2', name: 'Edited high-res album', description: '120 photos', unitPrice: 25000, unit: 'album', quantity: 1, amount: 25000, alternates: [] },
              { id: 'i3', name: 'Second photographer', description: 'Additional coverage from another angle', unitPrice: 30000, unit: 'day', quantity: 1, amount: 30000, alternates: [] },
            ],
          },
        ],
        inclusions: ['GST included', 'Online gallery for 6 months'],
        terms: ['50% advance to confirm', 'Balance before delivery'],
        validityDays: 14,
        discount: 0,
        taxRate: 18,
        taxLabel: 'GST',
        currency: 'INR',
        vendorName,
        clientName: 'Priya Sharma',
      },
      vars: sampleVars(vendorName),
      accentColor: brandColor,
      vendorLogoUrl: null,
      totals: { subTotal: '₹ 1,35,000', discount: '₹ 0', tax: '₹ 24,300', total: '₹ 1,59,300', taxLabel: 'GST', taxRate: 18 },
      galleries: [],
      paymentSchedule: [],
      defaultDepositPercent: 50,
      appUrl: '',
      formatShortDate: (d) => new Date(d).toLocaleDateString('en-IN'),
    };
    return renderBlocks(blocks, ctx);
  }, [open, blocks, brandColor, vendorName]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm">
      <header className="flex items-center justify-between border-b border-white/10 bg-[var(--color-surface)] px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Preview</span>
          <span className="text-xs text-[var(--color-muted)]">— using sample data</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-[var(--color-border)] p-0.5 text-xs">
            <button onClick={() => setDevice('desktop')} className={`rounded px-2 py-1 ${device === 'desktop' ? 'bg-[var(--color-surface-2)]' : 'text-[var(--color-muted)]'}`} aria-label="Desktop">
              <Monitor className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setDevice('tablet')} className={`rounded px-2 py-1 ${device === 'tablet' ? 'bg-[var(--color-surface-2)]' : 'text-[var(--color-muted)]'}`} aria-label="Tablet">
              <Tablet className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setDevice('mobile')} className={`rounded px-2 py-1 ${device === 'mobile' ? 'bg-[var(--color-surface-2)]' : 'text-[var(--color-muted)]'}`} aria-label="Mobile">
              <Smartphone className="h-3.5 w-3.5" />
            </button>
          </div>
          <button onClick={onClose} className="btn-ghost text-xs">
            <X className="h-4 w-4" /> Close
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        <div
          className={`mx-auto rounded-2xl bg-white text-[#111] shadow-xl transition-all ${deviceWidth[device]}`}
          style={{ padding: device === 'mobile' ? '20px' : '32px' }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
