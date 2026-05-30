import { prisma } from '@/lib/db';
import { SignupForm } from './SignupForm';

export default async function SignupPage() {
  const businessTypes = await prisma.businessType.findMany({ orderBy: { name: 'asc' } });
  return (
    <SignupForm
      businessTypes={businessTypes.map((b) => ({
        slug: b.slug,
        name: b.name,
        description: b.description,
        icon: b.icon,
        accentColor: b.accentColor,
      }))}
    />
  );
}
