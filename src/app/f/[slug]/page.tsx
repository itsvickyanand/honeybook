import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { PublicForm } from './PublicForm';

interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'number';
  required?: boolean;
  options?: string[];
}

export default async function PublicFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = await prisma.leadForm.findUnique({
    where: { slug },
    include: { tenant: { include: { businessType: true } } },
  });
  if (!form || !form.active) notFound();
  return (
    <main className="min-h-screen relative overflow-hidden flex items-center justify-center p-6">
      <div className="aurora" />
      <PublicForm
        slug={form.slug}
        title={form.title ?? form.name}
        description={form.description ?? null}
        fields={form.fieldsJson as unknown as FormField[]}
        vendor={{ name: form.tenant.name, accent: form.tenant.businessType.accentColor }}
        redirectUrl={form.redirectUrl}
      />
    </main>
  );
}
