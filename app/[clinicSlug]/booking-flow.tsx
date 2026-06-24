'use client';

import type React from 'react';
import { ArrowLeft, MapPin, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PhoneInput } from 'react-international-phone';
import { corePublic } from '@/lib/api';
import { formatClinicDate, formatClinicDateTime, formatClinicTime, type DateTimeSettings } from '@/lib/date-time-format';

export type BookingClinic = {
  name: string;
  onlineBookingEnabled: boolean;
  maxBookingDaysAhead?: number;
  description?: string;
  phone?: string;
  email?: string;
  requirePhoneVerification?: boolean;
  allowAnyPractitioner?: boolean;
  bookByServiceEnabled?: boolean;
  defaultOnlineBookingServiceId?: string;
  bookByPractitionerEnabled?: boolean;
  additionalBookingQuestionEnabled?: boolean;
  additionalBookingQuestionPrompt?: string;
  marketingEmailOptInPrompt?: string;
  timezone?: string;
  timeFormat?: string;
  dateFormat?: string;
  logo?: string;
  primaryColor?: string;
  locations?: BookingLocation[];
};
type LocationType = 'PHYSICAL' | 'VIRTUAL' | 'HOME_VISIT';
type ServiceDeliveryMode = 'IN_PERSON' | 'VIRTUAL' | 'HOME_VISIT';
export type BookingService = {
  id: string;
  name: string;
  description?: string;
  durationMinutes: number;
  deliveryModes?: ServiceDeliveryMode[];
};
export type BookingLocation = {
  id: string;
  name?: string;
  type?: LocationType;
  publicDisplayName?: string;
  notes?: string;
  phone?: string;
  email?: string;
  onlineBookingEnabled?: boolean;
  timezone?: string;
  isDefault?: boolean;
  address?: {
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    stateOrRegion?: string;
    postalCode?: string;
    countryCode?: string;
  };
};
type Practitioner = { id: string; displayName: string; firstName?: string; lastName?: string; prefix?: string; rollingAvailabilityDays?: number };
type Slot = { locationId?: string; serviceId: string; deliveryMode?: ServiceDeliveryMode; employeeId: string; employeeName: string; startAt: string; endAt: string };
type Step = 'location' | 'service' | 'practitioner' | 'time' | 'details' | 'verification';
type VerificationMessageType = 'success' | 'error';

const visibleDayCount = 7;
const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'long' });

