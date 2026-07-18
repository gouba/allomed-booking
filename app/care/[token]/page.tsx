import CareTokenBootstrap from './token-bootstrap';

const allowedViews = new Set(['overview', 'appointments', 'forms', 'consents', 'documents', 'payments']);

type CareTokenPageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CareTokenPage({ params, searchParams }: CareTokenPageProps) {
  const { token } = await params;
  const query = await searchParams;
  const view = first(query.view);
  const resourceId = first(query.resourceId);

  return (
    <CareTokenBootstrap
      token={token}
      view={view && allowedViews.has(view) ? view : undefined}
      resourceId={resourceId}
    />
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
