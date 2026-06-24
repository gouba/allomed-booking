'use client';

import type React from 'react';
import { ArrowLeft, LoaderCircleIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ContentLoader } from '@/components/common/content-loader';
import { corePublic } from '@/lib/api';
import { formatClinicDate, formatClinicDateTime, formatClinicTime, type DateTimeSettings } from '@/lib/date-time-format';

type ManagedLocation = {
  id?: string;
  name?: string;
  publicDisplayName?: string;
  phone?: string;
  email?: string;
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
export type Managed = { id: string; clinicSlug: string; status: string; startAt: string; durationMinutes?: number; patientName?: string; service?: { id: string; name: string; durationMinutes?: number }; practitioner?: { id: string; displayName: string }; location?: ManagedLocation; rescheduleAllowed?: boolean; manageUrl: string } & DateTimeSettings;
type Slot = { locationId?: string; employeeId: string; employeeName: string; startAt: string; endAt: string };
type AvailabilitySection = { key: string; label: string; slots: Slot[] };
type PublicClinic = { maxBookingDaysAhead?: number };
type PublicPractitioner = { id: string; rollingAvailabilityDays?: number };

const reschedulePageSizeDays = 14;

export default function RescheduleAppointment({ token, initialAppointment = null }: { token: string; initialAppointment?: Managed | null }) {
  const [appointment, setAppointment] = useState<Managed | null>(initialAppointment);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(Boolean(initialAppointment?.rescheduleAllowed && initialAppointment.service?.id));
  const [loadedThroughOffset, setLoadedThroughOffset] = useState(-1);
  const [maxBookableDayOffset, setMaxBookableDayOffset] = useState(30);

  useEffect(() => {
    if (initialAppointment) {
      void initializeAvailability(initialAppointment);
      return;
    }
    void load();
  }, [token]);

  async function load() {
    const item = await corePublic<Managed>(`/appointments/${token}`);
    setAppointment(item);
    setSlots([]);
    setLoadedThroughOffset(-1);
    await initializeAvailability(item);
  }

  async function initializeAvailability(item: Managed) {
    if (!item.rescheduleAllowed || !item.service?.id) {
      setLoadingSlots(false);
      return;
    }

    const maxOffset = await resolveMaxBookableDayOffset(item);
    setMaxBookableDayOffset(maxOffset);
    await loadAvailability(item, 0, maxOffset, true);
  }

  async function loadAvailability(item: Managed, dayOffset: number, maxOffset = maxBookableDayOffset, replace = false) {
    if (!item.service?.id || dayOffset > maxOffset) return;

    const endOffset = Math.min(dayOffset + reschedulePageSizeDays - 1, maxOffset);
    const query = new URLSearchParams({
      serviceId: item.service.id,
      from: dateKeyFromOffset(dayOffset),
      to: dateKeyFromOffset(endOffset),
    });
    if (item.location?.id) query.set('locationId', item.location.id);
    if (item.practitioner?.id) query.set('employeeId', item.practitioner.id);

    setLoadingSlots(true);
    try {
      const nextSlots = await corePublic<Slot[]>(`/clinics/${item.clinicSlug}/availability?${query}`).catch(() => []);
      setSlots((current) => (replace ? nextSlots : mergeSlots(current, nextSlots)));
      setLoadedThroughOffset((current) => Math.max(current, endOffset));
    } finally {
      setLoadingSlots(false);
    }
  }

  async function loadMoreAvailability() {
    if (!appointment || loadingSlots || loadedThroughOffset >= maxBookableDayOffset) return;
    await loadAvailability(appointment, loadedThroughOffset + 1);
  }

  async function reschedule() {
    if (!selected || !appointment?.rescheduleAllowed) return;
    setError('');
    setBusy(true);
    try {
      await corePublic(`/appointments/${token}/reschedule`, { method: 'POST', body: JSON.stringify({ newStartAt: selected.startAt, employeeId: selected.employeeId }) });
      window.location.assign(appointment.manageUrl || `/a/${token}`);
    } catch (exception) {
      setSelected(null);
      setError(publicRescheduleError(exception));
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!appointment) return <Shell title="Loading reschedule"><ContentLoader /></Shell>;
  if (!appointment.rescheduleAllowed) return <Shell title="Rescheduling unavailable" description="This appointment cannot be rescheduled online. Please contact the clinic." />;
  const locationName = locationDisplayName(appointment.location);
  const dateTimeSettings = resolveDateTimeSettings(appointment);
  const sections = buildAvailabilitySections(slots, loadedThroughOffset, dateTimeSettings);
  const canLoadMore = loadedThroughOffset >= 0 && loadedThroughOffset < maxBookableDayOffset;

  if (selected) {
    return (
      <Shell title="Confirm appointment" description="Review the new appointment time before confirming.">
        <section className="reschedule-confirmation" aria-label="Appointment details">
          <dl className="reschedule-details">
            {appointment.patientName ? <Detail label="Patient" value={appointment.patientName} /> : null}
            <Detail label="Service" value={appointment.service?.name ?? 'Appointment'} />
            <Detail label="Practitioner" value={selected.employeeName || appointment.practitioner?.displayName || 'Practitioner'} />
            <Detail label="Current time" value={formatClinicDateTime(appointment.startAt, dateTimeSettings)} />
            <Detail label="New time" value={formatClinicDateTime(selected.startAt, dateTimeSettings)} />
            {appointment.durationMinutes ? <Detail label="Duration" value={`${appointment.durationMinutes} minutes`} /> : null}
            {formatLocationAddress(appointment.location) ? <Detail label="Address" value={formatLocationAddress(appointment.location)} /> : null}
          </dl>
          <div className="actions">
            <button className="secondary" disabled={busy} type="button" onClick={() => setSelected(null)}>Back</button>
            <button disabled={busy} type="button" onClick={reschedule}>{busy ? 'Confirming...' : 'Confirm appointment'}</button>
          </div>
        </section>
      </Shell>
    );
  }

  return (
    <Shell title="Choose a new time" description={[appointment.service?.name, locationName].filter(Boolean).join(' · ')}>
      <button className="back-button" type="button" onClick={() => window.location.assign(appointment.manageUrl || `/a/${token}`)}>
        <ArrowLeft aria-hidden="true" size={16} strokeWidth={2.25} />
        Back
      </button>
      {error ? <p className="notice">{error}</p> : null}
      {sections.length === 0 ? (
        <p className="muted inline-loading">{loadingSlots ? <><LoaderCircleIcon aria-hidden="true" className="inline-loading-icon" /> Loading available times...</> : 'No online slots are available in this period.'}</p>
      ) : (
        <div className="reschedule-availability">
          <h2>Available appointments</h2>
          {sections.map((section, index) => (
            <section key={section.key} className="reschedule-day">
              {index === 1 ? <h2 className="reschedule-more-heading">More availability</h2> : null}
              <h3>{section.label}</h3>
              {section.slots.length > 0 ? (
                <div className="reschedule-times">
                  {section.slots.map((slot) => (
                    <button
                      key={`${slot.employeeId}-${slot.startAt}`}
                      className="reschedule-time"
                      type="button"
                      onClick={() => setSelected(slot)}
                    >
                      {formatClinicTime(slot.startAt, dateTimeSettings)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted reschedule-empty">No available appointments</p>
              )}
            </section>
          ))}
        </div>
      )}
      {loadingSlots && sections.length > 0 ? <p className="muted availability-note inline-loading"><LoaderCircleIcon aria-hidden="true" className="inline-loading-icon" /> Loading available times...</p> : null}
      {!loadingSlots && canLoadMore ? <button className="more-slots" type="button" onClick={() => void loadMoreAvailability()}>More availability</button> : null}
    </Shell>
  );
}

function Shell({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return <main className="shell"><section className="panel"><div className="hero"><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{children ? <div className="content">{children}</div> : null}</section></main>;
}

function buildAvailabilitySections(slots: Slot[], loadedThroughOffset: number, dateTimeSettings?: DateTimeSettings): AvailabilitySection[] {
  const sortedSlots = [...slots].sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime());
  const slotsByDay = sortedSlots.reduce<Record<string, Slot[]>>((acc, slot) => {
    const key = toDateKey(new Date(slot.startAt));
    acc[key] = acc[key] ?? [];
    acc[key].push(slot);
    return acc;
  }, {});

  const days = buildRescheduleDays(loadedThroughOffset);
  const firstAvailableIndex = days.findIndex((day) => slotsByDay[day.key]?.length);
  const lastAvailableIndex = days.findLastIndex((day) => slotsByDay[day.key]?.length);
  if (firstAvailableIndex < 0 || lastAvailableIndex < 0) return [];

  const sections: AvailabilitySection[] = [];
  let emptyStart: Date | null = null;
  let emptyEnd: Date | null = null;

  function flushEmptyRange() {
    if (!emptyStart || !emptyEnd) return;
    sections.push({
      key: `empty-${toDateKey(emptyStart)}-${toDateKey(emptyEnd)}`,
      label: formatDateRange(emptyStart, emptyEnd, dateTimeSettings),
      slots: [],
    });
    emptyStart = null;
    emptyEnd = null;
  }

  days.slice(firstAvailableIndex, lastAvailableIndex + 1).forEach((day) => {
    const daySlots = slotsByDay[day.key] ?? [];
    if (daySlots.length === 0) {
      emptyStart = emptyStart ?? day.date;
      emptyEnd = day.date;
      return;
    }

    flushEmptyRange();
    sections.push({
      key: day.key,
      label: formatClinicDate(`${day.key}T00:00:00`, dateTimeSettings, 'short'),
      slots: daySlots,
    });
  });
  flushEmptyRange();

  return sections;
}

function buildRescheduleDays(loadedThroughOffset: number) {
  if (loadedThroughOffset < 0) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: loadedThroughOffset + 1 }).map((_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return { date, key: toDateKey(date) };
  });
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateKeyFromOffset(dayOffset: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return toDateKey(date);
}

function mergeSlots(current: Slot[], nextSlots: Slot[]) {
  const byKey = new Map(current.map((slot) => [slotKey(slot), slot]));
  nextSlots.forEach((slot) => byKey.set(slotKey(slot), slot));
  return Array.from(byKey.values()).sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime());
}

function slotKey(slot: Slot) {
  return `${slot.locationId ?? ''}|${slot.employeeId}|${slot.startAt}|${slot.endAt}`;
}

function formatDateRange(start: Date, end: Date, dateTimeSettings?: DateTimeSettings) {
  if (toDateKey(start) === toDateKey(end)) {
    return formatClinicDate(`${toDateKey(start)}T00:00:00`, dateTimeSettings, 'short');
  }
  return `${formatClinicDate(`${toDateKey(start)}T00:00:00`, dateTimeSettings, 'short')} - ${formatClinicDate(`${toDateKey(end)}T00:00:00`, dateTimeSettings, 'short')}`;
}

function locationDisplayName(location?: ManagedLocation) {
  return location?.publicDisplayName?.trim() || location?.name?.trim() || '';
}

function formatLocationAddress(location?: ManagedLocation) {
  if (!location?.address) return '';
  return [
    location.address.addressLine1,
    location.address.addressLine2,
    location.address.city,
    location.address.stateOrRegion,
    location.address.postalCode,
    location.address.countryCode,
  ]
    .filter(Boolean)
    .join(', ');
}

function resolveDateTimeSettings(appointment: Managed): DateTimeSettings {
  return {
    timezone: appointment.location?.timezone || appointment.timezone,
    timeFormat: appointment.timeFormat,
    dateFormat: appointment.dateFormat,
  };
}

async function resolveMaxBookableDayOffset(appointment: Managed) {
  const clinic = await corePublic<PublicClinic>(`/clinics/${appointment.clinicSlug}`).catch(() => null);
  const clinicMax = Math.max(0, clinic?.maxBookingDaysAhead ?? 30);

  if (!appointment.service?.id || !appointment.practitioner?.id) {
    return clinicMax;
  }

  const practitioners = await corePublic<PublicPractitioner[]>(`/clinics/${appointment.clinicSlug}/practitioners?${new URLSearchParams({ serviceId: appointment.service.id })}`).catch(() => []);
  const rollingAvailabilityDays = practitioners.find((practitioner) => practitioner.id === appointment.practitioner?.id)?.rollingAvailabilityDays;
  if (rollingAvailabilityDays == null || rollingAvailabilityDays < 0) {
    return clinicMax;
  }

  return Math.min(clinicMax, rollingAvailabilityDays);
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="reschedule-detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function publicRescheduleError(exception: unknown) {
  const message = exception instanceof Error ? exception.message : '';
  if (message === 'SLOT_UNAVAILABLE') {
    return 'That appointment time is no longer available. Please choose another time.';
  }
  if (message === 'PRACTITIONER_MISMATCH') {
    return 'This appointment can only be rescheduled with the same practitioner.';
  }
  if (message === 'APPOINTMENT_NOT_RESCHEDULABLE') {
    return 'This appointment can no longer be rescheduled online. Please contact the clinic.';
  }
  return message || 'Unable to reschedule this appointment. Please try another time.';
}
