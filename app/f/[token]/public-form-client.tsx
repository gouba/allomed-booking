'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, LockKeyhole, Save, Send } from 'lucide-react';
import type { PublicFormDTO } from '@allomed-api/core-service-public-api';

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
type Section = {
  id: string;
  label?: LocalizedText;
  description?: LocalizedText;
  fields: Field[];
};
type ClinicalSchema = {
  sections: Section[];
};
type Answers = Record<string, unknown>;
type FieldErrors = Record<string, string>;

function text(value: LocalizedText) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.en || value.fr || Object.values(value).find(Boolean) || '';
}

export default function PublicFormClient({
  token,
  form,
}: {
  token: string;
  form: PublicFormDTO;
}) {
  const schema = form.schema as ClinicalSchema | undefined;
  const [answers, setAnswers] = useState<Answers>((form.draft as Answers | undefined) ?? {});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [sectionIndex, setSectionIndex] = useState(0);
  const sections = schema?.sections ?? [];
  const currentSection = sections[sectionIndex];
  const isLastSection = sectionIndex >= sections.length - 1;

  const saveDraft = useCallback(
    async (quiet = false) => {
      setSaving(true);
      if (!quiet) setError(null);
      try {
        const response = await fetch(`/api/core/forms/${encodeURIComponent(token)}/draft`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message ?? 'Unable to save progress.');
        setSavedAt(new Date().toLocaleTimeString());
        setDirty(false);
      } catch (saveError) {
        if (!quiet) {
          setError(saveError instanceof Error ? saveError.message : 'Unable to save progress.');
        }
      } finally {
        setSaving(false);
      }
    },
    [answers, token],
  );

  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => {
      if (dirty && !complete) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', listener);
    return () => window.removeEventListener('beforeunload', listener);
  }, [dirty, complete]);

  useEffect(() => {
    if (!dirty || complete || !form.open || !schema) return;
    const timeout = window.setTimeout(() => {
      void saveDraft(true);
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, [dirty, complete, form.open, schema, saveDraft]);

  const progress = useMemo(() => {
    if (sections.length <= 1) return null;
    return Math.round(((sectionIndex + 1) / sections.length) * 100);
  }, [sectionIndex, sections.length]);

  if (!form.open || !schema) {
    return <ClosedState title="Form link unavailable" reason={form.closedReason} />;
  }

  if (complete) {
    return (
      <DocumentShell clinicName={form.clinicName} title={form.title || 'Form'}>
        <div className="notice success">
          <CheckCircle2 size={18} />
          <div>
            <strong>Your form has been submitted.</strong>
            <p>The clinic has received your answers. You can close this page.</p>
          </div>
        </div>
      </DocumentShell>
    );
  }

  function updateAnswer(fieldId: string, value: unknown) {
    setAnswers((current) => ({ ...current, [fieldId]: value }));
    setDirty(true);
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  }

  function nextSection() {
    const validationErrors = validateRequired(schema!, answers, currentSection?.id);
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      setError('Please complete the required fields in this section.');
      return;
    }
    setError(null);
    setSectionIndex((current) => Math.min(current + 1, sections.length - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function previousSection() {
    setError(null);
    setSectionIndex((current) => Math.max(current - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit() {
    const validationErrors = validateRequired(schema!, answers);
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      setError('Please complete the required fields before submitting.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/core/forms/${encodeURIComponent(token)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, submittedByType: 'PATIENT' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message ?? 'Unable to submit this form.');
      setComplete(true);
      setDirty(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit this form.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DocumentShell clinicName={form.clinicName} title={form.title || 'Form'}>
      {form.description ? <p className="muted document-description">{form.description}</p> : null}
      {progress !== null ? (
        <div className="document-progress" aria-label={`Section ${sectionIndex + 1} of ${sections.length}`}>
          <div className="document-progress-track">
            <div className="document-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span>Section {sectionIndex + 1} of {sections.length}</span>
        </div>
      ) : null}

      {currentSection ? (
        <section className="document-section">
          <div>
            <p className="eyebrow">Section {sectionIndex + 1}</p>
            <h2>{text(currentSection.label) || 'Section'}</h2>
            {currentSection.description ? <p className="muted">{text(currentSection.description)}</p> : null}
          </div>
          <div className="document-fields">
            {currentSection.fields.map((field) => (
              <FieldInput
                key={field.id}
                field={field}
                value={answers[field.id]}
                error={fieldErrors[field.id]}
                onChange={(value) => updateAnswer(field.id, value)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {error ? <div className="notice danger">{error}</div> : null}

      <div className="document-actions">
        <div className="actions">
          <button type="button" className="secondary" onClick={previousSection} disabled={sectionIndex === 0 || submitting}>
            <ArrowLeft size={16} />
            Back
          </button>
          {!isLastSection ? (
            <button type="button" onClick={nextSection} disabled={submitting}>
              Next
              <ArrowRight size={16} />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={submitting}>
              <Send size={16} />
              {submitting ? 'Submitting...' : 'Submit form'}
            </button>
          )}
        </div>
        <button type="button" className="secondary" onClick={() => saveDraft(false)} disabled={saving}>
          <Save size={16} />
          {saving ? 'Saving...' : 'Save progress'}
        </button>
      </div>
      <p className="muted autosave-status" aria-live="polite">
        {saving ? 'Saving progress...' : savedAt ? `Saved at ${savedAt}` : 'Progress saves automatically while this page is open.'}
      </p>
    </DocumentShell>
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
  if (field.type === 'INFORMATION') {
    return <SafeRichText html={field.content ?? ''} />;
  }

  return (
    <label className="document-field" data-invalid={error ? true : undefined}>
      <span>
        {label}
        {field.required ? ' *' : ''}
      </span>
      {field.description ? <small>{text(field.description)}</small> : null}
      {field.type === 'LONG_TEXT' || field.type === 'RICH_TEXT' ? (
        <textarea value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} />
      ) : field.type === 'BOOLEAN' || field.type === 'SIGNATURE_ACKNOWLEDGEMENT' ? (
        <span className="checkbox-line">
          <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} aria-invalid={Boolean(error)} />
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
                  onChange={(event) =>
                    onChange(event.target.checked ? [...values, option.id] : values.filter((item) => item !== option.id))
                  }
                />
                <span>{text(option.label) || option.id}</span>
              </span>
            );
          })}
        </span>
      ) : field.options?.length ? (
        <select value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)}>
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
          aria-invalid={Boolean(error)}
        />
      )}
      {error ? <small className="field-error">{error}</small> : null}
    </label>
  );
}

function DocumentShell({
  clinicName,
  title,
  children,
}: {
  clinicName?: string | null;
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="shell document-shell">
      <section className="panel document-panel">
        <header className="hero document-hero">
          <p className="eyebrow secure-eyebrow">
            <LockKeyhole size={14} />
            Secure document
          </p>
          <h1>{title}</h1>
          {clinicName ? <p>{clinicName}</p> : null}
        </header>
        <div className="content document-content">{children}</div>
      </section>
    </main>
  );
}

function ClosedState({ title, reason }: { title: string; reason?: string | null }) {
  const completed = reason === 'COMPLETED' || reason === 'SUBMITTED' || reason === 'REVIEWED';
  return (
    <DocumentShell title={title}>
      <div className="notice">
        {completed ? 'This document has already been completed.' : 'This secure link is not active, has expired, or has been revoked.'}
      </div>
    </DocumentShell>
  );
}

function SafeRichText({ html }: { html: string }) {
  return <div className="safe-rich-text" dangerouslySetInnerHTML={{ __html: html }} />;
}

function validateRequired(schema: ClinicalSchema, answers: Answers, sectionId?: string): FieldErrors {
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
      if (missing) {
        errors[field.id] = 'Required field.';
      }
    });
  });
  return errors;
}