export default function BookingFlow({
  clinicSlug,
  initialClinic = null,
  initialServices = [],
}: {
  clinicSlug: string;
  initialClinic?: BookingClinic | null;
  initialServices?: BookingService[];
}) {
  const [clinic, setClinic] = useState<BookingClinic | null>(initialClinic);
  const [services, setServices] = useState<BookingService[]>(initialServices);
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [step, setStep] = useState<Step>('service');
  const [locationId, setLocationId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [slot, setSlot] = useState<Slot | null>(null);
  const [patient, setPatient] = useState({ firstName: '', lastName: '', phoneNumber: '', email: '' });
  const [visitAddress, setVisitAddress] = useState({
    addressLine1: '',
    addressLine2: '',
    city: '',
    stateOrRegion: '',
    postalCode: '',
    countryCode: 'CA',
    notes: '',
  });
  const [answer, setAnswer] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [code, setCode] = useState('');
  const [verifiedToken, setVerifiedToken] = useState('');
  const [verificationMessage, setVerificationMessage] = useState('');
  const [verificationMessageType, setVerificationMessageType] = useState<VerificationMessageType>('success');
  const [resendStatus, setResendStatus] = useState<'idle' | 'submitting'>('idle');
  const [resendCooldown, setResendCooldown] = useState(60);
  const [marketingEmailOptIn, setMarketingEmailOptIn] = useState(false);
  const [success, setSuccess] = useState<{ manageUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const autoStartedVerificationForPhone = useRef('');
  const [initialLoaded, setInitialLoaded] = useState(Boolean(initialClinic));
  const [loadingPractitioners, setLoadingPractitioners] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);
  const [visibleRows, setVisibleRows] = useState(4);
  const [loadedThroughOffset, setLoadedThroughOffset] = useState(-1);

  const activeLocations = useMemo(
    () => (clinic?.locations ?? []).filter((location) => location.id && location.onlineBookingEnabled !== false),
    [clinic?.locations],
  );
  const selectedLocation = useMemo(
    () => activeLocations.find((location) => location.id === locationId),
    [activeLocations, locationId],
  );
  const selectedDeliveryMode = deliveryModeForLocation(selectedLocation);
  const availableServices = useMemo(
    () => services.filter((service) => serviceSupportsDeliveryMode(service, selectedDeliveryMode)),
    [selectedDeliveryMode, services],
  );
  const selectedService = useMemo(() => availableServices.find((service) => service.id === serviceId), [availableServices, serviceId]);
  const dateTimeSettings = useMemo<DateTimeSettings>(() => ({
    timezone: selectedLocation?.timezone || clinic?.timezone,
    timeFormat: clinic?.timeFormat,
    dateFormat: clinic?.dateFormat,
  }), [clinic?.dateFormat, clinic?.timeFormat, clinic?.timezone, selectedLocation?.timezone]);
  const hasMultipleLocations = activeLocations.length > 1;
  const selectedPractitioner = useMemo(
    () => practitioners.find((practitioner) => practitioner.id === employeeId),
    [employeeId, practitioners],
  );
  const bookByServiceEnabled = clinic?.bookByServiceEnabled !== false;
  const bookByPractitionerEnabled = clinic?.bookByPractitionerEnabled !== false;
  const allowAnyPractitioner = clinic?.allowAnyPractitioner !== false;
  const requiresPhoneVerification = Boolean(clinic?.requirePhoneVerification);
  const defaultOnlineBookingService = useMemo(
    () =>
      clinic?.defaultOnlineBookingServiceId
        ? availableServices.find((service) => service.id === clinic.defaultOnlineBookingServiceId)
        : undefined,
    [availableServices, clinic?.defaultOnlineBookingServiceId],
  );
  const flowSteps = useMemo(
    () =>
      bookingSteps({
        includeLocation: hasMultipleLocations,
        includeService: bookByServiceEnabled,
        includePractitioner: bookByPractitionerEnabled,
        includeVerification: requiresPhoneVerification,
      }),
    [bookByPractitionerEnabled, bookByServiceEnabled, hasMultipleLocations, requiresPhoneVerification],
  );
  const currentStepIndex = flowSteps.findIndex((item) => item.id === step);
  const hasPreviousStep = currentStepIndex > 0;

  useEffect(() => {
    let cancelled = false;

    if (initialClinic) {
      setClinic(initialClinic);
      setServices(initialServices);
      setInitialLoaded(true);
      return () => {
        cancelled = true;
      };
    }

    setInitialLoaded(false);
    void Promise.all([
      corePublic<BookingClinic>(`/clinics/${clinicSlug}`),
      corePublic<BookingService[]>(`/clinics/${clinicSlug}/services`),
    ])
      .then(([clinicPayload, servicesPayload]) => {
        if (cancelled) return;
        setClinic(clinicPayload);
        setServices(servicesPayload);
      })
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setInitialLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [clinicSlug, initialClinic, initialServices]);

  useEffect(() => {
    if (!initialLoaded || !clinic) return;

    if (activeLocations.length === 1 && !locationId) {
      setLocationId(activeLocations[0].id);
      return;
    }

    if (activeLocations.length > 1 && (!locationId || !activeLocations.some((location) => location.id === locationId))) {
      setStep('location');
      setLocationId('');
    }
  }, [activeLocations, clinic, initialLoaded, locationId]);

  useEffect(() => {
    if (
      step !== 'verification' ||
      !patient.phoneNumber ||
      verificationId ||
      verifiedToken ||
      autoStartedVerificationForPhone.current === patient.phoneNumber
    ) {
      return;
    }

    autoStartedVerificationForPhone.current = patient.phoneNumber;
    void startVerification();
  }, [patient.phoneNumber, step, verificationId, verifiedToken]);

  useEffect(() => {
    if (step !== 'verification' || resendCooldown <= 0 || verifiedToken) return undefined;
    const timeoutId = window.setTimeout(() => {
      setResendCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timeoutId);
  }, [resendCooldown, step, verifiedToken]);

  const getMaxBookableDayOffset = useCallback((nextEmployeeId = '') => {
    const clinicMax = Math.max(0, clinic?.maxBookingDaysAhead ?? 30);
    if (!nextEmployeeId) return clinicMax;

    const rollingAvailabilityDays = practitioners.find((practitioner) => practitioner.id === nextEmployeeId)?.rollingAvailabilityDays;
    if (rollingAvailabilityDays == null || rollingAvailabilityDays < 0) return clinicMax;

    return Math.min(clinicMax, rollingAvailabilityDays);
  }, [clinic?.maxBookingDaysAhead, practitioners]);

  const loadSlots = useCallback(async (nextServiceId: string, nextEmployeeId = '', nextDayOffset = 0, nextLocationId = locationId) => {
    const maxBookableDayOffset = getMaxBookableDayOffset(nextEmployeeId);
    if (!nextServiceId || !nextLocationId || nextDayOffset > maxBookableDayOffset) return;

    const endOffset = Math.min(nextDayOffset + visibleDayCount - 1, maxBookableDayOffset);
    setLoadingSlots(true);
    try {
      const from = dateKeyFromOffset(nextDayOffset);
      const to = dateKeyFromOffset(endOffset);
      const query = new URLSearchParams({ serviceId: nextServiceId, from, to });
      query.set('locationId', nextLocationId);
      if (nextEmployeeId) query.set('employeeId', nextEmployeeId);
      const nextSlots = await corePublic<Slot[]>(`/clinics/${clinicSlug}/availability?${query}`);
      setSlots((current) => mergeSlots(current, nextSlots));
      setLoadedThroughOffset((current) => Math.max(current, endOffset));
    } finally {
      setLoadingSlots(false);
    }
  }, [clinicSlug, getMaxBookableDayOffset, locationId]);

  useEffect(() => {
    if (
      !initialLoaded ||
      !clinic?.onlineBookingEnabled ||
      bookByServiceEnabled ||
      serviceId ||
      !defaultOnlineBookingService ||
      (hasMultipleLocations && !locationId)
    ) {
      return;
    }

    void chooseService(defaultOnlineBookingService);
  }, [bookByServiceEnabled, clinic?.onlineBookingEnabled, defaultOnlineBookingService, hasMultipleLocations, initialLoaded, locationId, serviceId]);

  function chooseLocation(nextLocation: BookingLocation) {
    setLocationId(nextLocation.id);
    setServiceId('');
    setEmployeeId('');
    setSlot(null);
    setSlots([]);
    setLoadedThroughOffset(-1);
    setPractitioners([]);
    setDayOffset(0);
    setVisibleRows(4);
    setStep(bookByServiceEnabled ? 'service' : bookByPractitionerEnabled ? 'practitioner' : 'time');
  }

  async function chooseService(nextService: BookingService) {
    if (hasMultipleLocations && !locationId) {
      setStep('location');
      return;
    }

    setServiceId(nextService.id);
    setEmployeeId('');
    setSlot(null);
    setSlots([]);
    setLoadedThroughOffset(-1);
    setPractitioners([]);
    setDayOffset(0);
    setVisibleRows(4);
    if (!bookByPractitionerEnabled) {
      setStep('time');
      await loadSlots(nextService.id, '', 0);
      return;
    }

    setStep('practitioner');
    setLoadingPractitioners(true);
    try {
      const query = new URLSearchParams({ serviceId: nextService.id });
      if (locationId) query.set('locationId', locationId);
      setPractitioners(await corePublic<Practitioner[]>(`/clinics/${clinicSlug}/practitioners?${query}`));
    } finally {
      setLoadingPractitioners(false);
    }
  }

  async function choosePractitioner(nextEmployeeId: string) {
    setEmployeeId(nextEmployeeId);
    setSlot(null);
    setDayOffset(0);
    setVisibleRows(4);
    setLoadedThroughOffset(-1);
    setStep('time');
    await loadSlots(serviceId, nextEmployeeId, 0);
  }

  async function goToPreviousDays() {
    const nextOffset = Math.max(0, dayOffset - visibleDayCount);
    setDayOffset(nextOffset);
    setVisibleRows(4);
  }

  async function goToNextDays() {
    const nextOffset = dayOffset + visibleDayCount;
    const maxBookableDayOffset = getMaxBookableDayOffset(employeeId);
    if (nextOffset > maxBookableDayOffset) return;

    setDayOffset(nextOffset);
    setVisibleRows(4);
    if (nextOffset + visibleDayCount - 1 > loadedThroughOffset) {
      await loadSlots(serviceId, employeeId, nextOffset);
    }
  }

  function chooseSlot(nextSlot: Slot) {
    setSlot(nextSlot);
    setStep('details');
  }

  function goBack() {
    if (!hasPreviousStep) return;
    setStep(flowSteps[currentStepIndex - 1].id);
  }

  function updatePatientField(field: keyof typeof patient, value: string) {
    if (field === 'phoneNumber' && value !== patient.phoneNumber) {
      setVerificationId('');
      setCode('');
      setVerifiedToken('');
      setVerificationMessage('');
      setVerificationMessageType('success');
      setResendCooldown(60);
      autoStartedVerificationForPhone.current = '';
    }
    setPatient({ ...patient, [field]: value });
  }

  function setVisitAddressField(field: keyof typeof visitAddress, value: string) {
    setVisitAddress((current) => ({ ...current, [field]: value }));
  }

  function verificationErrorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : '';
    switch (message) {
      case 'VERIFICATION_EXPIRED':
        return 'This verification code has expired.';
      case 'INVALID_CODE':
        return 'The verification code is incorrect. Please try again.';
      case 'TOO_MANY_ATTEMPTS':
        return 'Too many verification attempts. Please resend a new code.';
      case 'INVALID_VERIFICATION':
        return 'This verification code is no longer valid. Please resend a new code.';
      case 'PHONE_RATE_LIMITED':
        return 'Too many verification codes were requested for this phone number. Please try again later.';
      case 'IP_RATE_LIMITED':
        return 'Too many verification code requests were made. Please try again later.';
      default:
        return message || 'Unable to verify the code. Please try again.';
    }
  }

  function shouldAllowImmediateResend(error: unknown) {
    const message = error instanceof Error ? error.message : '';
    return ['VERIFICATION_EXPIRED', 'TOO_MANY_ATTEMPTS', 'INVALID_VERIFICATION'].includes(message);
  }

  function continueFromDetails() {
    if (clinic?.requirePhoneVerification) {
      setStep('verification');
      return;
    }
    void confirmBooking();
  }

  async function startVerification(showSuccessMessage = false) {
    setBusy(true);
    setVerificationMessage('');
    setVerificationMessageType('success');
    try {
      const response = await corePublic<{ verificationId: string }>(`/clinics/${clinicSlug}/phone-verifications`, {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: patient.phoneNumber }),
      });
      setVerificationId(response.verificationId);
      setCode('');
      setVerifiedToken('');
      setResendCooldown(60);
      if (showSuccessMessage) {
        setVerificationMessageType('success');
        setVerificationMessage('A new verification code was sent.');
      }
    } catch (error) {
      setResendCooldown(0);
      setVerificationMessageType('error');
      setVerificationMessage(verificationErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    if (resendCooldown > 0 || resendStatus === 'submitting') return;
    setResendStatus('submitting');
    try {
      await startVerification(true);
    } finally {
      setResendStatus('idle');
    }
  }

  async function verifyCode() {
    const response = await corePublic<{ verifiedToken: string }>(`/clinics/${clinicSlug}/phone-verifications/confirm`, {
      method: 'POST',
      body: JSON.stringify({ verificationId, code }),
    });
    setVerifiedToken(response.verifiedToken);
    return response.verifiedToken;
  }

  async function confirmBooking(phoneVerificationToken = verifiedToken) {
    if (!slot) return;
    setBusy(true);
    try {
      const response = await corePublic<{ manageUrl: string }>(`/clinics/${clinicSlug}/appointments`, {
        method: 'POST',
        body: JSON.stringify({
          serviceId,
          locationId: locationId || slot.locationId || null,
          employeeId: employeeId || null,
          startAt: slot.startAt,
          patient,
          additionalBookingAnswer: answer || null,
          marketingEmailOptIn,
          marketingEmailConsentText: clinic?.marketingEmailOptInPrompt ?? null,
          phoneVerificationToken: phoneVerificationToken || null,
          visit: isHomeVisit ? {
            addressLine1: visitAddress.addressLine1 || null,
            addressLine2: visitAddress.addressLine2 || null,
            city: visitAddress.city || null,
            stateOrRegion: visitAddress.stateOrRegion || null,
            postalCode: visitAddress.postalCode || null,
            countryCode: visitAddress.countryCode || null,
            notes: visitAddress.notes || null,
          } : null,
        }),
      });
      setSuccess(response);
    } finally {
      setBusy(false);
    }
  }

  async function confirmVerifiedBooking() {
    if (!slot || !detailsComplete || (!verifiedToken && (!verificationId || code.length !== 4))) return;
    setBusy(true);
    setVerificationMessage('');
    setVerificationMessageType('success');
    try {
      const phoneVerificationToken = verifiedToken || await verifyCode();
      await confirmBooking(phoneVerificationToken);
    } catch (error) {
      if (shouldAllowImmediateResend(error)) {
        setResendCooldown(0);
      }
      setVerificationMessageType('error');
      setVerificationMessage(verificationErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (!clinic || !initialLoaded) return <Shell title="Loading" />;
  const clinicBranding = { logo: clinic.logo, primaryColor: clinic.primaryColor };
  if (!clinic.onlineBookingEnabled) {
    return <Shell title={clinic.name} description="Online booking is not currently available. Please contact the clinic." {...clinicBranding} />;
  }
  if (!bookByServiceEnabled && !defaultOnlineBookingService) {
    return <Shell title={clinic.name} description="Online booking is not fully configured. Please contact the clinic." {...clinicBranding} />;
  }
  if (!bookByServiceEnabled && !serviceId && !(hasMultipleLocations && !locationId)) {
    return <Shell title={clinic.name} description="Loading availability..." {...clinicBranding} />;
  }
  if (success) {
    return (
      <Shell title="Appointment confirmed" description="Your confirmation was sent by SMS." {...clinicBranding}>
        <BookingSummary
          location={selectedLocation}
          service={selectedService}
          practitionerName={employeeId ? slot?.employeeName : undefined}
          anyPractitioner={!employeeId}
          showLocation={hasMultipleLocations || Boolean(selectedLocation)}
          showService={bookByServiceEnabled}
          showPractitioner={bookByPractitionerEnabled}
          slot={slot ?? undefined}
          dateTimeSettings={dateTimeSettings}
        />
        <a className="button" href={success.manageUrl}>Manage appointment</a>
      </Shell>
    );
  }

  const isHomeVisit = selectedLocation?.type === 'HOME_VISIT';
  const visitAddressComplete = !isHomeVisit || Boolean(visitAddress.addressLine1 && visitAddress.city && visitAddress.countryCode);
  const detailsComplete = Boolean(patient.firstName && patient.lastName && patient.phoneNumber && visitAddressComplete);

  return (
    <Shell
      title={clinic.name}
      description={clinic.description || 'Book your appointment in a few steps.'}
      phone={clinic.phone}
      email={clinic.email}
      {...clinicBranding}
    >
      <WizardProgress current={step} steps={flowSteps} />
      {hasPreviousStep ? (
        <button className="back-button" type="button" onClick={goBack}>
          <ArrowLeft aria-hidden="true" size={16} strokeWidth={2.25} />
          Back
        </button>
      ) : null}

      {hasMultipleLocations && step === 'location' ? (
        <section className="wizard-step">
          <h2>Choose a location</h2>
          <div className="selection-list">
            {activeLocations.map((location) => (
              <button key={location.id} className="selection-row practitioner-row" type="button" onClick={() => chooseLocation(location)}>
                <Avatar icon={<MapPin aria-hidden="true" size={17} strokeWidth={2.2} />} />
                <span>
                  <span className="selection-title">{locationDisplayName(location)}</span>
                  <span className="selection-subtitle">{formatLocationAddress(location) || location.notes || 'Clinic location'}</span>
                  {location.notes ? <span className="selection-subtitle">{location.notes}</span> : null}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {bookByServiceEnabled && step === 'service' ? (
        <section className="wizard-step">
          <h2>Choose a service</h2>
          <div className="selection-list">
            {availableServices.length === 0 ? <p className="muted">No services are available for this location.</p> : null}
            {availableServices.map((service) => (
              <button key={service.id} className="selection-row service-row" type="button" onClick={() => void chooseService(service)}>
                <span className="selection-title">{service.name}</span>
                <span className="selection-subtitle">{service.durationMinutes} minutes</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {bookByPractitionerEnabled && step === 'practitioner' ? (
        <section className="wizard-step">
          <h2>Choose a practitioner</h2>
          <div className="selection-list">
            {allowAnyPractitioner ? (
              <button className="selection-row practitioner-row" type="button" onClick={() => void choosePractitioner('')}>
                <Avatar icon={<Users aria-hidden="true" size={17} strokeWidth={2.2} />} />
                <span>
                  <span className="selection-title">I don&apos;t have a preference</span>
                  <span className="selection-subtitle">View availability for all practitioners</span>
                </span>
              </button>
            ) : null}
            {loadingPractitioners ? <p className="muted list-note">Loading practitioners...</p> : null}
            {!loadingPractitioners && !allowAnyPractitioner && practitioners.length === 0 ? (
              <p className="muted list-note">No practitioners are available for online booking.</p>
            ) : null}
            {!loadingPractitioners && practitioners.map((practitioner) => (
              <button key={practitioner.id} className="selection-row practitioner-row" type="button" onClick={() => void choosePractitioner(practitioner.id)}>
                <Avatar initials={initialsFor(practitioner.displayName)} />
                <span>
                  <span className="selection-title">{practitioner.displayName}</span>
                  <span className="selection-subtitle">{selectedService?.name ?? 'Practitioner'}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {step === 'time' ? (
        <section className="wizard-step">
          <h2>Choose a date and time</h2>
          <BookingSummary
            location={selectedLocation}
            service={selectedService}
            practitionerName={selectedPractitioner?.displayName}
            anyPractitioner={!employeeId}
            showLocation={hasMultipleLocations || Boolean(selectedLocation)}
            showService={bookByServiceEnabled}
            showPractitioner={bookByPractitionerEnabled}
            dateTimeSettings={dateTimeSettings}
          />
          <AvailabilityGrid
            dateTimeSettings={dateTimeSettings}
            dayOffset={dayOffset}
            loading={loadingSlots}
            maxBookableDayOffset={getMaxBookableDayOffset(employeeId)}
            slots={slots}
            visibleRows={visibleRows}
            onPreviousDays={() => void goToPreviousDays()}
            onNextDays={() => void goToNextDays()}
            onMoreRows={() => setVisibleRows(Number.MAX_SAFE_INTEGER)}
            onSelectSlot={chooseSlot}
          />
        </section>
      ) : null}

      {step === 'details' && slot ? (
        <section className="wizard-step">
          <h2>Your information</h2>
          <BookingSummary
            location={selectedLocation}
            service={selectedService}
            practitionerName={employeeId ? slot.employeeName : undefined}
            anyPractitioner={!employeeId}
            showLocation={hasMultipleLocations || Boolean(selectedLocation)}
            showService={bookByServiceEnabled}
            showPractitioner={bookByPractitionerEnabled}
            slot={slot}
            dateTimeSettings={dateTimeSettings}
          />
          <div className="form card booking-form">
            <div className="form-row">
              <label>First name<input value={patient.firstName} onChange={(e) => updatePatientField('firstName', e.target.value)} /></label>
              <label>Last name<input value={patient.lastName} onChange={(e) => updatePatientField('lastName', e.target.value)} /></label>
            </div>
            <PhoneField value={patient.phoneNumber} onChange={(value) => updatePatientField('phoneNumber', value)} />
            <label>Email optional<input value={patient.email} onChange={(e) => updatePatientField('email', e.target.value)} /></label>
            {isHomeVisit ? (
              <div className="home-visit-fields">
                <h3>Visit address</h3>
                <label>Address line 1<input value={visitAddress.addressLine1} onChange={(e) => setVisitAddressField('addressLine1', e.target.value)} /></label>
                <label>Address line 2 optional<input value={visitAddress.addressLine2} onChange={(e) => setVisitAddressField('addressLine2', e.target.value)} /></label>
                <div className="form-row">
                  <label>City<input value={visitAddress.city} onChange={(e) => setVisitAddressField('city', e.target.value)} /></label>
                  <label>Province/State/Region<input value={visitAddress.stateOrRegion} onChange={(e) => setVisitAddressField('stateOrRegion', e.target.value)} /></label>
                </div>
                <div className="form-row">
                  <label>Postal code<input value={visitAddress.postalCode} onChange={(e) => setVisitAddressField('postalCode', e.target.value)} /></label>
                  <label>Country code<input value={visitAddress.countryCode} onChange={(e) => setVisitAddressField('countryCode', e.target.value.toUpperCase().slice(0, 2))} /></label>
                </div>
                <label>Notes optional<textarea value={visitAddress.notes} onChange={(e) => setVisitAddressField('notes', e.target.value)} /></label>
              </div>
            ) : null}
            {clinic.additionalBookingQuestionEnabled ? <label>{clinic.additionalBookingQuestionPrompt || 'Reason for visit'}<textarea value={answer} onChange={(e) => setAnswer(e.target.value)} /></label> : null}
            {clinic.marketingEmailOptInPrompt ? <label><span><input type="checkbox" checked={marketingEmailOptIn} onChange={(e) => setMarketingEmailOptIn(e.target.checked)} /> {clinic.marketingEmailOptInPrompt}</span></label> : null}
            <button disabled={busy || !detailsComplete} onClick={continueFromDetails}>{requiresPhoneVerification ? 'Continue' : 'Confirm appointment'}</button>
          </div>
        </section>
      ) : null}

      {step === 'verification' && slot ? (
        <section className="wizard-step">
          <h2>Verify your phone</h2>
          <BookingSummary
            location={selectedLocation}
            service={selectedService}
            practitionerName={employeeId ? slot.employeeName : undefined}
            anyPractitioner={!employeeId}
            showLocation={hasMultipleLocations || Boolean(selectedLocation)}
            showService={bookByServiceEnabled}
            showPractitioner={bookByPractitionerEnabled}
            slot={slot}
            dateTimeSettings={dateTimeSettings}
          />
          <div className="form card booking-form">
            {verificationMessage ? <p className={`verification-message ${verificationMessageType}`}>{verificationMessage}</p> : null}
            <p className="verification-note">Enter the 4-digit verification code sent to {patient.phoneNumber}.</p>
            <div className="actions">
              <input
                inputMode="numeric"
                maxLength={4}
                placeholder="4-digit code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 4));
                  setVerificationMessage('');
                }}
              />
            </div>
            <button disabled={busy || !detailsComplete || (!verifiedToken && (!verificationId || code.length !== 4))} onClick={confirmVerifiedBooking}>Confirm appointment</button>
            <button type="button" className="secondary" disabled={busy || resendCooldown > 0 || resendStatus === 'submitting'} onClick={resendVerification}>
              {resendStatus === 'submitting'
                ? 'Sending...'
                : resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : 'Resend code'}
            </button>
          </div>
        </section>
      ) : null}
    </Shell>
  );
}

function Shell({
  title,
  description,
  phone,
  email,
  logo,
  primaryColor,
  children,
}: {
  title: string;
  description?: string;
  phone?: string | null;
  email?: string | null;
  logo?: string | null;
  primaryColor?: string | null;
  children?: React.ReactNode;
}) {
  const brandStyle = brandVariables(primaryColor);

  return (
    <main className="shell booking-shell" style={brandStyle}>
      <section className="panel booking-panel">
        <div className="hero booking-hero">
          {logo ? (
            <div className="booking-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="Clinic logo" />
            </div>
          ) : (
            <h1>{title}</h1>
          )}
          <p className="eyebrow">Online booking</p>
          {description ? <p>{description}</p> : null}
          {phone || email ? (
            <div className="clinic-contact-links">
              {phone ? (
                <a className="clinic-contact-link" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
                  Call clinic: {phone}
                </a>
              ) : null}
              {email ? (
                <a className="clinic-contact-link" href={`mailto:${email}`}>
                  Email clinic: {email}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
        {children ? <div className="content booking-content">{children}</div> : null}
      </section>
    </main>
  );
}

function WizardProgress({ current, steps }: { current: Step; steps: Array<{ id: Step; label: string }> }) {
  const currentIndex = steps.findIndex((item) => item.id === current);

  return (
    <ol className="wizard-progress" aria-label="Booking steps">
      {steps.map((item, index) => (
        <li key={item.id} className={index <= currentIndex ? 'complete' : ''}>
          <span>{index + 1}</span>
          {item.label}
        </li>
      ))}
    </ol>
  );
}

function bookingSteps({
  includeLocation,
  includeService,
  includePractitioner,
  includeVerification,
}: {
  includeLocation: boolean;
  includeService: boolean;
  includePractitioner: boolean;
  includeVerification: boolean;
}): Array<{ id: Step; label: string }> {
  return [
    ...(includeLocation ? [{ id: 'location' as const, label: 'Location' }] : []),
    ...(includeService ? [{ id: 'service' as const, label: 'Service' }] : []),
    ...(includePractitioner ? [{ id: 'practitioner' as const, label: 'Practitioner' }] : []),
    { id: 'time', label: 'Time' },
    { id: 'details', label: 'Details' },
    ...(includeVerification ? [{ id: 'verification' as const, label: 'Verify' }] : []),
  ];
}

function Avatar({ initials, icon }: { initials?: string; icon?: React.ReactNode }) {
  return <span className="avatar" aria-hidden="true">{icon ?? initials}</span>;
}

function PhoneField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label>
      Phone
      <PhoneInput
        defaultCountry="ca"
        value={value}
        onChange={onChange}
        inputProps={{
          id: 'phoneNumber',
          name: 'phoneNumber',
          dir: 'ltr',
          required: true,
        }}
        className="field-phone"
        countrySelectorStyleProps={{
          buttonClassName: 'field-phone-country',
        }}
        inputClassName="field-phone-input"
      />
    </label>
  );
}

function BookingSummary({
  location,
  service,
  practitionerName,
  anyPractitioner,
  showLocation = false,
  showService = true,
  showPractitioner = true,
  slot,
  dateTimeSettings,
}: {
  location?: BookingLocation;
  service?: BookingService;
  practitionerName?: string;
  anyPractitioner?: boolean;
  showLocation?: boolean;
  showService?: boolean;
  showPractitioner?: boolean;
  slot?: Slot;
  dateTimeSettings?: DateTimeSettings;
}) {
  const items = [
    showLocation && location ? locationDisplayName(location) : null,
    showService && service ? service.name : null,
    showPractitioner && anyPractitioner ? 'Any available practitioner' : null,
    showPractitioner && practitionerName ? practitionerName : null,
    slot ? formatClinicDateTime(slot.startAt, dateTimeSettings) : null,
  ].filter(Boolean);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="booking-summary">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

function locationDisplayName(location: BookingLocation) {
  return location.publicDisplayName?.trim() || location.name?.trim() || 'Clinic location';
}

function deliveryModeForLocation(location?: BookingLocation): ServiceDeliveryMode {
  switch (location?.type) {
    case 'VIRTUAL':
      return 'VIRTUAL';
    case 'HOME_VISIT':
      return 'HOME_VISIT';
    default:
      return 'IN_PERSON';
  }
}

function serviceSupportsDeliveryMode(service: BookingService, mode: ServiceDeliveryMode) {
  const deliveryModes = Array.isArray(service.deliveryModes) && service.deliveryModes.length > 0
    ? service.deliveryModes
    : ['IN_PERSON'];
  return deliveryModes.includes(mode);
}

function formatLocationAddress(location?: BookingLocation) {
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

function AvailabilityGrid({
  dateTimeSettings,
  dayOffset,
  loading,
  maxBookableDayOffset,
  slots,
  visibleRows,
  onPreviousDays,
  onNextDays,
  onMoreRows,
  onSelectSlot,
}: {
  dateTimeSettings?: DateTimeSettings;
  dayOffset: number;
  loading: boolean;
  maxBookableDayOffset: number;
  slots: Slot[];
  visibleRows: number;
  onPreviousDays: () => void;
  onNextDays: () => void;
  onMoreRows: () => void;
  onSelectSlot: (slot: Slot) => void;
}) {
  const days = useMemo(() => buildDays(dayOffset, maxBookableDayOffset, dateTimeSettings), [dateTimeSettings, dayOffset, maxBookableDayOffset]);
  const visibleDayKeys = useMemo(() => days.map((day) => day.key), [days]);
  const slotsByDayAndTime = useMemo(() => groupSlotsByDayAndTime(slots, visibleDayKeys), [slots, visibleDayKeys]);
  const timeRows = useMemo(() => visibleTimeRows(slotsByDayAndTime), [slotsByDayAndTime]);
  const renderedTimeRows = timeRows.slice(0, visibleRows);
  const hasMoreRows = visibleRows < timeRows.length;
  const canGoNext = dayOffset + visibleDayCount <= maxBookableDayOffset;

  return (
    <div className="availability-wrap">
      <div className="availability-grid" style={{ '--day-count': days.length } as React.CSSProperties}>
        <button className="day-nav" type="button" onClick={onPreviousDays} disabled={dayOffset === 0} aria-label="Previous days">‹</button>
        {days.map((day) => (
          <div key={day.key} className="day-heading">
            <strong>{day.weekday}</strong>
            <span>{day.label}</span>
          </div>
        ))}
        <button className="day-nav" type="button" onClick={onNextDays} disabled={!canGoNext || loading} aria-label="Next days">›</button>

        {renderedTimeRows.map((timeKey) => (
          <div key={timeKey} className="time-row">
            <span className="row-gutter" aria-hidden="true" />
            {days.map((day) => {
              const daySlot = slotsByDayAndTime[day.key]?.[timeKey];
              return daySlot ? (
                <button key={`${day.key}-${daySlot.employeeId}-${daySlot.startAt}`} className="time-slot" type="button" onClick={() => onSelectSlot(daySlot)}>
                  {formatClinicTime(daySlot.startAt, dateTimeSettings)}
                </button>
              ) : <span key={day.key} className="empty-slot">–</span>;
            })}
            <span className="row-gutter" aria-hidden="true" />
          </div>
        ))}
      </div>
      {loading ? <p className="muted availability-note">Loading available times...</p> : null}
      {!loading && timeRows.length === 0 ? <p className="muted availability-note">No times are available for this week.</p> : null}
      {!loading && hasMoreRows ? <button className="more-slots" type="button" onClick={onMoreRows}>View more times</button> : null}
    </div>
  );
}

function buildDays(dayOffset: number, maxBookableDayOffset: number, dateTimeSettings?: DateTimeSettings) {
  const dayCount = Math.max(0, Math.min(visibleDayCount, maxBookableDayOffset - dayOffset + 1));
  return Array.from({ length: dayCount }).map((_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + dayOffset + index);
    return {
      key: toDateKey(date),
      weekday: weekdayFormatter.format(date),
      label: formatClinicDate(`${toDateKey(date)}T00:00:00`, dateTimeSettings),
    };
  });
}

function brandVariables(primaryColor?: string | null): React.CSSProperties | undefined {
  if (!primaryColor || !/^#[0-9a-fA-F]{6}$/.test(primaryColor)) {
    return undefined;
  }

  const rgb = [
    Number.parseInt(primaryColor.slice(1, 3), 16),
    Number.parseInt(primaryColor.slice(3, 5), 16),
    Number.parseInt(primaryColor.slice(5, 7), 16),
  ].join(', ');

  return {
    '--brand': primaryColor,
    '--brand-rgb': rgb,
    '--brand-strong': shade(primaryColor, -14),
    '--brand-dark': shade(primaryColor, -32),
    '--brand-soft': mix(primaryColor, '#ffffff', 88),
  } as React.CSSProperties;
}

function shade(hex: string, percent: number) {
  const amount = Math.round((percent / 100) * 255);
  const r = clamp(Number.parseInt(hex.slice(1, 3), 16) + amount);
  const g = clamp(Number.parseInt(hex.slice(3, 5), 16) + amount);
  const b = clamp(Number.parseInt(hex.slice(5, 7), 16) + amount);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mix(from: string, to: string, weightTo: number) {
  const weight = weightTo / 100;
  const r = Math.round(Number.parseInt(from.slice(1, 3), 16) * (1 - weight) + Number.parseInt(to.slice(1, 3), 16) * weight);
  const g = Math.round(Number.parseInt(from.slice(3, 5), 16) * (1 - weight) + Number.parseInt(to.slice(3, 5), 16) * weight);
  const b = Math.round(Number.parseInt(from.slice(5, 7), 16) * (1 - weight) + Number.parseInt(to.slice(5, 7), 16) * weight);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function clamp(value: number) {
  return Math.max(0, Math.min(255, value));
}

function toHex(value: number) {
  return value.toString(16).padStart(2, '0');
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
  return `${slot.serviceId}|${slot.employeeId}|${slot.startAt}|${slot.endAt}`;
}

function groupSlotsByDayAndTime(slots: Slot[], visibleDayKeys: string[]) {
  const visibleDays = new Set(visibleDayKeys);
  return slots.reduce<Record<string, Record<string, Slot>>>((acc, nextSlot) => {
    const key = toDateKey(new Date(nextSlot.startAt));
    if (!visibleDays.has(key)) return acc;
    const timeKey = toTimeKey(nextSlot.startAt);
    acc[key] = acc[key] ?? {};
    acc[key][timeKey] = acc[key][timeKey] ?? nextSlot;
    return acc;
  }, {});
}

function visibleTimeRows(slotsByDayAndTime: Record<string, Record<string, Slot>>) {
  return Array.from(
    new Set(Object.values(slotsByDayAndTime).flatMap((slotsByTime) => Object.keys(slotsByTime))),
  ).sort();
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function toTimeKey(value: string) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'DR';
}
