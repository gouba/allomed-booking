'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CreditCard,
  Download,
  FileCheck2,
  FileText,
  Home,
  LogOut,
  Save,
  Send,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type {
  CareBootstrapDTO,
  CareConsentSummaryDTO,
  CareDocumentDTO,
  CareFormSummaryDTO,
  CareOverviewDTO,
  ManagedAppointmentResponseDTO,
  PublicConsentDTO,
  PublicConsentSignRequestDTOSignerTypeEnum,
  PublicFormDTO,
} from '@allomed-api/core-service-public-api';
import { ContentLoader } from '@/components/common/content-loader';
import { corePublic } from '@/lib/api';
import { formatClinicDate, formatClinicDateTime } from '@/lib/date-time-format';

export type CareView = 'overview' | 'appointments' | 'forms' | 'consents' | 'documents' | 'payments';

type NavItem = {
  view: CareView;
  label: string;
  icon: ReactNode;
  enabled?: boolean;
};
type LocalizedText = string | Record<string, string | undefined> | undefined;
type Option = { id: string; label?: LocalizedText };
type Field = {
  id: string;
  type: string;
  label?: LocalizedText;
  description?: LocalizedText;
  content?: string;
  required?: boolean;
  options?: Option[];
};
type Section = { id: string; label?: LocalizedText; description?: LocalizedText; fields: Field[] };
type ClinicalSchema = { sections: Section[] };
type Answers = Record<string, unknown>;
type FieldErrors = Record<string, string>;

const pendingFormStatuses = new Set(['ASSIGNED', 'SENT', 'OPENED', 'IN_PROGRESS']);
const pendingConsentStatuses = new Set(['REQUESTED', 'SENT', 'OPENED']);

