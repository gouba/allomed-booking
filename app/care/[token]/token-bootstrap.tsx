'use client';

import { useEffect, useMemo, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ContentLoader } from '@/components/common/content-loader';

const invalidLinkMessage = 'This secure link is invalid or has expired.';

function publicLinkErrorMessage(message: unknown) {
  if (typeof message !== 'string' || !message) return invalidLinkMessage;
  if (message.startsWith('INVALID_OR_EXPIRED') || message.startsWith('CARE_SESSION')) return invalidLinkMessage;
  return message;
}

export default function CareTokenBootstrap({
  token,
  view,
  resourceId,
  action,
}: {
  token: string;
  view?: string;
  resourceId?: string;
  action?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const target = useMemo(() => {
    const params = new URLSearchParams();
    if (view) params.set('view', view);
    if (resourceId) params.set('resourceId', resourceId);
    if (action === 'reschedule' && resourceId) params.set('action', action);
    const query = params.toString();
    return query ? `/care?${query}` : '/care';
  }, [action, resourceId, view]);

  useEffect(() => {
    let active = true;

    async function establish() {
      setError(null);
      try {
        const response = await fetch('/api/core/care/sessions', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(publicLinkErrorMessage(payload.message));
        }
        if (active) router.replace(target);
      } catch (bootstrapError) {
        if (active) {
          setError(bootstrapError instanceof Error ? publicLinkErrorMessage(bootstrapError.message) : invalidLinkMessage);
        }
      }
    }

    void establish();
    return () => {
      active = false;
    };
  }, [router, target, token]);

  return (
    <main className="shell care-entry-shell">
      <section className="panel care-entry-panel">
        <header className="hero care-entry-hero">
          <p className="eyebrow secure-eyebrow">
            <LockKeyhole size={14} />
            Secure Care Page
          </p>
          <h1>{error ? 'Secure link unavailable' : 'Opening your Care Page'}</h1>
          <p>{error ? 'Contact the clinic to request a new secure link.' : 'Setting up a private patient session.'}</p>
        </header>
        <div className="content">
          {error ? (
            <div className="notice danger">{error}</div>
          ) : (
            <ContentLoader label="Setting up your Care Page..." />
          )}
        </div>
      </section>
    </main>
  );
}
