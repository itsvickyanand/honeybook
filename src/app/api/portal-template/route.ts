import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

const sectionSchema = z.object({
  id: z.string(),
  kind: z.string(),
  visible: z.boolean(),
  title: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

const schema = z.object({
  theme: z.object({
    primary: z.string(),
    accent: z.string(),
    background: z.enum(['dark', 'light']).optional(),
    font: z.string().optional(),
    cornerRadius: z.enum(['sharp', 'soft', 'round']).optional(),
  }),
  sections: z.array(sectionSchema),
});

export async function GET() {
  const auth = await requireApi('settings.manage');
  if ('error' in auth) return auth.error;
  let template = await prisma.portalTemplate.findFirst({
    where: { tenantId: auth.tenant.id, isDefault: true },
  });
  if (!template) {
    template = await prisma.portalTemplate.create({
      data: {
        tenantId: auth.tenant.id,
        name: 'Default',
        isDefault: true,
        themeJson: { primary: '#8b5cf6', accent: '#ec4899' } as object,
        sectionsJson: [
          { id: 'hero', kind: 'hero', visible: true },
          { id: 'scope', kind: 'scope', visible: true, title: 'Scope & Pricing' },
          { id: 'inclusions', kind: 'inclusions', visible: true, title: "What's included" },
          { id: 'terms', kind: 'terms', visible: true, title: 'Terms' },
          { id: 'cta', kind: 'cta', visible: true },
        ] as object,
      },
    });
  }
  return NextResponse.json({ template });
}

export async function PATCH(req: Request) {
  const auth = await requireApi('settings.manage');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const updated = await prisma.portalTemplate.upsert({
    where: { id: (await prisma.portalTemplate.findFirst({ where: { tenantId: auth.tenant.id, isDefault: true } }))?.id ?? '__missing__' },
    create: {
      tenantId: auth.tenant.id,
      name: 'Default',
      isDefault: true,
      themeJson: parsed.data.theme as object,
      sectionsJson: parsed.data.sections as object,
    },
    update: {
      themeJson: parsed.data.theme as object,
      sectionsJson: parsed.data.sections as object,
    },
  });
  return NextResponse.json({ template: updated });
}
