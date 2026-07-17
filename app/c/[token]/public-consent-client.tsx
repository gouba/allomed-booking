'use client';

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { CheckCircle2, FileCheck2, LockKeyhole, Send } from 'lucide-react';
import type {
  PublicConsentDTO,
  PublicConsentSignRequestDTOSignerTypeEnum,
} from '@allomed-api/core-service-public-api';

type Acknowledgement = {
  id?: string;
  label?: string;
};
type Errors = Record<string, string>;

const signerTypes: Array<{
  value: PublicConsentSignRequestDTOSignerTypeEnum;
  label: string;
}> = [
  { value: 'PATIENT', label: 'Patient' },
  { value: 'PARENT', label: 'Parent' },
  { value: 'GUARDIAN', label: 'Guardian' },
  { value: 'LEGAL_REPRESENTATIVE', label: 'Legal representative' },
  { value: 'OTHER_REPRESENTATIVE', label: 'Other representative' },
];

export default function PublicConsentClient({
  token,
  consent,
}: {
  token: string;
  consent: PublicConsentDTO;
}) {
  const acknowledgements = (consent.requiredAcknowledgements as Acknowledgement[] | undefined) ?? [];
  const [ackValues, setAckValues] = useState<Record<string, boolean>>({});
  const [signerType, setSignerType] = useState<PublicConsentSignRequestDTOSignerTypeEnum>('PATIENT');
  const [signerName, setSignerName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [typedSignature, setTypedSignature] = useState('');
  const [drawnSignature, setDrawnSignature] = useState('');
  const [finalConfirmation, setFinalConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [documentHash, setDocumentHash] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});

  if (!consent.open) {
    return <ClosedState title="Consent link unavailable" reason={consent.closedReason} />;
  }

  if (complete) {
    return (
      <DocumentShell clinicName={consent.clinicName} title={consent.title || 'Consent'}>
        <div className="notice success">
          <CheckCircle2 size={18} />
          <div>
            <strong>Your consent has been signed.</strong>
            <p>The clinic has received the signed document. You can close this page.</p>
            {documentHash ? <p className="document-hash">Document hash: {documentHash}</p> : null}
          </div>
        </div>
      </DocumentShell>
    );
  }

  async function sign() {
    if (submitting || complete) return;
    const validationErrors = validateConsent({
      acknowledgements,
      ackValues,
      signerType,
      signerName,
      relationship,
      typedSignature,
      drawnSignature,
      finalConfirmation,
    });
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      setError('Please complete the required signing details.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/core/consents/${encodeURIComponent(token)}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signerType,
          signerName,
          relationshipToPatient: signerType === 'PATIENT' ? undefined : relationship,
          acknowledgements: ackValues,
          typedSignature: typedSignature.trim() || drawnSignature,
          finalConfirmation,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message ?? 'Unable to sign this consent.');
      setDocumentHash(payload.documentHash);
      setComplete(true);
    } catch (signError) {
      setError(signError instanceof Error ? signError.message : 'Unable to sign this consent.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DocumentShell clinicName={consent.clinicName} title={consent.title || 'Consent'}>
      <div className="document-meta">
        {consent.versionNumber ? <span>Version {consent.versionNumber}</span> : null}
        {consent.expiresAt ? <span>Expires {new Date(consent.expiresAt).toLocaleDateString()}</span> : null}
      </div>

      <section className="document-section">
        <div className="document-section-title">
          <FileCheck2 size={17} />
          <h2>Consent text</h2>
        </div>
        <SafeRichText html={consent.bodyHtml ?? ''} />
      </section>

      {acknowledgements.length > 0 ? (
        <section className="document-section">
          <h2>Acknowledgements</h2>
          <div className="choice-stack">
            {acknowledgements.map((acknowledgement, index) => {
              const id = acknowledgement.id ?? `ack-${index}`;
              return (
                <label key={id} className="checkbox-card" data-invalid={errors[`ack.${id}`] ? true : undefined}>
                  <input
                    type="checkbox"
                    checked={ackValues[id] === true}
                    aria-invalid={Boolean(errors[`ack.${id}`])}
                    onChange={(event) => {
                      setAckValues((current) => ({ ...current, [id]: event.target.checked }));
                      clearError(setErrors, `ack.${id}`);
                    }}
                  />
                  <span>{acknowledgement.label ?? 'I acknowledge this item.'}</span>
                </label>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="document-section">
        <h2>Signer</h2>
        <label className="document-field">
          <span>Signer type</span>
          <select
            value={signerType}
            onChange={(event) => {
              setSignerType(event.target.value as PublicConsentSignRequestDTOSignerTypeEnum);
              setErrors({});
            }}
          >
            {signerTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <label className="document-field" data-invalid={errors.signerName ? true : undefined}>
          <span>Signer name *</span>
          <input
            value={signerName}
            aria-invalid={Boolean(errors.signerName)}
            onChange={(event) => {
              setSignerName(event.target.value);
              clearError(setErrors, 'signerName');
            }}
          />
          {errors.signerName ? <small className="field-error">{errors.signerName}</small> : null}
        </label>
        {signerType !== 'PATIENT' ? (
          <label className="document-field" data-invalid={errors.relationship ? true : undefined}>
            <span>Relationship to patient *</span>
            <input
              value={relationship}
              aria-invalid={Boolean(errors.relationship)}
              onChange={(event) => {
                setRelationship(event.target.value);
                clearError(setErrors, 'relationship');
              }}
            />
            {errors.relationship ? <small className="field-error">{errors.relationship}</small> : null}
          </label>
        ) : null}
        <label className="document-field" data-invalid={errors.typedSignature ? true : undefined}>
          <span>Typed signature</span>
          <input
            value={typedSignature}
            aria-invalid={Boolean(errors.typedSignature)}
            onChange={(event) => {
              setTypedSignature(event.target.value);
              clearError(setErrors, 'typedSignature');
            }}
          />
          {errors.typedSignature ? <small className="field-error">{errors.typedSignature}</small> : null}
        </label>
        <SignaturePad
          value={drawnSignature}
          onChange={(value) => {
            setDrawnSignature(value);
            clearError(setErrors, 'typedSignature');
          }}
        />
        <label className="checkbox-card" data-invalid={errors.finalConfirmation ? true : undefined}>
          <input
            type="checkbox"
            checked={finalConfirmation}
            aria-invalid={Boolean(errors.finalConfirmation)}
            onChange={(event) => {
              setFinalConfirmation(event.target.checked);
              clearError(setErrors, 'finalConfirmation');
            }}
          />
          <span>I confirm that I am signing this consent electronically and that the information above is correct.</span>
        </label>
      </section>

      {error ? <div className="notice danger">{error}</div> : null}

      <button type="button" onClick={sign} disabled={submitting}>
        <Send size={16} />
        {submitting ? 'Signing...' : 'Sign consent'}
      </button>
    </DocumentShell>
  );
}

function SignaturePad({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.strokeStyle = '#111827';
    if (value) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
      image.src = value;
    }
  }, [value]);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const current = point(event);
    context.beginPath();
    context.moveTo(current.x, current.y);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const current = point(event);
    context.lineTo(current.x, current.y);
    context.stroke();
  }

  function end(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    onChange(event.currentTarget.toDataURL('image/png'));
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    onChange('');
  }

  return (
    <div className="signature-pad">
      <div className="signature-pad-header">
        <strong>Draw signature</strong>
        <button type="button" className="secondary compact" onClick={clear}>
          Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={640}
        height={180}
        className="signature-canvas"
        aria-label="Draw signature"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <p className="muted">You can draw a signature or use the typed signature field.</p>
    </div>
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
  const completed = reason === 'SIGNED' || reason === 'COMPLETED';
  return (
    <DocumentShell title={title}>
      <div className="notice">
        {completed ? 'This consent has already been signed.' : 'This secure consent link is not active, has expired, or has been revoked.'}
      </div>
    </DocumentShell>
  );
}

function SafeRichText({ html }: { html: string }) {
  return <div className="safe-rich-text" dangerouslySetInnerHTML={{ __html: html }} />;
}

function validateConsent({
  acknowledgements,
  ackValues,
  signerType,
  signerName,
  relationship,
  typedSignature,
  drawnSignature,
  finalConfirmation,
}: {
  acknowledgements: Acknowledgement[];
  ackValues: Record<string, boolean>;
  signerType: PublicConsentSignRequestDTOSignerTypeEnum;
  signerName: string;
  relationship: string;
  typedSignature: string;
  drawnSignature: string;
  finalConfirmation: boolean;
}) {
  const errors: Errors = {};
  acknowledgements.forEach((acknowledgement, index) => {
    const id = acknowledgement.id ?? `ack-${index}`;
    if (ackValues[id] !== true) {
      errors[`ack.${id}`] = 'Required acknowledgement.';
    }
  });
  if (!signerName.trim()) errors.signerName = 'Signer name is required.';
  if (signerType !== 'PATIENT' && !relationship.trim()) errors.relationship = 'Relationship is required.';
  if (!typedSignature.trim() && !drawnSignature) errors.typedSignature = 'Type or draw a signature.';
  if (!finalConfirmation) errors.finalConfirmation = 'Final confirmation is required.';
  return errors;
}

function clearError(setErrors: Dispatch<SetStateAction<Errors>>, key: string) {
  setErrors((current) => {
    const next = { ...current };
    delete next[key];
    return next;
  });
}
