'use client';

import type React from 'react';
import { useState } from 'react';
import { corePublic } from '@/lib/api';
import { formatClinicDateTime, formatClinicTime, type DateTimeSettings } from '@/lib/date-time-format';

type Candidate = { appointmentId: string; startAt: string; status: string; serviceName?: string; employeeName?: string };
type ClinicSettings = DateTimeSettings;

export default function CheckInFlow() {
  const [clinicSlug, setClinicSlug] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [checkedIn, setCheckedIn] = useState<Candidate | null>(null);
  const [dateTimeSettings, setDateTimeSettings] = useState<ClinicSettings>({});

  async function lookup() {
    const [clinic, nextCandidates] = await Promise.all([
      corePublic<ClinicSettings>(`/clinics/${clinicSlug}`).catch(() => ({})),
      corePublic<Candidate[]>(`/clinics/${clinicSlug}/checkin/lookup`, { method: 'POST', body: JSON.stringify({ phoneNumber, email }) }),
    ]);
    setDateTimeSettings(clinic);
    setCandidates(nextCandidates);
  }

  async function checkIn(appointmentId: string) {
    setCheckedIn(await corePublic<Candidate>(`/clinics/${clinicSlug}/checkin`, { method: 'POST', body: JSON.stringify({ appointmentId, phoneNumber, email }) }));
  }

  if (checkedIn) return <Shell title="You are checked in" description={`${checkedIn.serviceName ?? 'Appointment'} · ${formatClinicTime(checkedIn.startAt, dateTimeSettings)}`} />;

  return <Shell title="Self check-in" description="Find your appointment first, then select the visit to check in."><div className="form card"><label>Clinic slug<input value={clinicSlug} onChange={(e) => setClinicSlug(e.target.value)} placeholder="clinic-name" /></label><label>Phone number<input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} /></label><label>Email optional<input value={email} onChange={(e) => setEmail(e.target.value)} /></label><button disabled={!clinicSlug || (!phoneNumber && !email)} onClick={lookup}>Find appointments</button></div>{candidates.length ? <div className="grid">{candidates.map((candidate) => <button className="choice" key={candidate.appointmentId} onClick={() => checkIn(candidate.appointmentId)}><strong>{candidate.serviceName ?? 'Appointment'}</strong><span>{formatClinicDateTime(candidate.startAt, dateTimeSettings)} · {candidate.employeeName}</span></button>)}</div> : null}</Shell>;
}

function Shell({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return <main className="shell"><section className="panel"><div className="hero"><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{children ? <div className="content">{children}</div> : null}</section></main>;
}