export default function CarePageClient({
  initialView,
  initialResourceId,
}: {
  initialView: CareView;
  initialResourceId?: string;
}) {
  const router = useRouter();
  const [bootstrap, setBootstrap] = useState<CareBootstrapDTO | null>(null);
  const [view, setView] = useState<CareView>(initialView);
  const [resourceId, setResourceId] = useState<string | undefined>(initialResourceId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshBootstrap = useCallback(async () => {
    setBootstrap(await corePublic<CareBootstrapDTO>('/care/bootstrap'));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    refreshBootstrap()
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Care Page session required.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshBootstrap]);

  const navigation = useMemo<NavItem[]>(() => {
    const available = bootstrap?.navigation;
    const items: NavItem[] = [
      { view: 'overview', label: 'Overview', icon: <Home size={17} />, enabled: available?.overview !== false },
      { view: 'appointments', label: 'Appointments', icon: <CalendarDays size={17} />, enabled: available?.appointments !== false },
      { view: 'forms', label: 'Forms', icon: <FileText size={17} />, enabled: available?.forms !== false },
      { view: 'consents', label: 'Consents', icon: <FileCheck2 size={17} />, enabled: available?.consents !== false },
      { view: 'documents', label: 'Documents', icon: <FileText size={17} />, enabled: available?.documents !== false },
      { view: 'payments', label: 'Payments', icon: <CreditCard size={17} />, enabled: available?.payments === true },
    ];
    return items.filter((item) => item.enabled);
  }, [bootstrap]);

  const navigate = useCallback(
    (nextView: CareView, nextResourceId?: string) => {
      setView(nextView);
      setResourceId(nextResourceId);
      const params = new URLSearchParams();
      if (nextView !== 'overview') params.set('view', nextView);
      if (nextResourceId) params.set('resourceId', nextResourceId);
      const query = params.toString();
      router.replace(query ? `/care?${query}` : '/care');
    },
    [router],
  );

  async function signOut() {
    await fetch('/api/core/care/sessions', { method: 'DELETE', cache: 'no-store' }).catch(() => undefined);
    router.replace('/');
  }

  function refreshCareData() {
    setRefreshKey((current) => current + 1);
    void refreshBootstrap().catch(() => undefined);
  }

  if (loading) {
    return (
      <main className="shell care-shell">
        <section className="panel care-panel">
          <ContentLoader />
        </section>
      </main>
    );
  }

  if (error || !bootstrap) {
    return (
      <main className="shell care-entry-shell">
        <section className="panel care-entry-panel">
          <header className="hero care-entry-hero">
            <h1>Care Page unavailable</h1>
            <p>Contact the clinic to request a new secure link.</p>
          </header>
          <div className="content">
            <div className="notice danger">{error || 'Care Page session required.'}</div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="shell care-shell">
      <section className="panel care-panel">
        <header className="care-header">
          <div>
            <p className="eyebrow secure-eyebrow">Secure Care Page</p>
            <h1>{bootstrap.clinic?.name ?? 'Your clinic'}</h1>
            <p className="muted">
              {bootstrap.patient?.firstName} {bootstrap.patient?.lastName}
            </p>
          </div>
          <button type="button" className="secondary compact" onClick={signOut}>
            <LogOut size={16} />
            Sign out
          </button>
        </header>
        <nav className="care-nav" aria-label="Care Page sections">
          {navigation.map((item) => (
            <button
              type="button"
              className={item.view === view ? 'active secondary' : 'secondary'}
              key={item.view}
              onClick={() => navigate(item.view)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="care-content">
          {view === 'overview' ? (
            <Overview bootstrap={bootstrap} refreshKey={refreshKey} onNavigate={navigate} />
          ) : view === 'appointments' ? (
            <AppointmentsSection resourceId={resourceId} refreshKey={refreshKey} onNavigate={navigate} onChanged={refreshCareData} />
          ) : view === 'forms' ? (
            <FormsSection resourceId={resourceId} refreshKey={refreshKey} onNavigate={navigate} onChanged={refreshCareData} />
          ) : view === 'consents' ? (
            <ConsentsSection resourceId={resourceId} refreshKey={refreshKey} onNavigate={navigate} onChanged={refreshCareData} />
          ) : view === 'documents' ? (
            <DocumentsSection resourceId={resourceId} refreshKey={refreshKey} onNavigate={navigate} />
          ) : (
            <PaymentsSection />
          )}
        </div>
      </section>
    </main>
  );
}

function Overview({
  bootstrap,
  refreshKey,
  onNavigate,
}: {
  bootstrap: CareBootstrapDTO;
  refreshKey: number;
  onNavigate: (view: CareView, resourceId?: string) => void;
}) {
  const [overview, setOverview] = useState<CareOverviewDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    corePublic<CareOverviewDTO>('/care/overview')
      .then((data) => {
        if (active) setOverview(data);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load overview.');
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  if (error) return <InlineError message={error} />;
  if (!overview) return <ContentLoader />;

  const summary = bootstrap.summary;
  return (
    <div className="care-section">
      <div className="care-summary-grid">
        <SummaryTile label="Upcoming appointments" value={summary?.upcomingAppointmentCount ?? 0} />
        <SummaryTile label="Pending forms" value={summary?.pendingFormCount ?? 0} />
        <SummaryTile label="Pending consents" value={summary?.pendingConsentCount ?? 0} />
        <SummaryTile label="Shared documents" value={summary?.sharedDocumentCount ?? 0} />
      </div>

      <section className="care-block">
        <div className="care-block-heading">
          <h2>Next appointment</h2>
          <button type="button" className="secondary compact" onClick={() => onNavigate('appointments')}>
            View all
          </button>
        </div>
        {overview.nextAppointment ? (
          <AppointmentCard appointment={overview.nextAppointment} onOpen={() => onNavigate('appointments', overview.nextAppointment?.id)} />
        ) : (
          <EmptyState>No upcoming appointment is available.</EmptyState>
        )}
      </section>

      <section className="care-block">
        <h2>Things to complete</h2>
        <div className="care-list">
          {(overview.pendingForms ?? []).map((form) => (
            <TaskButton key={form.id} title={form.title ?? 'Form'} meta={form.status} onClick={() => onNavigate('forms', form.id)} />
          ))}
          {(overview.pendingConsents ?? []).map((consent) => (
            <TaskButton key={consent.id} title={consent.title ?? 'Consent'} meta={consent.status} onClick={() => onNavigate('consents', consent.id)} />
          ))}
          {!overview.pendingForms?.length && !overview.pendingConsents?.length ? <EmptyState>No pending tasks.</EmptyState> : null}
        </div>
      </section>

      <section className="care-block">
        <div className="care-block-heading">
          <h2>Recent documents</h2>
          <button type="button" className="secondary compact" onClick={() => onNavigate('documents')}>
            View all
          </button>
        </div>
        <DocumentList documents={overview.recentDocuments ?? []} onOpen={(id) => onNavigate('documents', id)} />
      </section>
    </div>
  );
}

function AppointmentsSection({
  resourceId,
  refreshKey,
  onNavigate,
  onChanged,
}: {
  resourceId?: string;
  refreshKey: number;
  onNavigate: (view: CareView, resourceId?: string) => void;
  onChanged: () => void;
}) {
  const [appointments, setAppointments] = useState<ManagedAppointmentResponseDTO[] | null>(null);
  const [detail, setDetail] = useState<ManagedAppointmentResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newStartAt, setNewStartAt] = useState('');

  useEffect(() => {
    let active = true;
    corePublic<ManagedAppointmentResponseDTO[]>('/care/appointments')
      .then((items) => {
        if (active) setAppointments(items);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load appointments.');
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (!resourceId) {
      setDetail(null);
      return;
    }
    let active = true;
    setError(null);
    corePublic<ManagedAppointmentResponseDTO>(`/care/appointments/${encodeURIComponent(resourceId)}`)
      .then((item) => {
        if (active) setDetail(item);
      })
      .catch(() => {
        if (active) setError('That appointment is not available in this Care Page.');
      });
    return () => {
      active = false;
    };
  }, [resourceId, refreshKey]);

  async function cancelAppointment() {
    if (!resourceId) return;
    setBusy(true);
    try {
      const updated = await corePublic<ManagedAppointmentResponseDTO>(`/care/appointments/${encodeURIComponent(resourceId)}/cancel`, { method: 'POST' });
      setDetail(updated);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function rescheduleAppointment() {
    if (!resourceId || !newStartAt) return;
    setBusy(true);
    try {
      const updated = await corePublic<ManagedAppointmentResponseDTO>(`/care/appointments/${encodeURIComponent(resourceId)}/reschedule`, {
        method: 'POST',
        body: JSON.stringify({ newStartAt }),
      });
      setDetail(updated);
      setNewStartAt('');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (!appointments) return <ContentLoader />;

  return (
    <div className="care-two-column">
      <section className="care-block">
        <h2>Appointments</h2>
        <div className="care-list">
          {appointments.map((appointment) => (
            <AppointmentCard
              key={appointment.id}
              appointment={appointment}
              active={appointment.id === resourceId}
              onOpen={() => onNavigate('appointments', appointment.id)}
            />
          ))}
          {!appointments.length ? <EmptyState>No appointments are available.</EmptyState> : null}
        </div>
      </section>
      <section className="care-block">
        <h2>Appointment details</h2>
        {error ? <InlineError message={error} /> : null}
        {detail ? (
          <div className="care-detail">
            <AppointmentFacts appointment={detail} />
            <div className="actions">
              {detail.cancellationAllowed ? (
                <button type="button" disabled={busy} onClick={cancelAppointment}>
                  Cancel
                </button>
              ) : null}
            </div>
            {detail.rescheduleAllowed ? (
              <div className="care-reschedule">
                <label>
                  <span>New appointment time</span>
                  <input type="datetime-local" value={newStartAt} onChange={(event) => setNewStartAt(event.target.value)} />
                </label>
                <button type="button" className="secondary" disabled={busy || !newStartAt} onClick={rescheduleAppointment}>
                  Reschedule
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyState>Select an appointment to view details.</EmptyState>
        )}
      </section>
    </div>
  );
}

function FormsSection({
  resourceId,
  refreshKey,
  onNavigate,
  onChanged,
}: {
  resourceId?: string;
  refreshKey: number;
  onNavigate: (view: CareView, resourceId?: string) => void;
  onChanged: () => void;
}) {
  const [forms, setForms] = useState<CareFormSummaryDTO[] | null>(null);

  useEffect(() => {
    let active = true;
    corePublic<CareFormSummaryDTO[]>('/care/forms').then((items) => {
      if (active) setForms(items);
    });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  if (!forms) return <ContentLoader />;
  const pending = forms.filter((item) => pendingFormStatuses.has(item.status ?? ''));
  const completed = forms.filter((item) => !pendingFormStatuses.has(item.status ?? ''));

  return (
    <div className="care-two-column">
      <section className="care-block">
        <h2>Forms</h2>
        <GroupedTasks title="To complete" items={pending} activeId={resourceId} onOpen={(id) => onNavigate('forms', id)} />
        <GroupedTasks title="Completed or unavailable" items={completed} activeId={resourceId} onOpen={(id) => onNavigate('forms', id)} />
      </section>
      <section className="care-block">
        <h2>Form details</h2>
        {resourceId ? <FormFlow assignmentId={resourceId} onChanged={onChanged} /> : <EmptyState>Select a form to complete it.</EmptyState>}
      </section>
    </div>
  );
}

function FormFlow({ assignmentId, onChanged }: { assignmentId: string; onChanged: () => void }) {
  const [form, setForm] = useState<PublicFormDTO | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [sectionIndex, setSectionIndex] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setForm(null);
    setMessage(null);
    corePublic<PublicFormDTO>(`/care/forms/${encodeURIComponent(assignmentId)}`)
      .then((data) => {
        if (!active) return;
        setForm(data);
        setAnswers((data.draft as Answers | undefined) ?? {});
        setSectionIndex(0);
      })
      .catch(() => {
        if (active) setMessage('That form is not available in this Care Page.');
      });
    return () => {
      active = false;
    };
  }, [assignmentId]);

  if (message) return <InlineError message={message} />;
  if (!form) return <ContentLoader />;
  const schema = form.schema as ClinicalSchema | undefined;
  if (!form.open || !schema) return <EmptyState>{completedText(form.closedReason, 'This form is not currently open.')}</EmptyState>;

  const sections = schema.sections ?? [];
  const section = sections[sectionIndex];
  const isLast = sectionIndex >= sections.length - 1;

  function updateAnswer(fieldId: string, value: unknown) {
    setAnswers((current) => ({ ...current, [fieldId]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  }

  function next() {
    const validation = validateRequired(schema!, answers, section?.id);
    setErrors(validation);
    if (Object.keys(validation).length === 0) setSectionIndex((current) => Math.min(current + 1, sections.length - 1));
  }

  async function saveDraft() {
    setBusy(true);
    try {
      await corePublic(`/care/forms/${encodeURIComponent(assignmentId)}/draft`, {
        method: 'PUT',
        body: JSON.stringify({ answers }),
      });
      setMessage('Progress saved.');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    const validation = validateRequired(schema!, answers);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;
    setBusy(true);
    try {
      await corePublic(`/care/forms/${encodeURIComponent(assignmentId)}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers, submittedByType: 'PATIENT' }),
      });
      setMessage('Your form has been submitted.');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="care-form-flow">
      {message ? <div className="notice success">{message}</div> : null}
      <div>
        <h3>{form.title ?? 'Form'}</h3>
        {form.description ? <p className="muted">{form.description}</p> : null}
      </div>
      {section ? (
        <section className="document-section">
          <div>
            <p className="eyebrow">Section {sectionIndex + 1}</p>
            <h3>{text(section.label) || 'Section'}</h3>
          </div>
          <div className="document-fields">
            {section.fields.map((field) => (
              <FieldInput key={field.id} field={field} value={answers[field.id]} error={errors[field.id]} onChange={(value) => updateAnswer(field.id, value)} />
            ))}
          </div>
        </section>
      ) : null}
      <div className="document-actions">
        <div className="actions">
          <button type="button" className="secondary" disabled={sectionIndex === 0 || busy} onClick={() => setSectionIndex((current) => Math.max(0, current - 1))}>
            <ArrowLeft size={16} />
            Back
          </button>
          {!isLast ? (
            <button type="button" disabled={busy} onClick={next}>
              Next
              <ArrowRight size={16} />
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={submit}>
              <Send size={16} />
              Submit form
            </button>
          )}
        </div>
        <button type="button" className="secondary" disabled={busy} onClick={saveDraft}>
          <Save size={16} />
          Save progress
        </button>
      </div>
    </div>
  );
}

function ConsentsSection({
  resourceId,
  refreshKey,
  onNavigate,
  onChanged,
}: {
  resourceId?: string;
  refreshKey: number;
  onNavigate: (view: CareView, resourceId?: string) => void;
  onChanged: () => void;
}) {
  const [consents, setConsents] = useState<CareConsentSummaryDTO[] | null>(null);

  useEffect(() => {
    let active = true;
    corePublic<CareConsentSummaryDTO[]>('/care/consents').then((items) => {
      if (active) setConsents(items);
    });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  if (!consents) return <ContentLoader />;
  const pending = consents.filter((item) => pendingConsentStatuses.has(item.status ?? ''));
  const completed = consents.filter((item) => !pendingConsentStatuses.has(item.status ?? ''));

  return (
    <div className="care-two-column">
      <section className="care-block">
        <h2>Consents</h2>
        <GroupedTasks title="Needs signature" items={pending} activeId={resourceId} onOpen={(id) => onNavigate('consents', id)} />
        <GroupedTasks title="Signed or unavailable" items={completed} activeId={resourceId} onOpen={(id) => onNavigate('consents', id)} />
      </section>
      <section className="care-block">
        <h2>Consent details</h2>
        {resourceId ? <ConsentFlow assignmentId={resourceId} onChanged={onChanged} /> : <EmptyState>Select a consent to review it.</EmptyState>}
      </section>
    </div>
  );
}

function ConsentFlow({ assignmentId, onChanged }: { assignmentId: string; onChanged: () => void }) {
  const [consent, setConsent] = useState<PublicConsentDTO | null>(null);
  const [signerName, setSignerName] = useState('');
  const [signerType, setSignerType] = useState<PublicConsentSignRequestDTOSignerTypeEnum>('PATIENT');
  const [relationship, setRelationship] = useState('');
  const [typedSignature, setTypedSignature] = useState('');
  const [acknowledgements, setAcknowledgements] = useState<Record<string, boolean>>({});
  const [finalConfirmation, setFinalConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setConsent(null);
    setError(null);
    setComplete(false);
    corePublic<PublicConsentDTO>(`/care/consents/${encodeURIComponent(assignmentId)}`)
      .then((data) => {
        if (active) setConsent(data);
      })
      .catch(() => {
        if (active) setError('That consent is not available in this Care Page.');
      });
    return () => {
      active = false;
    };
  }, [assignmentId]);

  if (error) return <InlineError message={error} />;
  if (!consent) return <ContentLoader />;
  if (complete) return <div className="notice success">Your consent has been signed.</div>;
  if (!consent.open) return <EmptyState>{completedText(consent.closedReason, 'This consent is not currently open.')}</EmptyState>;

  const required = (consent.requiredAcknowledgements as Array<{ id?: string; label?: string }> | undefined) ?? [];

  async function sign() {
    if (!signerName.trim() || !typedSignature.trim() || !finalConfirmation) {
      setError('Please complete the signing details.');
      return;
    }
    if (required.some((ack, index) => acknowledgements[ack.id ?? `ack-${index}`] !== true)) {
      setError('Please complete the required acknowledgements.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await corePublic(`/care/consents/${encodeURIComponent(assignmentId)}/sign`, {
        method: 'POST',
        body: JSON.stringify({
          signerType,
          signerName,
          relationshipToPatient: signerType === 'PATIENT' ? undefined : relationship,
          acknowledgements,
          typedSignature,
          finalConfirmation,
        }),
      });
      setComplete(true);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="care-form-flow">
      <div>
        <h3>{consent.title ?? 'Consent'}</h3>
        {consent.expiresAt ? <p className="muted">Expires {formatClinicDate(consent.expiresAt)}</p> : null}
      </div>
      <SafeRichText html={consent.bodyHtml ?? ''} />
      {required.length ? (
        <div className="choice-stack">
          {required.map((ack, index) => {
            const id = ack.id ?? `ack-${index}`;
            return (
              <label key={id} className="checkbox-card">
                <input type="checkbox" checked={acknowledgements[id] === true} onChange={(event) => setAcknowledgements((current) => ({ ...current, [id]: event.target.checked }))} />
                <span>{ack.label ?? 'I acknowledge this item.'}</span>
              </label>
            );
          })}
        </div>
      ) : null}
      <label className="document-field">
        <span>Signer type</span>
        <select value={signerType} onChange={(event) => setSignerType(event.target.value as PublicConsentSignRequestDTOSignerTypeEnum)}>
          <option value="PATIENT">Patient</option>
          <option value="PARENT">Parent</option>
          <option value="GUARDIAN">Guardian</option>
          <option value="LEGAL_REPRESENTATIVE">Legal representative</option>
          <option value="OTHER_REPRESENTATIVE">Other representative</option>
        </select>
      </label>
      <label className="document-field">
        <span>Signer name *</span>
        <input value={signerName} onChange={(event) => setSignerName(event.target.value)} />
      </label>
      {signerType !== 'PATIENT' ? (
        <label className="document-field">
          <span>Relationship to patient</span>
          <input value={relationship} onChange={(event) => setRelationship(event.target.value)} />
        </label>
      ) : null}
      <label className="document-field">
        <span>Typed signature *</span>
        <input value={typedSignature} onChange={(event) => setTypedSignature(event.target.value)} />
      </label>
      <label className="checkbox-card">
        <input type="checkbox" checked={finalConfirmation} onChange={(event) => setFinalConfirmation(event.target.checked)} />
        <span>I confirm that I am signing this consent electronically and that the information above is correct.</span>
      </label>
      {error ? <InlineError message={error} /> : null}
      <button type="button" disabled={busy} onClick={sign}>
        <Send size={16} />
        Sign consent
      </button>
    </div>
  );
}

function DocumentsSection({
  resourceId,
  refreshKey,
  onNavigate,
}: {
  resourceId?: string;
  refreshKey: number;
  onNavigate: (view: CareView, resourceId?: string) => void;
}) {
  const [documents, setDocuments] = useState<CareDocumentDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    corePublic<CareDocumentDTO[]>('/care/documents')
      .then((items) => {
        if (active) setDocuments(items);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load documents.');
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  async function download(documentId: string) {
    const result = await corePublic<{ downloadUrl?: string }>(`/care/documents/${encodeURIComponent(documentId)}/download`);
    if (result.downloadUrl) window.location.assign(result.downloadUrl);
  }

  if (error) return <InlineError message={error} />;
  if (!documents) return <ContentLoader />;
  const selected = documents.find((item) => item.id === resourceId);

  return (
    <div className="care-two-column">
      <section className="care-block">
        <h2>Documents</h2>
        <DocumentList documents={documents} activeId={resourceId} onOpen={(id) => onNavigate('documents', id)} />
      </section>
      <section className="care-block">
        <h2>Document details</h2>
        {resourceId && !selected ? <InlineError message="That document is not available in this Care Page." /> : null}
        {selected ? (
          <div className="care-detail">
            <strong>{selected.title ?? selected.originalFilename ?? 'Document'}</strong>
            {selected.description ? <p className="muted">{selected.description}</p> : null}
            <p className="muted">{selected.documentDate ? formatClinicDate(selected.documentDate) : selected.category}</p>
            <button type="button" onClick={() => selected.id && download(selected.id)}>
              <Download size={16} />
              Download
            </button>
          </div>
        ) : (
          <EmptyState>Select a document to view details.</EmptyState>
        )}
      </section>
    </div>
  );
}

function PaymentsSection() {
  return <EmptyState>Payments are not available for this clinic yet.</EmptyState>;
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="care-summary-tile">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function TaskButton({ title, meta, onClick }: { title: string; meta?: string; onClick: () => void }) {
  return (
    <button type="button" className="care-list-item" onClick={onClick}>
      <span>
        <strong>{title}</strong>
        {meta ? <small>{meta}</small> : null}
      </span>
      <ArrowRight size={16} />
    </button>
  );
}

function GroupedTasks({
  title,
  items,
  activeId,
  onOpen,
}: {
  title: string;
  items: Array<{ id?: string; title?: string; status?: string; dueAt?: Date; expiresAt?: Date; assignedAt?: Date; requestedAt?: Date }>;
  activeId?: string;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="care-task-group">
      <h3>{title}</h3>
      <div className="care-list">
        {items.map((item) => (
          <button
            type="button"
            className={item.id === activeId ? 'care-list-item active' : 'care-list-item'}
            key={item.id}
            onClick={() => item.id && onOpen(item.id)}
          >
            <span>
              <strong>{item.title ?? 'Item'}</strong>
              <small>{item.status}</small>
            </span>
            <ArrowRight size={16} />
          </button>
        ))}
        {!items.length ? <EmptyState>No items.</EmptyState> : null}
      </div>
    </div>
  );
}

function AppointmentCard({
  appointment,
  active,
  onOpen,
}: {
  appointment: ManagedAppointmentResponseDTO;
  active?: boolean;
  onOpen: () => void;
}) {
  return (
    <button type="button" className={active ? 'care-list-item active' : 'care-list-item'} onClick={onOpen}>
      <span>
        <strong>{appointment.service?.name ?? 'Appointment'}</strong>
        <small>{appointment.startAt ? formatClinicDateTime(appointment.startAt, appointment) : appointment.status}</small>
      </span>
      <ArrowRight size={16} />
    </button>
  );
}

function AppointmentFacts({ appointment }: { appointment: ManagedAppointmentResponseDTO }) {
  const location = appointment.location;
  const address = [
    location?.address?.addressLine1,
    location?.address?.addressLine2,
    location?.address?.city,
    location?.address?.stateOrRegion,
    location?.address?.postalCode,
    location?.address?.countryCode,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="care-facts">
      <strong>{appointment.service?.name ?? 'Appointment'}</strong>
      <span>{appointment.status}</span>
      {appointment.startAt ? <span>{formatClinicDateTime(appointment.startAt, { ...appointment, timezone: location?.timezone || appointment.timezone })}</span> : null}
      {appointment.practitioner?.displayName ? <span>{appointment.practitioner.displayName}</span> : null}
      {location?.publicDisplayName || location?.name ? <span>{location.publicDisplayName || location.name}</span> : null}
      {address ? <span>{address}</span> : null}
    </div>
  );
}

function DocumentList({
  documents,
  activeId,
  onOpen,
}: {
  documents: CareDocumentDTO[];
  activeId?: string;
  onOpen: (id: string) => void;
}) {
  if (!documents.length) return <EmptyState>No documents are available.</EmptyState>;
  return (
    <div className="care-list">
      {documents.map((document) => (
        <button
          type="button"
          className={document.id === activeId ? 'care-list-item active' : 'care-list-item'}
          key={document.id}
          onClick={() => document.id && onOpen(document.id)}
        >
          <span>
            <strong>{document.title ?? document.originalFilename ?? 'Document'}</strong>
            <small>{document.documentDate ? formatClinicDate(document.documentDate) : document.category}</small>
          </span>
          <ArrowRight size={16} />
        </button>
      ))}
    </div>
  );
}

function FieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: Field;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}) {
  const label = text(field.label) || 'Field';
  if (field.type === 'INFORMATION') return <SafeRichText html={field.content ?? ''} />;

  return (
    <label className="document-field" data-invalid={error ? true : undefined}>
      <span>
        {label}
        {field.required ? ' *' : ''}
      </span>
      {field.description ? <small>{text(field.description)}</small> : null}
      {field.type === 'LONG_TEXT' || field.type === 'RICH_TEXT' ? (
        <textarea value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} />
      ) : field.type === 'BOOLEAN' || field.type === 'SIGNATURE_ACKNOWLEDGEMENT' ? (
        <span className="checkbox-line">
          <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
          <span>Yes</span>
        </span>
      ) : field.type === 'MULTIPLE_CHOICE' ? (
        <span className="choice-stack">
          {field.options?.map((option) => {
            const values = Array.isArray(value) ? value : [];
            const checked = values.includes(option.id);
            return (
              <span key={option.id} className="checkbox-line">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => onChange(event.target.checked ? [...values, option.id] : values.filter((item) => item !== option.id))}
                />
                <span>{text(option.label) || option.id}</span>
              </span>
            );
          })}
        </span>
      ) : field.options?.length ? (
        <select value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select</option>
          {field.options.map((option) => (
            <option key={option.id} value={option.id}>
              {text(option.label) || option.id}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === 'DATE' ? 'date' : field.type === 'NUMBER' ? 'number' : 'text'}
          value={typeof value === 'string' || typeof value === 'number' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error ? <small className="field-error">{error}</small> : null}
    </label>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="notice">{children}</div>;
}

function InlineError({ message }: { message: string }) {
  return <div className="notice danger">{message}</div>;
}

function SafeRichText({ html }: { html: string }) {
  return <div className="safe-rich-text" dangerouslySetInnerHTML={{ __html: html }} />;
}

function text(value: LocalizedText) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.en || value.fr || Object.values(value).find(Boolean) || '';
}

function validateRequired(schema: ClinicalSchema, answers: Answers, sectionId?: string) {
  const errors: FieldErrors = {};
  schema.sections.forEach((section) => {
    if (sectionId && section.id !== sectionId) return;
    section.fields.forEach((field) => {
      if (!field.required || field.type === 'INFORMATION') return;
      const value = answers[field.id];
      const missing =
        value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0) ||
        ((field.type === 'BOOLEAN' || field.type === 'SIGNATURE_ACKNOWLEDGEMENT') && value !== true);
      if (missing) errors[field.id] = 'Required field.';
    });
  });
  return errors;
}

function completedText(reason: string | undefined | null, fallback: string) {
  return reason === 'COMPLETED' || reason === 'SUBMITTED' || reason === 'SIGNED' || reason === 'REVIEWED'
    ? 'This item has already been completed.'
    : fallback;
}
