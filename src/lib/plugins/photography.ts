import { registerPlugin } from './registry';

registerPlugin({
  slug: 'wedding-photography',
  defaultPortalTemplate(_ctx, base) {
    return {
      ...base,
      sections: [
        ...base.sections.filter((s) => s.kind !== 'cta'),
        { id: 'sec-gallery', kind: 'gallery', visible: true, title: 'Sample Work' },
        base.sections.find((s) => s.kind === 'cta')!,
      ],
    };
  },
});
