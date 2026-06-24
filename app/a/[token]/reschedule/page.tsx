import { createBookingApi } from '@/lib/server/allomed-api';
import RescheduleAppointment, { type Managed } from './reschedule-appointment';

export default async function RescheduleAppointmentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const appointment = await loadAppointment(token);

  return <RescheduleAppointment token={token} initialAppointment={appointment} />;
}

async function loadAppointment(token: string): Promise<Managed | null> {
  try {
    const item = await createBookingApi().bookingGetAppointment({ token });
    return {
      id: item.id || '',
      clinicSlug: item.clinicSlug || '',
      status: item.status || '',
      startAt: item.startAt instanceof Date ? item.startAt.toISOString() : String(item.startAt || ''),
      durationMinutes: item.durationMinutes,
      patientName: item.patientName,
      service: item.service
        ? {
            id: item.service.id || '',
            name: item.service.name || '',
            durationMinutes: item.service.durationMinutes,
          }
        : undefined,
      practitioner: item.practitioner
        ? {
            id: item.practitioner.id || '',
            displayName: item.practitioner.displayName || '',
          }
        : undefined,
      location: item.location
        ? {
            id: item.location.id,
            name: item.location.name,
            publicDisplayName: item.location.publicDisplayName,
            phone: item.location.phone,
            email: item.location.email,
            timezone: item.location.timezone,
            address: item.location.address,
          }
        : undefined,
      rescheduleAllowed: item.rescheduleAllowed,
      manageUrl: item.manageUrl || `/a/${token}`,
      timezone: item.timezone,
      timeFormat: item.timeFormat,
      dateFormat: item.dateFormat,
    };
  } catch {
    return null;
  }
}
