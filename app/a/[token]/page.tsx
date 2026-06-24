import { createBookingApi } from '@/lib/server/allomed-api';
import ManageAppointment, { type ManagedWithSettings } from './manage-appointment';

export default async function ManageAppointmentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const appointment = await loadAppointment(token);

  return <ManageAppointment token={token} initialAppointment={appointment} />;
}

async function loadAppointment(token: string): Promise<ManagedWithSettings | null> {
  try {
    const item = await createBookingApi().bookingGetAppointment({ token });
    return {
      id: item.id || '',
      status: item.status || '',
      startAt: item.startAt instanceof Date ? item.startAt.toISOString() : String(item.startAt || ''),
      patientName: item.patientName || '',
      service: item.service ? { name: item.service.name || 'Appointment' } : undefined,
      practitioner: item.practitioner ? { displayName: item.practitioner.displayName || '' } : undefined,
      location: item.location
        ? {
            name: item.location.name,
            publicDisplayName: item.location.publicDisplayName,
            timezone: item.location.timezone,
            address: item.location.address,
          }
        : undefined,
      cancellationAllowed: Boolean(item.cancellationAllowed),
      rescheduleAllowed: Boolean(item.rescheduleAllowed),
      timezone: item.timezone,
      timeFormat: item.timeFormat,
      dateFormat: item.dateFormat,
    };
  } catch {
    return null;
  }
}
