import { getPublicForm } from '@/lib/server/public-clinical';
import PublicFormClient from './public-form-client';

export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const form = await getPublicForm(token).catch((error) => ({
    open: false,
    closedReason: error instanceof Error ? error.message : 'INVALID_LINK',
  }));

  return <PublicFormClient token={token} form={form} />;
}
