'use client';

import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLoader } from '@/components/common/content-loader';
import { corePublic } from '@/lib/api';
import { formatClinicDateTime, type DateTimeSettings } from '@/lib/date-time-format';

export type ManagedLocation = {
  name?: string;
  publicDisplayName?: string;
  timezone?: string;
  address?: {
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    stateOrRegion?: string;
    postalCode?: string;
    countryCode?: string;
  };
};
export type Managed = { id: string; status: string; startAt: string; patientName: string; service?: { name: string }; practitioner?: { displayName: string }; location?: ManagedLocation; cancellationAllowed: boolean; rescheduleAllowed: boolean; pendingFormCount?: number; pendingConsentCount?: number };
export type ManagedWithSettings = Managed & DateTimeSettings;

export default function ManageAppointment({ token, initialAppointment = null }: { token: string; initialAppointment?: ManagedWithSettings | null }) {
  const [appointment, setAppointment] = useState<ManagedWithSettings | null>(initialAppointment);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setAppointment(await corePublic<ManagedWithSettings>(`/appointments/${token}`));
  }, [token]);

  useEffect(() => {
    if (initialAppointment) return;
    void load();
  }, [initialAppointment, load]);

  async function cancel() {
    setBusy(true);
    try {
      setAppointment(await corePublic<ManagedWithSettings>(`/appointments/${token}/cancel`, { method: 'POST' }));
    } finally {
      setBusy(false);
    }
  }

  if (!appointment) return <Shell title="Loading appointment"><ContentLoader /></Shell>;
  return (
    <Shell title="Manage appointment" description={`${appointment.patientName} · ${appointment.status}`}>
      <div className="card">
        <strong>{appointment.service?.name ?? 'Appointment'}</strong>
        <p className="muted">{formatClinicDateTime(appointment.startAt, { ...appointment, timezone: appointment.location?.timezone || appointment.timezone })}</p>
        <p className="muted">{appointment.practitioner?.displayName}</p>
        {appointment.location ? <p className="muted">{formatLocation(appointment.location)}</p> : null}
      </div>
      <PreAppointmentDocuments appointment={appointment} />
      <div className="actions">
        {appointment.cancellationAllowed ? (
          <button disabled={busy} onClick={cancel}>Cancel appointment</button>
        ) : null}
        {appointment.rescheduleAllowed ? (
          <Link className="button secondary" href={`/a/${token}/reschedule`}>Reschedule</Link>
        ) : null}
      </div>
    </Shell>
  );
}

function PreAppointmentDocuments({ appointment }: { appointment: ManagedWithSettings }) {
  const pendingFormCount = appointment.pendingFormCount ?? 0;
  const pendingConsentCount = appointment.pendingConsentCount ?? 0;
  const hasPendingDocuments = pendingFormCount > 0 || pendingConsentCount > 0;

  return (
    <div className="card document-status-card">
      <strong>{hasPendingDocuments ? 'Pre-appointment documents' : 'Documents ready'}</strong>
      <div className="document-status-grid">
        <span>{pendingFormCount} {pendingFormCount === 1 ? 'form' : 'forms'} pending</span>
        <span>{pendingConsentCount} {pendingConsentCount === 1 ? 'consent' : 'consents'} pending</span>
      </div>
      <p className="muted">
        {hasPendingDocuments
          ? 'Use the secure links sent by your clinic to complete these before your appointment.'
          : 'No pre-appointment forms or consents are pending.'}
      </p>
    </div>
  );
}

function formatLocation(location: ManagedLocation) {
  const address = [
    location.address?.addressLine1,
    location.address?.addressLine2,
    location.address?.city,
    location.address?.stateOrRegion,
    location.address?.postalCode,
    location.address?.countryCode,
  ]
    .filter(Boolean)
    .join(', ');

  return address;
}

function Shell({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return <main className="shell"><section className="panel"><div className="hero"><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{children ? <div className="content">{children}</div> : null}</section></main>;
}
