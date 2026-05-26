/**
 * Example vertical plugin: Travel Agent.
 * Adds a Visa section to client portals and creates a visa document pack.
 */
import { registerPlugin } from './registry';

registerPlugin({
  slug: 'travel-agent',
  defaultPortalTemplate(_ctx, base) {
    return {
      ...base,
      sections: [
        ...base.sections.filter((s) => s.kind !== 'cta'),
        { id: 'sec-visa', kind: 'visa', visible: true, title: 'Visa Documents' },
        { id: 'sec-docs', kind: 'documents', visible: true, title: 'Travel Documents' },
        base.sections.find((s) => s.kind === 'cta')!,
      ],
    };
  },
  defaultDocumentPacks() {
    return [
      { title: 'Passport copy', category: 'VISA' },
      { title: 'Visa application form', category: 'VISA' },
      { title: 'Photographs (2)', category: 'VISA' },
      { title: 'Bank statements (3 months)', category: 'VISA' },
      { title: 'ITR (latest)', category: 'VISA' },
      { title: 'Employment letter', category: 'VISA' },
    ];
  },
});
