import { getPublicConsent } from '@/lib/server/public-clinical';
import PublicConsentClient from './public-consent-client';

export default async function PublicConsentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const consent = await getPublicConsent(token).catch((error) => ({
    open: false,
    closedReason: error instanceof Error ? error.message : 'INVALID_LINK',
  }));

  return <PublicConsentClient token={token} consent={consent} />;
}
