import CarePageClient, { type CareView } from './care-page-client';

const allowedViews: CareView[] = ['overview', 'appointments', 'forms', 'consents', 'documents', 'payments'];

type CarePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CarePage({ searchParams }: CarePageProps) {
  const query = await searchParams;
  const view = first(query.view);
  const resourceId = first(query.resourceId);
  const action = first(query.action);

  return (
    <CarePageClient
      initialView={view && allowedViews.includes(view as CareView) ? (view as CareView) : 'overview'}
      initialResourceId={resourceId}
      initialAction={action === 'reschedule' ? action : undefined}
    />
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
