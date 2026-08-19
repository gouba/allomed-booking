'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
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
  X,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import type {
  CareBootstrapDTO,
  CareConsentSummaryDTO,
  CareDocumentDTO,
  CareFormSummaryDTO,
  CareOverviewDTO,
  AvailabilitySlotResponseDTO,
  ManagedAppointmentResponseDTO,
  PublicConsentDTO,
  PublicFormDTO,
} from '@allomed-api/core-service-public-api';
import { ContentLoader } from '@/components/common/content-loader';
import { corePublic } from '@/lib/api';
import {
  formatClinicDate,
  formatClinicDateTime,
  formatClinicTime,
} from '@/lib/date-time-format';

export type CareView =
  'overview' | 'appointments' | 'forms' | 'consents' | 'documents' | 'payments';

type NavItem = {
  view: CareView;
  label: string;
  icon: ReactNode;
  enabled?: boolean;
  badgeCount?: number;
};
type LocalizedText = string | Record<string, string | undefined> | undefined;
type Option = { id: string; label?: LocalizedText; isOther?: boolean };
type Field = {
  id: string;
  type: string;
  label?: LocalizedText;
  description?: LocalizedText;
  content?: string;
  required?: boolean;
  options?: Option[];
};
type ColumnsNode = {
  id: string;
  type: 'COLUMNS';
  ratios?: number[];
  children?: Field[];
};
type SchemaNode = Field | ColumnsNode;
type Section = {
  id: string;
  label?: LocalizedText;
  title?: LocalizedText;
  description?: LocalizedText;
  fields: SchemaNode[];
};
type ClinicalSchema = { sections: Section[] };
type ConsentBlockType =
  | 'COLUMNS'
  | 'HEADING'
  | 'PARAGRAPH'
  | 'RICH_TEXT'
  | 'DIVIDER'
  | 'ACKNOWLEDGEMENT'
  | 'SIGNATURE';
type ConsentBlock = {
  id: string;
  type: ConsentBlockType;
  label: string;
  content?: string;
  required?: boolean;
  ratios?: number[];
  children?: ConsentBlock[];
};
type ConsentSection = {
  id: string;
  title: string;
  description?: string;
  blocks: ConsentBlock[];
};
type ConsentDocument = { sections: ConsentSection[] };
type Answers = Record<string, unknown>;
type FieldErrors = Record<string, string>;
type SignaturePoint = { x: number; y: number };
type SignatureStroke = { points: SignaturePoint[] };
type SignatureDrawingData = { strokes: SignatureStroke[] };
type SignatureAnswer = {
  method: 'DRAWN' | 'TYPED';
  typedName?: string;
  drawing?: SignatureDrawingData;
  signedAt?: string;
};
const DEFAULT_INFORMATION_TEXT = 'Information text';
type CareFormListItem = CareFormSummaryDTO & {
  closedReason?: string;
  completedAt?: string;
  formName?: string;
  name?: string;
  submittedAt?: string;
  responseSubmittedAt?: string;
  templateName?: string;
  templateTitle?: string;
};
type CareFormTitleSource = Pick<
  CareFormListItem,
  'title' | 'name' | 'formName' | 'templateTitle' | 'templateName'
>;
type PublicFormWithAnswers = PublicFormDTO & {
  submission?: {
    answers?: Answers;
  };
};
type ConsentSignatureSnapshot = {
  signature?: unknown;
  signatures?: Record<string, unknown>;
  acknowledgements?: Record<string, unknown>;
  signedAt?: string;
  typedSignature?: string;
};
type PublicConsentWithSignature = PublicConsentDTO & {
  signature?: ConsentSignatureSnapshot;
};
type PatientFormState =
  | { group: 'toComplete'; labelKey: 'completeForm'; actionable: true }
  | { group: 'inProgress'; labelKey: 'continueForm'; actionable: true }
  | {
      group: 'completed';
      labelKey: 'viewCompletedForm';
      actionable: true;
      completedAt?: string;
    }
  | { group: 'expired'; labelKey: 'expired'; actionable: false }
  | { group: 'withdrawn'; labelKey: 'withdrawnByClinic'; actionable: false }
  | {
      group: 'noLongerAvailable';
      labelKey: 'noLongerAvailable';
      actionable: false;
    }
  | { group: 'hidden'; labelKey: 'noLongerAvailable'; actionable: false };
type PendingTask = {
  id: string;
  view: 'forms' | 'consents';
  typeLabel: string;
  title: string;
  actionLabel: string;
  context?: string;
  appointmentId?: string;
  orderAt?: string;
};
type CareNavigationMode = 'push' | 'replace';
type CareAction = 'reschedule';
type CareNavigationOptions = {
  action?: CareAction;
  mode?: CareNavigationMode;
};

const pendingFormStatuses = new Set([
  'ASSIGNED',
  'SENT',
  'OPENED',
  'IN_PROGRESS',
]);
const pendingConsentStatuses = new Set(['REQUESTED', 'SENT', 'OPENED']);
const completedConsentStatuses = new Set(['SIGNED', 'REVIEWED']);
const expiredConsentStatuses = new Set(['EXPIRED']);
const hiddenConsentStatuses = new Set(['CANCELLED']);
const withdrawnConsentStatuses = new Set(['WITHDRAWN', 'CANCELLED', 'REVOKED']);
const formToCompleteStatuses = new Set(['ASSIGNED', 'SENT', 'OPENED']);
const formInProgressStatuses = new Set(['IN_PROGRESS', 'DRAFT']);
const formCompletedStatuses = new Set(['SUBMITTED', 'REVIEWED', 'COMPLETED']);
const formExpiredStatuses = new Set(['EXPIRED']);
const formWithdrawnStatuses = new Set(['WITHDRAWN', 'CANCELLED', 'REVOKED']);
const formNoLongerAvailableStatuses = new Set(['SUPERSEDED', 'UNAVAILABLE']);
const INITIAL_RESCHEDULE_DAY_COUNT = 7;
const RESCHEDULE_DAY_LOAD_COUNT = 7;
const MAX_RESCHEDULE_DAY_COUNT = 14;

type ItemsResponse<T> = T[] | { items?: T[] };

type CareCopyKey =
  | 'appointments'
  | 'appointmentFallback'
  | 'appointmentStatusCancelled'
  | 'appointmentStatusCheckedIn'
  | 'appointmentStatusCompleted'
  | 'appointmentStatusConfirmed'
  | 'appointmentStatusNoShow'
  | 'appointmentStatusPendingConfirmation'
  | 'appointmentStatusPendingRescheduleConfirmation'
  | 'appointmentDetails'
  | 'actions'
  | 'address'
  | 'appointmentUnavailable'
  | 'backToAppointments'
  | 'backToAppointmentDetails'
  | 'backToConsents'
  | 'availableTimes'
  | 'carePageUnavailable'
  | 'carePageSections'
  | 'careSessionRequired'
  | 'careSessionExpired'
  | 'cancelAppointment'
  | 'cancelAppointmentClinicNotified'
  | 'cancelAppointmentConfirm'
  | 'cancelAppointmentDescription'
  | 'cancelAppointmentError'
  | 'cancelAppointmentSuccess'
  | 'cancelAppointmentTitle'
  | 'cancelNoLongerAllowed'
  | 'cancellingAppointment'
  | 'backToForms'
  | 'keepAppointment'
  | 'chooseAnotherTime'
  | 'chooseAnotherDate'
  | 'chooseAppointment'
  | 'completeForm'
  | 'completed'
  | 'completedOn'
  | 'confirmReschedule'
  | 'continue'
  | 'continueForm'
  | 'consent'
  | 'consentNoLongerAvailable'
  | 'consentSignedSuccess'
  | 'consents'
  | 'contactClinic'
  | 'currentTime'
  | 'currentAppointment'
  | 'documents'
  | 'dismissAppointmentMessage'
  | 'dismissFormMessage'
  | 'documentFallback'
  | 'dueDate'
  | 'duration'
  | 'durationMinutes'
  | 'forNextAppointment'
  | 'form'
  | 'formNoLongerAvailable'
  | 'forms'
  | 'formSubmitReviewDescription'
  | 'formSubmitTitle'
  | 'formSubmittedSuccess'
  | 'formSubmitError'
  | 'formSaveError'
  | 'formProgressSaved'
  | 'formSaving'
  | 'formRequiredField'
  | 'formSectionsProgress'
  | 'signature'
  | 'signatureDraw'
  | 'signatureType'
  | 'signatureClear'
  | 'signatureCanvasLabel'
  | 'signatureDrawPlaceholder'
  | 'signatureFullName'
  | 'signatureTypedStatement'
  | 'signaturePreviewLabel'
  | 'signed'
  | 'signatureSigned'
  | 'signatureSignedOnAt'
  | 'expired'
  | 'keepCurrentAppointment'
  | 'loadAppointmentsError'
  | 'loadingAppointment'
  | 'loadingAppointmentList'
  | 'loadingAvailableTimes'
  | 'loadingCarePage'
  | 'loadingConsent'
  | 'loadingConsentList'
  | 'loadingDocumentList'
  | 'loadingForm'
  | 'loadingFormList'
  | 'loadingOverview'
  | 'loadMoreAvailability'
  | 'location'
  | 'moreAvailability'
  | 'nextAppointment'
  | 'newTime'
  | 'needsSignature'
  | 'noAppointments'
  | 'noAvailableTimes'
  | 'noConsents'
  | 'noForms'
  | 'noOverviewDescription'
  | 'noOverviewTitle'
  | 'noLongerAvailable'
  | 'overview'
  | 'overviewError'
  | 'payments'
  | 'pastAppointments'
  | 'pendingConsentsCount'
  | 'pendingFormsCount'
  | 'pendingNavBadge'
  | 'practitioner'
  | 'previousSection'
  | 'recentDocuments'
  | 'rescheduleAppointment'
  | 'rescheduleAppointmentError'
  | 'rescheduleAppointmentSuccess'
  | 'rescheduleNoLongerAllowed'
  | 'rescheduleSlotUnavailable'
  | 'rescheduleUnavailable'
  | 'reviewAndSign'
  | 'reviewForm'
  | 'seeAllAppointments'
  | 'seeAllDocuments'
  | 'selectedTime'
  | 'signOut'
  | 'signedOrUnavailable'
  | 'submitForm'
  | 'saveProgress'
  | 'thingsToComplete'
  | 'toComplete'
  | 'inProgress'
  | 'viewCompletedForm'
  | 'withdrawnByClinic'
  | 'upcomingAppointments'
  | 'virtualAppointment'
  | 'withPractitioner'
  | 'yourClinic'
  | 'welcome';

const careCopy = {
  en: {
    appointments: 'Appointments',
    appointmentFallback: 'Appointment',
    appointmentStatusCancelled: 'Cancelled',
    appointmentStatusCheckedIn: 'Arrived',
    appointmentStatusCompleted: 'Completed',
    appointmentStatusConfirmed: 'Confirmed',
    appointmentStatusNoShow: 'No show',
    appointmentStatusPendingConfirmation: 'Pending confirmation',
    appointmentStatusPendingRescheduleConfirmation:
      'Pending reschedule confirmation',
    appointmentDetails: 'Appointment details',
    actions: 'Actions',
    address: 'Address',
    appointmentUnavailable: 'This appointment is no longer available.',
    backToAppointments: 'Back to appointments',
    backToAppointmentDetails: 'Back to appointment details',
    backToConsents: 'Back to consents',
    availableTimes: 'Available times',
    carePageUnavailable: 'Care Page unavailable',
    carePageSections: 'Care page sections',
    careSessionRequired: 'Care Page session required.',
    careSessionExpired:
      'Your secure Care Page session has expired. Please reopen your secure link.',
    cancelAppointment: 'Cancel appointment',
    cancelAppointmentClinicNotified:
      'The clinic will be notified of the cancellation.',
    cancelAppointmentConfirm: 'Cancel this appointment?',
    cancelAppointmentDescription:
      'Are you sure you want to cancel this appointment?',
    cancelAppointmentError:
      'We could not cancel the appointment. Please try again.',
    cancelAppointmentSuccess: 'Your appointment has been cancelled.',
    cancelAppointmentTitle: 'Cancel appointment?',
    cancelNoLongerAllowed: 'This appointment can no longer be cancelled.',
    cancellingAppointment: 'Cancelling...',
    backToForms: 'Back to forms',
    keepAppointment: 'Keep appointment',
    chooseAnotherTime: 'Choose another time',
    chooseAnotherDate: 'Choose another date',
    chooseAppointment:
      'Choose an appointment from the list to view its details.',
    completeForm: 'Complete form',
    completed: 'Completed',
    completedOn: 'Completed {date}',
    confirmReschedule: 'Confirm reschedule',
    continue: 'Continue',
    continueForm: 'Continue form',
    consent: 'Consent',
    consentNoLongerAvailable: 'This consent is no longer available.',
    consentSignedSuccess: 'Your consent has been signed',
    consents: 'Consents',
    contactClinic: 'Contact the clinic to request a new secure link.',
    currentTime: 'Current time',
    currentAppointment: 'Current appointment',
    documents: 'Documents',
    dismissAppointmentMessage: 'Dismiss appointment message',
    dismissFormMessage: 'Dismiss form message',
    documentFallback: 'Document',
    dueDate: 'Due {date}',
    duration: 'Duration',
    durationMinutes: '{count} minutes',
    forNextAppointment: 'For your next appointment',
    form: 'Form',
    formNoLongerAvailable: 'This form is no longer available.',
    forms: 'Forms',
    formSubmitReviewDescription: 'Review your answers before submitting.',
    formSubmitTitle: 'Submit this form?',
    formSubmittedSuccess: 'Your form has been submitted',
    formSubmitError: 'We could not submit the form. Please try again.',
    formSaveError: 'We could not save your progress. Please try again.',
    formProgressSaved: 'Progress saved',
    formSaving: 'Saving...',
    formRequiredField: 'Required field.',
    formSectionsProgress: '{current} of {total} sections',
    signature: 'Signature',
    signatureDraw: 'Draw',
    signatureType: 'Type',
    signatureClear: 'Clear',
    signatureCanvasLabel: 'Draw signature',
    signatureDrawPlaceholder: 'Draw signature here',
    signatureFullName: 'Full name',
    signatureTypedStatement:
      'By typing my name, I confirm that this is my electronic signature.',
    signaturePreviewLabel: 'Signature',
    signed: 'Signed',
    signatureSigned: 'Electronically signed',
    signatureSignedOnAt: 'Electronically signed on {date} at {time}',
    expired: 'Expired',
    keepCurrentAppointment: 'Keep current appointment',
    loadAppointmentsError: 'Unable to load appointments.',
    loadingAppointment: 'Loading appointment...',
    loadingAppointmentList: 'Loading appointment list...',
    loadingAvailableTimes: 'Loading available times...',
    loadingCarePage: 'Loading Care Page...',
    loadingConsent: 'Loading consent...',
    loadingConsentList: 'Loading consent list...',
    loadingDocumentList: 'Loading document list...',
    loadingForm: 'Loading form...',
    loadingFormList: 'Loading form list...',
    loadingOverview: 'Loading overview...',
    loadMoreAvailability: 'Load more',
    location: 'Location',
    moreAvailability: 'More availability',
    nextAppointment: 'Next appointment',
    newTime: 'New time',
    needsSignature: 'Needs signature',
    noAppointments: 'You do not have any appointments yet.',
    noAvailableTimes: 'No available times were found for this date.',
    noConsents: 'You do not have any consents right now.',
    noForms: 'You do not have any forms right now.',
    noOverviewDescription:
      'There’s nothing that needs your attention right now. New appointments, forms, consents, and other updates from your clinic will appear here.',
    noOverviewTitle: 'You’re all caught up',
    noLongerAvailable: 'No longer available',
    overview: 'Overview',
    overviewError: 'Unable to load your Care Page overview.',
    payments: 'Payments',
    pastAppointments: 'Past',
    pendingConsentsCount: '{count} pending consents',
    pendingFormsCount: '{count} pending forms',
    pendingNavBadge: '{label}, {count} pending',
    practitioner: 'Practitioner',
    previousSection: 'Previous section',
    recentDocuments: 'Recent documents',
    rescheduleAppointment: 'Reschedule appointment',
    rescheduleAppointmentError: 'Unable to reschedule this appointment.',
    rescheduleAppointmentSuccess: 'Your appointment has been rescheduled.',
    rescheduleNoLongerAllowed: 'This appointment can no longer be rescheduled.',
    rescheduleSlotUnavailable: 'This time is no longer available.',
    rescheduleUnavailable:
      'Available times cannot be loaded for this appointment.',
    reviewAndSign: 'Review and sign',
    reviewForm: 'Review form',
    seeAllAppointments: 'See all appointments',
    seeAllDocuments: 'See all documents',
    selectedTime: 'Selected time',
    signOut: 'Sign out',
    signedOrUnavailable: 'Signed or unavailable',
    submitForm: 'Submit form',
    saveProgress: 'Save progress',
    thingsToComplete: 'Things to complete',
    toComplete: 'To complete',
    inProgress: 'In progress',
    viewCompletedForm: 'View completed form',
    withdrawnByClinic: 'Withdrawn by the clinic',
    upcomingAppointments: 'Upcoming',
    virtualAppointment: 'Virtual appointment',
    withPractitioner: 'With {practitioner}',
    yourClinic: 'Your clinic',
    welcome: 'Welcome, {firstName}',
  },
  fr: {
    appointments: 'Rendez-vous',
    appointmentFallback: 'Rendez-vous',
    appointmentStatusCancelled: 'Annule',
    appointmentStatusCheckedIn: 'Arrive',
    appointmentStatusCompleted: 'Termine',
    appointmentStatusConfirmed: 'Confirme',
    appointmentStatusNoShow: 'Absence',
    appointmentStatusPendingConfirmation: 'Confirmation en attente',
    appointmentStatusPendingRescheduleConfirmation:
      'Confirmation du changement en attente',
    appointmentDetails: 'Details du rendez-vous',
    actions: 'Actions',
    address: 'Adresse',
    appointmentUnavailable: 'Ce rendez-vous n est plus disponible.',
    backToAppointments: 'Retour aux rendez-vous',
    backToAppointmentDetails: 'Retour aux details du rendez-vous',
    backToConsents: 'Retour aux consentements',
    availableTimes: 'Heures disponibles',
    carePageUnavailable: 'Page de soins indisponible',
    carePageSections: 'Sections de la page de soins',
    careSessionRequired: 'Session de page de soins requise.',
    careSessionExpired:
      'Votre session securisee de page de soins a expire. Veuillez rouvrir votre lien securise.',
    cancelAppointment: 'Annuler le rendez-vous',
    cancelAppointmentClinicNotified:
      'La clinique sera informee de l annulation.',
    cancelAppointmentConfirm: 'Annuler ce rendez-vous ?',
    cancelAppointmentDescription:
      'Voulez-vous vraiment annuler ce rendez-vous ?',
    cancelAppointmentError:
      'Nous n avons pas pu annuler le rendez-vous. Veuillez reessayer.',
    cancelAppointmentSuccess: 'Votre rendez-vous a ete annule.',
    cancelAppointmentTitle: 'Annuler le rendez-vous ?',
    cancelNoLongerAllowed: 'Ce rendez-vous ne peut plus etre annule.',
    cancellingAppointment: 'Annulation...',
    backToForms: 'Retour aux formulaires',
    keepAppointment: 'Garder le rendez-vous',
    chooseAnotherTime: 'Choisir une autre heure',
    chooseAnotherDate: 'Choisir une autre date',
    chooseAppointment:
      'Choisissez un rendez-vous dans la liste pour voir ses details.',
    completeForm: 'Remplir le formulaire',
    completed: 'Termine',
    completedOn: 'Termine le {date}',
    confirmReschedule: 'Confirmer le changement',
    continue: 'Continuer',
    continueForm: 'Continuer le formulaire',
    consent: 'Consentement',
    consentNoLongerAvailable: 'Ce consentement n est plus disponible.',
    consentSignedSuccess: 'Votre consentement a ete signe',
    consents: 'Consentements',
    contactClinic:
      'Contactez la clinique pour demander un nouveau lien securise.',
    currentTime: 'Heure actuelle',
    currentAppointment: 'Rendez-vous actuel',
    documents: 'Documents',
    dismissAppointmentMessage: 'Fermer le message de rendez-vous',
    dismissFormMessage: 'Fermer le message de formulaire',
    documentFallback: 'Document',
    dueDate: 'A faire avant le {date}',
    duration: 'Duree',
    durationMinutes: '{count} minutes',
    forNextAppointment: 'Pour votre prochain rendez-vous',
    form: 'Formulaire',
    formNoLongerAvailable: 'Ce formulaire n est plus disponible.',
    forms: 'Formulaires',
    formSubmitReviewDescription: 'Verifiez vos reponses avant de soumettre.',
    formSubmitTitle: 'Soumettre ce formulaire ?',
    formSubmittedSuccess: 'Votre formulaire a ete soumis',
    formSubmitError:
      'Nous n avons pas pu soumettre le formulaire. Veuillez reessayer.',
    formSaveError:
      'Nous n avons pas pu enregistrer votre progression. Veuillez reessayer.',
    formProgressSaved: 'Progression enregistree',
    formSaving: 'Enregistrement...',
    formRequiredField: 'Champ obligatoire.',
    formSectionsProgress: '{current} sur {total} sections',
    signature: 'Signature',
    signatureDraw: 'Dessiner',
    signatureType: 'Taper',
    signatureClear: 'Effacer',
    signatureCanvasLabel: 'Dessiner la signature',
    signatureDrawPlaceholder: 'Dessiner la signature ici',
    signatureFullName: 'Nom complet',
    signatureTypedStatement:
      'En tapant mon nom, je confirme qu il s agit de ma signature electronique.',
    signaturePreviewLabel: 'Signature',
    signed: 'Signe',
    signatureSigned: 'Signature electronique',
    signatureSignedOnAt: 'Signature electronique le {date} a {time}',
    expired: 'Expire',
    keepCurrentAppointment: 'Garder le rendez-vous actuel',
    loadAppointmentsError: 'Impossible de charger les rendez-vous.',
    loadingAppointment: 'Chargement du rendez-vous...',
    loadingAppointmentList: 'Chargement de la liste des rendez-vous...',
    loadingAvailableTimes: 'Chargement des heures disponibles...',
    loadingCarePage: 'Chargement de la page de soins...',
    loadingConsent: 'Chargement du consentement...',
    loadingConsentList: 'Chargement de la liste des consentements...',
    loadingDocumentList: 'Chargement de la liste des documents...',
    loadingForm: 'Chargement du formulaire...',
    loadingFormList: 'Chargement de la liste des formulaires...',
    loadingOverview: 'Chargement de l accueil...',
    loadMoreAvailability: 'Charger plus',
    location: 'Lieu',
    moreAvailability: 'Plus de disponibilites',
    nextAppointment: 'Prochain rendez-vous',
    newTime: 'Nouvelle heure',
    needsSignature: 'Signature requise',
    noAppointments: 'Vous n avez pas encore de rendez-vous.',
    noAvailableTimes:
      'Aucune heure disponible n a ete trouvee pour cette date.',
    noConsents: 'Vous n avez aucun consentement pour le moment.',
    noForms: 'Vous n avez aucun formulaire pour le moment.',
    noOverviewDescription:
      'Rien ne requiert votre attention pour le moment. Les nouveaux rendez-vous, formulaires, consentements et autres mises a jour de votre clinique apparaitront ici.',
    noOverviewTitle: 'Vous etes a jour',
    noLongerAvailable: 'Plus disponible',
    overview: 'Accueil',
    overviewError: 'Impossible de charger votre accueil.',
    payments: 'Paiements',
    pastAppointments: 'Passes',
    pendingConsentsCount: '{count} consentements en attente',
    pendingFormsCount: '{count} formulaires en attente',
    pendingNavBadge: '{label}, {count} en attente',
    practitioner: 'Praticien',
    previousSection: 'Section precedente',
    recentDocuments: 'Documents recents',
    rescheduleAppointment: 'Deplacer le rendez-vous',
    rescheduleAppointmentError: 'Impossible de deplacer ce rendez-vous.',
    rescheduleAppointmentSuccess: 'Votre rendez-vous a ete deplace.',
    rescheduleNoLongerAllowed: 'Ce rendez-vous ne peut plus etre deplace.',
    rescheduleSlotUnavailable: 'Cette heure n est plus disponible.',
    rescheduleUnavailable:
      'Les heures disponibles ne peuvent pas etre chargees pour ce rendez-vous.',
    reviewAndSign: 'Verifier et signer',
    reviewForm: 'Verifier le formulaire',
    seeAllAppointments: 'Voir tous les rendez-vous',
    seeAllDocuments: 'Voir tous les documents',
    selectedTime: 'Heure choisie',
    signOut: 'Se deconnecter',
    signedOrUnavailable: 'Signes ou indisponibles',
    submitForm: 'Soumettre le formulaire',
    saveProgress: 'Enregistrer la progression',
    thingsToComplete: 'A completer',
    toComplete: 'A completer',
    inProgress: 'En cours',
    viewCompletedForm: 'Voir le formulaire termine',
    withdrawnByClinic: 'Retire par la clinique',
    upcomingAppointments: 'A venir',
    virtualAppointment: 'Rendez-vous virtuel',
    withPractitioner: 'Avec {practitioner}',
    yourClinic: 'Votre clinique',
    welcome: 'Bienvenue, {firstName}',
  },
} satisfies Record<string, Record<CareCopyKey, string>>;

function itemsResponse<T>(value: ItemsResponse<T>): T[] {
  return Array.isArray(value) ? value : (value.items ?? []);
}

function careLocale() {
  if (
    typeof navigator !== 'undefined' &&
    navigator.language.toLowerCase().startsWith('fr')
  ) {
    return 'fr';
  }
  return 'en';
}

function t(key: CareCopyKey, params?: Record<string, string | number>) {
  let value = careCopy[careLocale()][key] ?? careCopy.en[key];
  Object.entries(params ?? {}).forEach(([name, replacement]) => {
    value = value.replace(`{${name}}`, String(replacement));
  });
  return value;
}

function careSessionErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return t('careSessionRequired');
  if (error.message.startsWith('CARE_SESSION')) return t('careSessionExpired');
  return error.message;
}

function isRescheduleNoLongerAllowedError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return [
    'APPOINTMENT_NOT_RESCHEDULABLE',
    'APPOINTMENT_HAS_NO_SERVICE',
    'SERVICE_NOT_BOOKABLE',
  ].includes(error.message);
}

function isCancelNoLongerAllowedError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return ['APPOINTMENT_NOT_CANCELLABLE', 'APPOINTMENT_NOT_FOUND'].includes(
    error.message,
  );
}

function positiveCount(value: number | undefined) {
  return value && value > 0 ? value : undefined;
}

function patientGreeting(bootstrap: CareBootstrapDTO) {
  const firstName = bootstrap.patient?.firstName?.trim();
  if (firstName) return t('welcome', { firstName });
  const displayName = [
    bootstrap.patient?.firstName,
    bootstrap.patient?.lastName,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  return displayName || '';
}

type ScrollMetrics = {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
};

type Bounds = {
  left: number;
  right: number;
};

export function careNavScrollAvailability(
  metrics: ScrollMetrics,
  threshold = 2,
) {
  return {
    canScrollLeft: metrics.scrollLeft > threshold,
    canScrollRight:
      metrics.scrollLeft + metrics.clientWidth <
      metrics.scrollWidth - threshold,
  };
}

export function careNavRevealScrollLeft(
  container: Bounds,
  item: Bounds,
  scrollLeft: number,
  maxScrollLeft: number,
  threshold = 2,
) {
  if (maxScrollLeft <= 0) return 0;

  const containerWidth = container.right - container.left;
  const itemWidth = item.right - item.left;
  const itemOffset = item.left - container.left;
  const centeredScrollLeft =
    scrollLeft + itemOffset - (containerWidth - itemWidth) / 2;
  const nextScrollLeft =
    Math.abs(centeredScrollLeft - scrollLeft) < threshold
      ? scrollLeft
      : centeredScrollLeft;

  return Math.max(0, Math.min(maxScrollLeft, nextScrollLeft));
}

export function careNavScrollBehavior(reducedMotion: boolean) {
  return reducedMotion ? 'auto' : 'smooth';
}

function visualBadgeCount(count: number) {
  return count > 99 ? '99+' : String(count);
}

function navItemAriaLabel(item: NavItem) {
  return item.badgeCount
    ? t('pendingNavBadge', { label: item.label, count: item.badgeCount })
    : item.label;
}

function careNavHref(view: CareView) {
  return view === 'overview'
    ? '/care'
    : `/care?view=${encodeURIComponent(view)}`;
}

function careHref(view: CareView, resourceId?: string, action?: CareAction) {
  const params = new URLSearchParams();
  if (view !== 'overview') params.set('view', view);
  if (resourceId) params.set('resourceId', resourceId);
  if (view === 'appointments' && resourceId && action)
    params.set('action', action);
  const query = params.toString();
  return query ? `/care?${query}` : '/care';
}

const allowedCareViews = new Set<CareView>([
  'overview',
  'appointments',
  'forms',
  'consents',
  'documents',
  'payments',
]);

function parseCareRoute(searchParams: URLSearchParams): {
  view: CareView;
  resourceId?: string;
  action?: CareAction;
  invalidAction: boolean;
} {
  const routeView = searchParams.get('view');
  const nextView =
    routeView && allowedCareViews.has(routeView as CareView)
      ? (routeView as CareView)
      : 'overview';
  const resourceId = searchParams.get('resourceId') || undefined;
  const routeAction = searchParams.get('action');
  const action =
    nextView === 'appointments' && resourceId && routeAction === 'reschedule'
      ? routeAction
      : undefined;
  return {
    view: nextView,
    resourceId,
    action,
    invalidAction: Boolean(routeAction && !action),
  };
}

function useCareNavigationScroll(activeView: CareView, items: NavItem[]) {
  const containerRef = useRef<HTMLElement | null>(null);
  const tabRefs = useRef(new Map<CareView, HTMLAnchorElement>());
  const frameRef = useRef<number | null>(null);
  const [scrollState, setScrollState] = useState({
    canScrollLeft: false,
    canScrollRight: false,
  });
  const [containerVersion, setContainerVersion] = useState(0);
  const itemsSignature = items
    .map((item) => `${item.view}:${item.badgeCount ?? 0}`)
    .join('|');

  const setContainerRef = useCallback((node: HTMLElement | null) => {
    containerRef.current = node;
    setContainerVersion((current) => current + 1);
    if (!node) {
      setScrollState({ canScrollLeft: false, canScrollRight: false });
    }
  }, []);

  const applyScrollState = useCallback((metrics: ScrollMetrics) => {
    const next = careNavScrollAvailability({
      scrollLeft: metrics.scrollLeft,
      clientWidth: metrics.clientWidth,
      scrollWidth: metrics.scrollWidth,
    });
    setScrollState((current) =>
      current.canScrollLeft === next.canScrollLeft &&
      current.canScrollRight === next.canScrollRight
        ? current
        : next,
    );
  }, []);

  const updateScrollState = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    applyScrollState({
      scrollLeft: container.scrollLeft,
      clientWidth: container.clientWidth,
      scrollWidth: container.scrollWidth,
    });
  }, [applyScrollState]);

  const scheduleUpdate = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      updateScrollState();
    });
  }, [updateScrollState]);

  const revealTab = useCallback(
    (nextView: CareView) => {
      const container = containerRef.current;
      const tab = tabRefs.current.get(nextView);
      if (!container || !tab) return;

      const nextScrollLeft = careNavRevealScrollLeft(
        container.getBoundingClientRect(),
        tab.getBoundingClientRect(),
        container.scrollLeft,
        Math.max(0, container.scrollWidth - container.clientWidth),
      );

      applyScrollState({
        scrollLeft: nextScrollLeft,
        clientWidth: container.clientWidth,
        scrollWidth: container.scrollWidth,
      });

      if (Math.abs(nextScrollLeft - container.scrollLeft) < 1) return;
      const reducedMotion =
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ===
        true;
      container.scrollTo({
        left: nextScrollLeft,
        behavior: careNavScrollBehavior(reducedMotion),
      });
    },
    [applyScrollState],
  );

  const setTabRef = useCallback(
    (viewName: CareView, node: HTMLAnchorElement | null) => {
      if (node) {
        tabRefs.current.set(viewName, node);
      } else {
        tabRefs.current.delete(viewName);
      }
    },
    [],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    updateScrollState();
    container.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(scheduleUpdate)
        : null;
    observer?.observe(container);

    return () => {
      container.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      observer?.disconnect();
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [containerVersion, scheduleUpdate, updateScrollState, itemsSignature]);

  useEffect(() => {
    revealTab(activeView);
    updateScrollState();
  }, [
    activeView,
    containerVersion,
    itemsSignature,
    revealTab,
    updateScrollState,
  ]);

  return {
    containerRef: setContainerRef,
    setTabRef,
    revealTab,
    ...scrollState,
  };
}

export default function CarePageClient({
  initialView,
  initialResourceId,
  initialAction,
}: {
  initialView: CareView;
  initialResourceId?: string;
  initialAction?: CareAction;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bootstrap, setBootstrap] = useState<CareBootstrapDTO | null>(null);
  const [view, setView] = useState<CareView>(initialView);
  const [resourceId, setResourceId] = useState<string | undefined>(
    initialResourceId,
  );
  const [action, setAction] = useState<CareAction | undefined>(
    initialView === 'appointments' && initialResourceId
      ? initialAction
      : undefined,
  );
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
        if (active) setError(careSessionErrorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshBootstrap]);

  useEffect(() => {
    const next = parseCareRoute(new URLSearchParams(searchParams.toString()));
    setView((current) => (current === next.view ? current : next.view));
    setResourceId((current) =>
      current === next.resourceId ? current : next.resourceId,
    );
    setAction((current) => (current === next.action ? current : next.action));
    if (next.invalidAction) {
      router.replace(careHref(next.view, next.resourceId));
    }
  }, [router, searchParams]);

  useEffect(() => {
    const syncFromHistory = () => {
      const next = parseCareRoute(new URLSearchParams(window.location.search));
      setView(next.view);
      setResourceId(next.resourceId);
      setAction(next.action);
    };
    window.addEventListener('popstate', syncFromHistory);
    return () => {
      window.removeEventListener('popstate', syncFromHistory);
    };
  }, []);

  const navigation = useMemo<NavItem[]>(() => {
    const available = bootstrap?.navigation;
    const summary = bootstrap?.summary;
    const items: NavItem[] = [
      {
        view: 'overview',
        label: t('overview'),
        icon: <Home size={17} />,
        enabled: available?.overview !== false,
      },
      {
        view: 'appointments',
        label: t('appointments'),
        icon: <CalendarDays size={17} />,
        enabled: available?.appointments !== false,
      },
      {
        view: 'forms',
        label: t('forms'),
        icon: <FileText size={17} />,
        enabled: available?.forms !== false,
        badgeCount: positiveCount(summary?.pendingFormCount),
      },
      {
        view: 'consents',
        label: t('consents'),
        icon: <FileCheck2 size={17} />,
        enabled: available?.consents !== false,
        badgeCount: positiveCount(summary?.pendingConsentCount),
      },
      {
        view: 'documents',
        label: t('documents'),
        icon: <FileText size={17} />,
        enabled: available?.documents !== false,
      },
      {
        view: 'payments',
        label: t('payments'),
        icon: <CreditCard size={17} />,
        enabled: available?.payments === true,
      },
    ];
    return items.filter((item) => item.enabled);
  }, [bootstrap]);

  const navigate = useCallback(
    (
      nextView: CareView,
      nextResourceId?: string,
      options?: CareNavigationOptions,
    ) => {
      const nextAction =
        nextView === 'appointments' && nextResourceId
          ? options?.action
          : undefined;
      setView(nextView);
      setResourceId(nextResourceId);
      setAction(nextAction);
      const href = careHref(nextView, nextResourceId, nextAction);
      if (options?.mode === 'push') {
        router.push(href);
      } else {
        router.replace(href);
      }
    },
    [router],
  );
  const backToAppointments = useCallback(
    (useHistory: boolean) => {
      if (useHistory) {
        router.back();
        return;
      }
      setView('appointments');
      setResourceId(undefined);
      setAction(undefined);
      router.replace(careHref('appointments'));
    },
    [router],
  );
  const careNav = useCareNavigationScroll(view, navigation);

  async function signOut() {
    await fetch('/api/core/care/sessions', {
      method: 'DELETE',
      credentials: 'same-origin',
      cache: 'no-store',
    }).catch(() => undefined);
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
          <ContentLoader label={t('loadingCarePage')} />
        </section>
      </main>
    );
  }

  if (error || !bootstrap) {
    return (
      <main className="shell care-entry-shell">
        <section className="panel care-entry-panel">
          <header className="hero care-entry-hero">
            <h1>{t('carePageUnavailable')}</h1>
            <p>{t('contactClinic')}</p>
          </header>
          <div className="content">
            <div className="notice danger">
              {error || t('careSessionRequired')}
            </div>
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
            <h1>{bootstrap.clinic?.name ?? t('yourClinic')}</h1>
            <p className="muted">{patientGreeting(bootstrap)}</p>
          </div>
          <button
            type="button"
            className="secondary compact care-sign-out"
            onClick={signOut}
          >
            <LogOut size={14} aria-hidden="true" />
            {t('signOut')}
          </button>
        </header>
        <div className="care-nav-shell">
          <nav
            className="care-nav"
            aria-label={t('carePageSections')}
            ref={careNav.containerRef}
          >
            {navigation.map((item) => (
              <Link
                aria-current={item.view === view ? 'page' : undefined}
                aria-label={navItemAriaLabel(item)}
                className={
                  item.view === view ? 'active secondary' : 'secondary'
                }
                href={careNavHref(item.view)}
                key={item.view}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(item.view);
                }}
                onFocus={() => careNav.revealTab(item.view)}
                ref={(node) => careNav.setTabRef(item.view, node)}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badgeCount ? (
                  <span className="care-nav-badge" aria-hidden="true">
                    {visualBadgeCount(item.badgeCount)}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
          {careNav.canScrollLeft ? (
            <span
              className="care-nav-fade care-nav-fade-left"
              data-testid="care-nav-left-fade"
              aria-hidden="true"
            />
          ) : null}
          {careNav.canScrollRight ? (
            <span
              className="care-nav-fade care-nav-fade-right"
              data-testid="care-nav-right-fade"
              aria-hidden="true"
            />
          ) : null}
        </div>
        <div className="care-content">
          {view === 'overview' ? (
            <Overview refreshKey={refreshKey} onNavigate={navigate} />
          ) : view === 'appointments' ? (
            <AppointmentsSection
              resourceId={resourceId}
              action={action}
              refreshKey={refreshKey}
              onBackToList={backToAppointments}
              onNavigate={navigate}
              onChanged={refreshCareData}
            />
          ) : view === 'forms' ? (
            <FormsSection
              resourceId={resourceId}
              refreshKey={refreshKey}
              onNavigate={navigate}
              onChanged={refreshCareData}
            />
          ) : view === 'consents' ? (
            <ConsentsSection
              resourceId={resourceId}
              refreshKey={refreshKey}
              onNavigate={navigate}
              onChanged={refreshCareData}
            />
          ) : view === 'documents' ? (
            <DocumentsSection
              resourceId={resourceId}
              refreshKey={refreshKey}
              onNavigate={navigate}
            />
          ) : (
            <PaymentsSection />
          )}
        </div>
      </section>
    </main>
  );
}

function Overview({
  refreshKey,
  onNavigate,
}: {
  refreshKey: number;
  onNavigate: (
    view: CareView,
    resourceId?: string,
    options?: CareNavigationOptions,
  ) => void;
}) {
  const [overview, setOverview] = useState<CareOverviewDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    corePublic<CareOverviewDTO>('/care/overview')
      .then((data) => {
        if (active) setOverview(data);
      })
      .catch(() => {
        if (active) setError(t('overviewError'));
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  if (error) return <InlineError message={error} />;
  if (!overview) return <ContentLoader label={t('loadingOverview')} />;

  const pendingTasks = overviewTasks(overview);
  const recentDocuments = (overview.recentDocuments ?? [])
    .filter((document) => document.id)
    .slice(0, 3);
  const hasOverviewContent =
    pendingTasks.length > 0 ||
    Boolean(overview.nextAppointment) ||
    recentDocuments.length > 0;

  return (
    <div className="care-section">
      {hasOverviewContent ? null : (
        <NeutralEmptyState>
          <h2>{t('noOverviewTitle')}</h2>
          <p>{t('noOverviewDescription')}</p>
        </NeutralEmptyState>
      )}

      {pendingTasks.length ? (
        <section className="care-block">
          <h2>{t('thingsToComplete')}</h2>
          <div className="care-list">
            {pendingTasks.map((task) => (
              <PendingTaskRow
                key={`${task.view}-${task.id}`}
                task={task}
                onOpen={() => onNavigate(task.view, task.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {overview.nextAppointment ? (
        <section className="care-block">
          <div className="care-block-heading">
            <h2>{t('nextAppointment')}</h2>
            <button
              type="button"
              className="care-section-link"
              onClick={() => onNavigate('appointments')}
            >
              {t('seeAllAppointments')}
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
          <OverviewAppointmentCard
            appointment={overview.nextAppointment}
            onOpen={() =>
              onNavigate('appointments', overview.nextAppointment?.id, {
                mode: 'push',
              })
            }
          />
        </section>
      ) : null}

      {recentDocuments.length ? (
        <section className="care-block">
          <div className="care-block-heading">
            <h2>{t('recentDocuments')}</h2>
            <button
              type="button"
              className="secondary compact"
              onClick={() => onNavigate('documents')}
            >
              {t('seeAllDocuments')}
            </button>
          </div>
          <OverviewDocumentList
            documents={recentDocuments}
            onOpen={(id) => onNavigate('documents', id)}
          />
        </section>
      ) : null}
    </div>
  );
}

function AppointmentsSection({
  resourceId,
  action,
  refreshKey,
  onBackToList,
  onNavigate,
  onChanged,
}: {
  resourceId?: string;
  action?: CareAction;
  refreshKey: number;
  onBackToList: (useHistory: boolean) => void;
  onNavigate: (
    view: CareView,
    resourceId?: string,
    options?: CareNavigationOptions,
  ) => void;
  onChanged: () => void;
}) {
  const [appointments, setAppointments] = useState<
    ManagedAppointmentResponseDTO[] | null
  >(null);
  const [detail, setDetail] = useState<ManagedAppointmentResponseDTO | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelDialogError, setCancelDialogError] = useState<string | null>(
    null,
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [invalidAppointmentIds, setInvalidAppointmentIds] = useState<
    Set<string>
  >(() => new Set());
  const narrowViewport = useNarrowCareViewport();
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const rescheduleTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cancelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const openedFromListRef = useRef(false);
  const lastOpenedAppointmentIdRef = useRef<string | null>(null);
  const listScrollYRef = useRef<number | null>(null);
  const groups = useMemo(
    () => groupAppointments(appointments ?? []),
    [appointments],
  );
  const hasAppointments = Boolean(appointments?.length);
  const isExplicitAppointmentSelection = Boolean(resourceId);
  const explicitAppointmentIsListValid = Boolean(
    resourceId &&
    !invalidAppointmentIds.has(resourceId) &&
    (!appointments ||
      appointments.some((appointment) => appointment.id === resourceId)),
  );
  const desktopDefaultAppointment = useMemo(
    () =>
      narrowViewport === false
        ? getDefaultDesktopAppointment(groups, invalidAppointmentIds)
        : null,
    [groups, invalidAppointmentIds, narrowViewport],
  );
  const selectedAppointmentId = explicitAppointmentIsListValid
    ? resourceId
    : desktopDefaultAppointment?.id;
  const showMobileDetail =
    narrowViewport !== false && isExplicitAppointmentSelection;
  const showMobileReschedule =
    narrowViewport !== false &&
    isExplicitAppointmentSelection &&
    action === 'reschedule';
  const showMobileList =
    narrowViewport !== false && !isExplicitAppointmentSelection;
  const showDesktopSplit = narrowViewport === false;
  const showDesktopRescheduleDialog =
    showDesktopSplit && action === 'reschedule';

  useEffect(() => {
    let active = true;
    setError(null);
    setInvalidAppointmentIds(new Set());
    corePublic<ManagedAppointmentResponseDTO[]>('/care/appointments')
      .then((items) => {
        if (active) setAppointments(items);
      })
      .catch(() => {
        if (active) setError(t('loadAppointmentsError'));
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (!appointments) return;
    if (!appointments.length) {
      if (resourceId) {
        setError(t('appointmentUnavailable'));
        onNavigate('appointments', undefined, { mode: 'replace' });
      }
      return;
    }

    const explicitSelectionMissing = Boolean(
      resourceId &&
      !appointments.some((appointment) => appointment.id === resourceId),
    );
    if (explicitSelectionMissing) {
      setError(t('appointmentUnavailable'));
      onNavigate('appointments', undefined, { mode: 'replace' });
      return;
    }
    if (action === 'reschedule' && !resourceId) {
      onNavigate('appointments', undefined, { mode: 'replace' });
    }
  }, [action, appointments, onNavigate, resourceId]);

  useEffect(() => {
    if (!selectedAppointmentId) {
      setDetail(null);
      return;
    }
    if (
      appointments &&
      resourceId === selectedAppointmentId &&
      !appointments.some(
        (appointment) => appointment.id === selectedAppointmentId,
      )
    ) {
      setDetail(null);
      setError(t('appointmentUnavailable'));
      return;
    }
    let active = true;
    setError(null);
    setDetail((current) =>
      current?.id === selectedAppointmentId ? current : null,
    );
    corePublic<ManagedAppointmentResponseDTO>(
      `/care/appointments/${encodeURIComponent(selectedAppointmentId)}`,
    )
      .then((item) => {
        if (active) setDetail(item);
      })
      .catch(() => {
        if (!active) return;
        setDetail(null);
        setError(t('appointmentUnavailable'));
        if (resourceId === selectedAppointmentId) {
          setInvalidAppointmentIds((current) =>
            new Set(current).add(selectedAppointmentId),
          );
          onNavigate('appointments', undefined, { mode: 'replace' });
        }
      });
    return () => {
      active = false;
    };
  }, [appointments, onNavigate, refreshKey, resourceId, selectedAppointmentId]);

  useEffect(() => {
    if (action !== 'reschedule') return;
    if (!detail) return;
    if (detail.rescheduleAllowed) return;
    setError(t('rescheduleNoLongerAllowed'));
    onNavigate('appointments', detail.id, { mode: 'replace' });
  }, [action, detail, onNavigate]);

  useEffect(() => {
    if (narrowViewport !== true) return;
    if (resourceId) {
      sectionRef.current?.scrollIntoView?.({
        block: 'start',
        behavior: careNavScrollBehavior(
          window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ===
            true,
        ),
      });
      if (detail && action !== 'reschedule') {
        backButtonRef.current?.focus({ preventScroll: true });
      }
      return;
    }
    if (!lastOpenedAppointmentIdRef.current) return;
    if (listScrollYRef.current !== null) {
      if (Math.abs(window.scrollY - listScrollYRef.current) > 1) {
        try {
          window.scrollTo?.({ top: listScrollYRef.current, behavior: 'auto' });
        } catch {
          // Some test and embedded browsers do not expose scroll restoration APIs.
        }
      }
      listScrollYRef.current = null;
    }
    const opener = cardRefs.current.get(lastOpenedAppointmentIdRef.current);
    opener?.focus({ preventScroll: true });
  }, [action, detail, narrowViewport, resourceId]);

  function requestCancelAppointment() {
    if (!selectedAppointmentId) return;
    setCancelDialogError(null);
    setCancelConfirmOpen(true);
  }

  function closeCancelConfirmation() {
    setCancelConfirmOpen(false);
    requestAnimationFrame(() => {
      cancelTriggerRef.current?.focus({ preventScroll: true });
    });
  }

  async function cancelAppointment() {
    if (!selectedAppointmentId || cancelBusy) return;
    setCancelBusy(true);
    setError(null);
    setCancelDialogError(null);
    try {
      const updated = await corePublic<ManagedAppointmentResponseDTO>(
        `/care/appointments/${encodeURIComponent(selectedAppointmentId)}/cancel`,
        { method: 'POST' },
      );
      setDetail(updated);
      setCancelConfirmOpen(false);
      setSuccessMessage(t('cancelAppointmentSuccess'));
      onChanged();
    } catch (error) {
      setCancelDialogError(
        isCancelNoLongerAllowedError(error)
          ? t('cancelNoLongerAllowed')
          : t('cancelAppointmentError'),
      );
    } finally {
      setCancelBusy(false);
    }
  }

  function openAppointment(id: string) {
    if (narrowViewport === true) {
      openedFromListRef.current = true;
      lastOpenedAppointmentIdRef.current = id;
      listScrollYRef.current = window.scrollY;
    }
    onNavigate('appointments', id, { mode: 'push' });
  }

  function openRescheduleFlow() {
    if (!selectedAppointmentId) return;
    setSuccessMessage(null);
    onNavigate('appointments', selectedAppointmentId, {
      mode: 'push',
      action: 'reschedule',
    });
  }

  function closeRescheduleFlow(mode: CareNavigationMode = 'replace') {
    if (!selectedAppointmentId) {
      onNavigate('appointments', undefined, { mode: 'replace' });
      return;
    }
    onNavigate('appointments', selectedAppointmentId, { mode });
    requestAnimationFrame(() => {
      rescheduleTriggerRef.current?.focus({ preventScroll: true });
    });
  }

  async function submitReschedule(slot: AvailabilitySlotResponseDTO) {
    if (!selectedAppointmentId || !slot.startAt) {
      throw new Error('invalid-slot');
    }
    const updated = await corePublic<ManagedAppointmentResponseDTO>(
      `/care/appointments/${encodeURIComponent(selectedAppointmentId)}/reschedule`,
      {
        method: 'POST',
        body: JSON.stringify({
          newStartAt: slot.startAt,
          employeeId: slot.employeeId,
        }),
      },
    );
    setDetail(updated);
    setSuccessMessage(t('rescheduleAppointmentSuccess'));
    onChanged();
  }

  function setAppointmentCardRef(id: string, node: HTMLButtonElement | null) {
    if (node) {
      cardRefs.current.set(id, node);
    } else {
      cardRefs.current.delete(id);
    }
  }

  function backToAppointmentList() {
    const useHistory = openedFromListRef.current;
    openedFromListRef.current = false;
    onBackToList(useHistory);
  }

  if (!appointments)
    return <ContentLoader label={t('loadingAppointmentList')} />;
  if (!hasAppointments) {
    return (
      <section className="care-block">
        <h2>{t('appointments')}</h2>
        <NeutralEmptyState>{t('noAppointments')}</NeutralEmptyState>
      </section>
    );
  }

  const appointmentList = (
    <section className="care-block care-appointment-list-panel">
      <h2>{t('appointments')}</h2>
      {error && !isExplicitAppointmentSelection ? (
        <InlineError message={error} />
      ) : null}
      <AppointmentGroup
        title={t('upcomingAppointments')}
        appointments={groups.upcoming}
        activeId={showMobileList ? undefined : selectedAppointmentId}
        onOpen={openAppointment}
        onButtonRef={setAppointmentCardRef}
      />
      <AppointmentGroup
        title={t('pastAppointments')}
        appointments={groups.past}
        activeId={showMobileList ? undefined : selectedAppointmentId}
        onOpen={openAppointment}
        onButtonRef={setAppointmentCardRef}
      />
    </section>
  );
  const appointmentDetail = (
    <section className="care-block care-appointment-detail-panel">
      {showMobileDetail ? (
        <button
          type="button"
          aria-label={t('backToAppointments')}
          className="care-mobile-back"
          onClick={backToAppointmentList}
          ref={backButtonRef}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {t('appointments')}
        </button>
      ) : null}
      {error ? <InlineError message={error} /> : null}
      {successMessage ? (
        <div className="notice success care-dismissible-notice" role="status">
          <span>{successMessage}</span>
          <button
            type="button"
            aria-label={t('dismissAppointmentMessage')}
            className="care-notice-close"
            onClick={() => setSuccessMessage(null)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {selectedAppointmentId && !detail && !error ? (
        <ContentLoader label={t('loadingAppointment')} />
      ) : null}
      {detail ? (
        <div className="care-detail">
          <AppointmentFacts appointment={detail} />
          {detail.rescheduleAllowed || detail.cancellationAllowed ? (
            <section className="care-actions-section">
              <h3>{t('actions')}</h3>
              <div className="actions">
                {detail.rescheduleAllowed ? (
                  <button
                    type="button"
                    className="reschedule-action-button"
                    disabled={cancelBusy}
                    onClick={openRescheduleFlow}
                    ref={rescheduleTriggerRef}
                  >
                    {t('rescheduleAppointment')}
                  </button>
                ) : null}
                {detail.cancellationAllowed ? (
                  <button
                    type="button"
                    className="secondary danger-action"
                    disabled={cancelBusy}
                    onClick={requestCancelAppointment}
                    ref={cancelTriggerRef}
                  >
                    {t('cancelAppointment')}
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
      {!selectedAppointmentId && !error ? (
        <NeutralEmptyState>{t('chooseAppointment')}</NeutralEmptyState>
      ) : null}
    </section>
  );

  return (
    <div className="care-two-column care-appointments-layout" ref={sectionRef}>
      {showMobileList || showDesktopSplit ? appointmentList : null}
      {showMobileDetail && !showMobileReschedule ? appointmentDetail : null}
      {showDesktopSplit ? appointmentDetail : null}
      {showMobileReschedule ? (
        <MobileAppointmentRescheduleView
          appointment={detail}
          onBack={() => closeRescheduleFlow('replace')}
          onSubmit={submitReschedule}
          onSuccess={() => closeRescheduleFlow('replace')}
        />
      ) : null}
      {showDesktopRescheduleDialog ? (
        <AppointmentRescheduleDialog
          appointment={detail}
          onClose={() => closeRescheduleFlow('replace')}
          onSubmit={submitReschedule}
          onSuccess={() => closeRescheduleFlow('replace')}
        />
      ) : null}
      {cancelConfirmOpen ? (
        <CancelAppointmentDialog
          busy={cancelBusy}
          error={cancelDialogError}
          onClose={closeCancelConfirmation}
          onConfirm={cancelAppointment}
        />
      ) : null}
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
  onNavigate: (
    view: CareView,
    resourceId?: string,
    options?: CareNavigationOptions,
  ) => void;
  onChanged: () => void;
}) {
  const [forms, setForms] = useState<CareFormListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const invalidFormIdsRef = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    setError(null);
    corePublic<ItemsResponse<CareFormSummaryDTO>>('/care/forms')
      .then((response) => {
        if (active) setForms(itemsResponse(response) as CareFormListItem[]);
      })
      .catch((loadError) => {
        if (active)
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Unable to load forms.',
          );
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (!forms || !resourceId) return;
    const selected = forms.find((item) => item.id === resourceId);
    if (!selected || getPatientFormState(selected).group === 'hidden') {
      invalidFormIdsRef.current.add(resourceId);
      setNotice(t('formNoLongerAvailable'));
      onNavigate('forms', undefined, { mode: 'replace' });
    }
  }, [forms, onNavigate, resourceId]);

  function openForm(id: string) {
    setNotice(null);
    onNavigate('forms', id, { mode: 'push' });
  }

  function backToForms() {
    onNavigate('forms', undefined, { mode: 'replace' });
  }

  function handleUnavailable() {
    if (resourceId) invalidFormIdsRef.current.add(resourceId);
    setNotice(t('formNoLongerAvailable'));
    onChanged();
    onNavigate('forms', undefined, { mode: 'replace' });
  }

  function handleSubmitted() {
    setNotice(t('formSubmittedSuccess'));
    onChanged();
    onNavigate('forms', undefined, { mode: 'replace' });
  }

  function handleSaved() {
    onChanged();
  }

  if (error) return <InlineError message={error} />;
  if (resourceId) {
    if (!forms) {
      return (
        <section className="care-block care-form-completion-shell">
          <ContentLoader label={t('loadingForm')} />
        </section>
      );
    }
    if (invalidFormIdsRef.current.has(resourceId)) {
      return (
        <section className="care-block">
          <h2>{t('forms')}</h2>
          <NeutralEmptyState>{t('formNoLongerAvailable')}</NeutralEmptyState>
        </section>
      );
    }
    const summary = forms.find((item) => item.id === resourceId);
    if (!summary || getPatientFormState(summary).group === 'hidden') {
      return (
        <section className="care-block care-form-completion-shell">
          <ContentLoader label={t('loadingForm')} />
        </section>
      );
    }
    return (
      <CareFormCompletionView
        assignmentId={resourceId}
        summary={summary}
        onBack={backToForms}
        onSaved={handleSaved}
        onSubmitted={handleSubmitted}
        onUnavailable={handleUnavailable}
      />
    );
  }

  if (!forms) return <ContentLoader label={t('loadingFormList')} />;
  const groups = groupPatientForms(forms);
  const hasVisibleForms =
    groups.toComplete.length ||
    groups.inProgress.length ||
    groups.completed.length ||
    groups.unavailable.length;

  return (
    <section className="care-block care-forms-landing">
      <h2>{t('forms')}</h2>
      {notice ? (
        <div className="notice success care-dismissible-notice" role="status">
          <span>{notice}</span>
          <button
            type="button"
            aria-label={t('dismissFormMessage')}
            className="care-notice-close"
            onClick={() => setNotice(null)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {hasVisibleForms ? (
        <>
          <CareFormsGroup
            title={t('toComplete')}
            items={groups.toComplete}
            onOpen={openForm}
          />
          <CareFormsGroup
            title={t('inProgress')}
            items={groups.inProgress}
            onOpen={openForm}
          />
          <CareFormsGroup
            title={t('completed')}
            items={groups.completed}
            onOpen={openForm}
          />
          <CareFormsGroup
            title=""
            items={groups.unavailable}
            onOpen={openForm}
          />
        </>
      ) : (
        <NeutralEmptyState>{t('noForms')}</NeutralEmptyState>
      )}
    </section>
  );
}

function CareFormCompletionView({
  assignmentId,
  summary,
  onBack,
  onSaved,
  onSubmitted,
  onUnavailable,
}: {
  assignmentId: string;
  summary: CareFormListItem;
  onBack: () => void;
  onSaved: () => void;
  onSubmitted: () => void;
  onUnavailable: () => void;
}) {
  return (
    <section className="care-block care-form-completion-shell">
      <button
        type="button"
        aria-label={t('backToForms')}
        className="care-form-back"
        onClick={onBack}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {t('forms')}
      </button>
      <FormFlow
        assignmentId={assignmentId}
        fallbackTitle={formDisplayTitle(summary)}
        initialPatientState={getPatientFormState(summary)}
        onSaved={onSaved}
        onSubmitted={onSubmitted}
        onUnavailable={onUnavailable}
      />
    </section>
  );
}

function FormFlow({
  assignmentId,
  fallbackTitle,
  initialPatientState,
  onSaved,
  onSubmitted,
  onUnavailable,
}: {
  assignmentId: string;
  fallbackTitle?: string;
  initialPatientState?: PatientFormState;
  onSaved: () => void;
  onSubmitted: () => void;
  onUnavailable: () => void;
}) {
  const [form, setForm] = useState<PublicFormWithAnswers | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [sectionIndex, setSectionIndex] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [pendingFocusFieldId, setPendingFocusFieldId] = useState<string | null>(
    null,
  );
  const onUnavailableRef = useRef(onUnavailable);

  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  useEffect(() => {
    let active = true;
    setForm(null);
    setMessage(null);
    setActionError(null);
    corePublic<PublicFormWithAnswers>(
      `/care/forms/${encodeURIComponent(assignmentId)}`,
    )
      .then((data) => {
        if (!active) return;
        setForm(data);
        setAnswers(initialFormAnswers(data));
        setSectionIndex(0);
      })
      .catch(() => {
        if (active) onUnavailableRef.current();
      });
    return () => {
      active = false;
    };
  }, [assignmentId]);

  useEffect(() => {
    if (!pendingFocusFieldId) return;
    const escapedFieldId = cssEscape(pendingFocusFieldId);
    const target = document.querySelector<HTMLElement>(
      `[data-field-id="${escapedFieldId}"] input:not([type="hidden"]), [data-field-id="${escapedFieldId}"] textarea, [data-field-id="${escapedFieldId}"] select, [data-field-id="${escapedFieldId}"] canvas`,
    );
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({
      block: 'center',
      behavior: careNavScrollBehavior(
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ===
          true,
      ),
    });
    setPendingFocusFieldId(null);
  }, [pendingFocusFieldId, sectionIndex, errors]);

  if (message && !form) return <InlineError message={message} />;
  if (!form) return <ContentLoader label={t('loadingForm')} />;
  const schema = form.schema as ClinicalSchema | undefined;
  const patientState = getPatientFormState({
    status: form.status,
    closedReason: form.closedReason,
  } as CareFormListItem);
  const readOnly =
    patientState.group === 'completed' ||
    initialPatientState?.group === 'completed';
  if (!schema)
    return <NeutralEmptyState>{t('formNoLongerAvailable')}</NeutralEmptyState>;
  if (!form.open && !readOnly)
    return (
      <NeutralEmptyState>
        {completedText(form.closedReason, t('formNoLongerAvailable'))}
      </NeutralEmptyState>
    );

  const sections = schema.sections ?? [];
  const section = sections[sectionIndex];
  const displayedSections = readOnly ? sections : section ? [section] : [];
  const isLast = sectionIndex >= sections.length - 1;
  const busy = saving || submitting;
  const title = formDisplayTitle(
    form as CareFormTitleSource,
    fallbackTitle ?? t('form'),
  );
  const canSaveDraft = !readOnly;

  function updateAnswer(fieldId: string, value: unknown) {
    if (readOnly) return;
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
    const firstError = firstInvalidField(schema!, validation);
    if (firstError) {
      setPendingFocusFieldId(firstError.fieldId);
      return;
    }
    setSectionIndex((current) => Math.min(current + 1, sections.length - 1));
  }

  async function saveDraft() {
    if (saving || readOnly) return;
    setSaving(true);
    setActionError(null);
    setMessage(null);
    try {
      await corePublic(`/care/forms/${encodeURIComponent(assignmentId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ answers: submissionAnswers(answers, schema!) }),
      });
      setMessage(t('formProgressSaved'));
      onSaved();
    } catch {
      setActionError(t('formSaveError'));
    } finally {
      setSaving(false);
    }
  }

  function requestSubmit() {
    const validation = validateRequired(schema!, answers);
    setErrors(validation);
    const firstError = firstInvalidField(schema!, validation);
    if (firstError) {
      setSectionIndex(firstError.sectionIndex);
      setPendingFocusFieldId(firstError.fieldId);
      return;
    }
    setActionError(null);
    setSubmitDialogOpen(true);
  }

  async function submit() {
    if (submitting || readOnly) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await corePublic(
        `/care/forms/${encodeURIComponent(assignmentId)}/submit`,
        {
          method: 'POST',
          body: JSON.stringify({ answers: submissionAnswers(answers, schema!) }),
        },
      );
      setSubmitDialogOpen(false);
      onSubmitted();
    } catch {
      setActionError(t('formSubmitError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="care-form-flow">
      {message ? (
        <div className="notice success care-dismissible-notice" role="status">
          <span>{message}</span>
          <button
            type="button"
            aria-label={t('dismissFormMessage')}
            className="care-notice-close"
            onClick={() => setMessage(null)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {actionError ? <InlineError message={actionError} /> : null}
      {readOnly ? <div className="notice success">{t('completed')}</div> : null}
      <div className="care-form-title">
        <h2>{title}</h2>
        {form.description ? <p className="muted">{form.description}</p> : null}
        {!readOnly && sections.length > 1 ? (
          <p className="care-form-progress">
            {t('formSectionsProgress', {
              current: sectionIndex + 1,
              total: sections.length,
            })}
          </p>
        ) : null}
      </div>
      {displayedSections.map((displayedSection) => (
        <section key={displayedSection.id} className="document-section">
          <div className="document-section-heading">
            {sectionTitle(displayedSection) ? (
              <h3>{sectionTitle(displayedSection)}</h3>
            ) : null}
            {displayedSection.description ? (
              <span className="document-section-description">
                {formTemplateText(displayedSection.description)}
              </span>
            ) : null}
          </div>
          <div className="document-fields">
            {displayedSection.fields.map((node) => (
              <CareFormSchemaNode
                key={node.id}
                node={node}
                answers={answers}
                errors={errors}
                readOnly={readOnly}
                onChange={updateAnswer}
              />
            ))}
          </div>
        </section>
      ))}
      {!readOnly ? (
        <div className="document-actions care-form-action-footer">
          <div className="actions">
            {canSaveDraft ? (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                aria-busy={saving}
                onClick={saveDraft}
              >
                {saving ? (
                  <span className="inline-loading">
                    <span
                      className="loader-dot inline-loading-icon"
                      aria-hidden="true"
                    />
                    {t('formSaving')}
                  </span>
                ) : (
                  <>
                    <Save size={16} aria-hidden="true" />
                    {t('saveProgress')}
                  </>
                )}
              </button>
            ) : null}
            {sectionIndex > 0 ? (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() =>
                  setSectionIndex((current) => Math.max(0, current - 1))
                }
              >
                <ArrowLeft size={16} aria-hidden="true" />
                {t('previousSection')}
              </button>
            ) : null}
            {!isLast ? (
              <button type="button" disabled={busy} onClick={next}>
                {t('continue')}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={requestSubmit}>
                <Send size={16} aria-hidden="true" />
                {t('submitForm')}
              </button>
            )}
          </div>
        </div>
      ) : null}
      {submitDialogOpen ? (
        <CareFormSubmitDialog
          busy={submitting}
          error={actionError}
          formTitle={title}
          onClose={() => {
            if (!submitting) setSubmitDialogOpen(false);
          }}
          onConfirm={submit}
        />
      ) : null}
    </div>
  );
}

function CareFormsGroup({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: CareFormListItem[];
  onOpen: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="care-task-group care-form-group">
      {title ? <h3>{title}</h3> : null}
      <div className="care-list">
        {items.map((item) => (
          <CareFormCard key={item.id} form={item} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function CareFormCard({
  form,
  onOpen,
}: {
  form: CareFormListItem;
  onOpen: (id: string) => void;
}) {
  const patientState = getPatientFormState(form);
  if (patientState.group === 'hidden' || !form.id) return null;
  const title = formDisplayTitle(form, t('form'));
  const completedAt =
    patientState.group === 'completed' ? patientState.completedAt : undefined;
  const statusLabel = completedAt
    ? t('completedOn', { date: formatClinicDate(completedAt) })
    : t(patientState.labelKey);
  const context = taskContext(
    form.appointmentId,
    undefined,
    patientState.group === 'completed' ? undefined : form.dueAt,
  );
  const disabled = !patientState.actionable;

  return (
    <button
      type="button"
      className={
        disabled
          ? 'care-list-item care-form-card disabled'
          : 'care-list-item care-form-card'
      }
      disabled={disabled}
      onClick={() => form.id && patientState.actionable && onOpen(form.id)}
    >
      <span>
        <strong>{title}</strong>
        {context ? <small>{context}</small> : null}
        <small
          className={
            patientState.group === 'completed' ? 'care-list-status' : undefined
          }
        >
          {statusLabel}
        </small>
      </span>
      {patientState.actionable ? (
        <ArrowRight size={16} aria-hidden="true" />
      ) : null}
    </button>
  );
}

function CareFormSubmitDialog({
  busy,
  error,
  formTitle,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  error: string | null;
  formTitle: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    requestAnimationFrame(() => {
      const focusTarget = dialogRef.current?.querySelector<HTMLElement>(
        'button:not([disabled])',
      );
      focusTarget?.focus({ preventScroll: true });
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busy) onClose();
        return;
      }
      const dialog = dialogRef.current;
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus({ preventScroll: true });
    };
  }, [busy, onClose]);

  return (
    <div
      className="care-dialog-overlay care-submit-dialog-overlay"
      onMouseDown={() => !busy && onClose()}
    >
      <div
        aria-labelledby="care-submit-dialog-title"
        aria-describedby="care-submit-dialog-description"
        aria-modal="true"
        className="care-dialog care-confirm-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <section
          className="care-confirm-content"
          aria-labelledby="care-submit-dialog-title"
        >
          <header className="care-confirm-header">
            <h2 id="care-submit-dialog-title">{t('formSubmitTitle')}</h2>
            <p className="muted">{formTitle}</p>
          </header>
          <div
            className="care-confirm-description"
            id="care-submit-dialog-description"
          >
            <p className="muted">{t('formSubmitReviewDescription')}</p>
          </div>
          {error ? <InlineError message={error} /> : null}
          <div className="actions care-confirm-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={onClose}
            >
              {t('reviewForm')}
            </button>
            <button
              type="button"
              disabled={busy}
              aria-busy={busy}
              onClick={onConfirm}
            >
              {t('submitForm')}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function groupPatientForms(forms: CareFormListItem[]) {
  return forms.reduce(
    (groups, form) => {
      const state = getPatientFormState(form);
      if (state.group === 'toComplete') groups.toComplete.push(form);
      if (state.group === 'inProgress') groups.inProgress.push(form);
      if (state.group === 'completed') groups.completed.push(form);
      if (
        state.group === 'expired' ||
        state.group === 'withdrawn' ||
        state.group === 'noLongerAvailable'
      )
        groups.unavailable.push(form);
      return groups;
    },
    {
      toComplete: [],
      inProgress: [],
      completed: [],
      unavailable: [],
    } as Record<
      'toComplete' | 'inProgress' | 'completed' | 'unavailable',
      CareFormListItem[]
    >,
  );
}

function getPatientFormState(form: CareFormListItem): PatientFormState {
  const status = (form.status ?? '').toUpperCase();
  if (formToCompleteStatuses.has(status))
    return { group: 'toComplete', labelKey: 'completeForm', actionable: true };
  if (formInProgressStatuses.has(status))
    return { group: 'inProgress', labelKey: 'continueForm', actionable: true };
  if (formCompletedStatuses.has(status)) {
    return {
      group: 'completed',
      labelKey: 'viewCompletedForm',
      actionable: true,
      completedAt:
        form.completedAt ?? form.submittedAt ?? form.responseSubmittedAt,
    };
  }
  if (formExpiredStatuses.has(status))
    return { group: 'expired', labelKey: 'expired', actionable: false };
  if (formWithdrawnStatuses.has(status))
    return {
      group: 'withdrawn',
      labelKey: 'withdrawnByClinic',
      actionable: false,
    };
  if (formNoLongerAvailableStatuses.has(status))
    return {
      group: 'noLongerAvailable',
      labelKey: 'noLongerAvailable',
      actionable: false,
    };
  return { group: 'hidden', labelKey: 'noLongerAvailable', actionable: false };
}

function formDisplayTitle(form: CareFormTitleSource, fallback = '') {
  return (
    form.title?.trim() ||
    form.name?.trim() ||
    form.formName?.trim() ||
    form.templateTitle?.trim() ||
    form.templateName?.trim() ||
    fallback
  );
}

function initialFormAnswers(form: PublicFormWithAnswers) {
  return form.submission?.answers ?? (form.draft as Answers | undefined) ?? {};
}

function firstInvalidField(schema: ClinicalSchema, validation: FieldErrors) {
  for (
    let sectionIndex = 0;
    sectionIndex < schema.sections.length;
    sectionIndex += 1
  ) {
    const field = fieldsInNodes(schema.sections[sectionIndex].fields).find(
      (item) => validation[item.id],
    );
    if (field) return { sectionIndex, fieldId: field.id };
  }
  return null;
}

function formTemplateText(value: LocalizedText) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const locale = careLocale();
  return (
    value[locale] ||
    value.en ||
    value.fr ||
    Object.values(value).find(Boolean) ||
    ''
  );
}

function sectionTitle(section: Section) {
  return formTemplateText(section.label) || formTemplateText(section.title);
}

function isColumnsNode(node: SchemaNode | undefined): node is ColumnsNode {
  return node?.type === 'COLUMNS';
}

function fieldsInNodes(nodes: SchemaNode[] = []) {
  return nodes.flatMap((node) =>
    isColumnsNode(node) ? (node.children ?? []) : [node],
  );
}

function normalizedColumnRatios(
  ratios: number[] | undefined,
  childCount: number,
) {
  if (!childCount) return [];
  if (
    ratios?.length === childCount &&
    ratios.every((ratio) => Number.isFinite(ratio) && ratio > 0)
  ) {
    return ratios;
  }
  return Array.from({ length: childCount }, () => 1);
}

function inputTypeForField(type: string) {
  if (type === 'DATE') return 'date';
  if (type === 'NUMBER' || type === 'PAIN_SCALE') return 'number';
  if (type === 'EMAIL') return 'email';
  if (type === 'PHONE') return 'tel';
  return 'text';
}

function cssEscape(value: string) {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');
}

function ConsentsSection({
  resourceId,
  refreshKey,
  onNavigate,
  onChanged,
}: {
  resourceId?: string;
  refreshKey: number;
  onNavigate: (
    view: CareView,
    resourceId?: string,
    options?: CareNavigationOptions,
  ) => void;
  onChanged: () => void;
}) {
  const [consents, setConsents] = useState<CareConsentSummaryDTO[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const invalidConsentIdsRef = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    setError(null);
    corePublic<ItemsResponse<CareConsentSummaryDTO>>('/care/consents')
      .then((response) => {
        if (active) setConsents(itemsResponse(response));
      })
      .catch((loadError) => {
        if (active)
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Unable to load consents.',
          );
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (!consents || !resourceId) return;
    const selected = consents.find(
      (item) =>
        item.id === resourceId &&
        !hiddenConsentStatuses.has(item.status ?? ''),
    );
    if (!selected) {
      invalidConsentIdsRef.current.add(resourceId);
      setNotice(t('consentNoLongerAvailable'));
      onNavigate('consents', undefined, { mode: 'replace' });
    }
  }, [consents, onNavigate, resourceId]);

  function openConsent(id: string) {
    setNotice(null);
    onNavigate('consents', id, { mode: 'push' });
  }

  function backToConsents() {
    onNavigate('consents', undefined, { mode: 'replace' });
  }

  function handleUnavailable() {
    if (resourceId) invalidConsentIdsRef.current.add(resourceId);
    setNotice(t('consentNoLongerAvailable'));
    onChanged();
    onNavigate('consents', undefined, { mode: 'replace' });
  }

  function handleSigned() {
    setNotice(t('consentSignedSuccess'));
    onChanged();
    onNavigate('consents', undefined, { mode: 'replace' });
  }

  if (error) return <InlineError message={error} />;
  if (resourceId) {
    if (!consents) {
      return (
        <section className="care-block care-form-completion-shell">
          <ContentLoader label={t('loadingConsent')} />
        </section>
      );
    }
    if (invalidConsentIdsRef.current.has(resourceId)) {
      return (
        <section className="care-block">
          <h2>{t('consents')}</h2>
          <NeutralEmptyState>{t('consentNoLongerAvailable')}</NeutralEmptyState>
        </section>
      );
    }
    const summary = consents.find((item) => item.id === resourceId);
    if (!summary) {
      return (
        <section className="care-block care-form-completion-shell">
          <ContentLoader label={t('loadingConsent')} />
        </section>
      );
    }
    return (
      <CareConsentCompletionView
        assignmentId={resourceId}
        summary={summary}
        onBack={backToConsents}
        onSigned={handleSigned}
        onUnavailable={handleUnavailable}
      />
    );
  }

  if (!consents) return <ContentLoader label={t('loadingConsentList')} />;
  const visibleConsents = consents.filter(
    (item) => !hiddenConsentStatuses.has(item.status ?? ''),
  );
  const pending = visibleConsents.filter((item) =>
    pendingConsentStatuses.has(item.status ?? ''),
  );
  const completed = visibleConsents.filter(
    (item) => !pendingConsentStatuses.has(item.status ?? ''),
  );
  const hasVisibleConsents = pending.length || completed.length;

  return (
    <section className="care-block care-consents-landing">
      <h2>{t('consents')}</h2>
      {notice ? (
        <div className="notice success care-dismissible-notice" role="status">
          <span>{notice}</span>
          <button
            type="button"
            aria-label={t('dismissFormMessage')}
            className="care-notice-close"
            onClick={() => setNotice(null)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {hasVisibleConsents ? (
        <>
          <CareConsentsGroup
            title={t('needsSignature')}
            items={pending}
            onOpen={openConsent}
          />
          <CareConsentsGroup
            title={t('signedOrUnavailable')}
            items={completed}
            onOpen={openConsent}
          />
        </>
      ) : (
        <NeutralEmptyState>{t('noConsents')}</NeutralEmptyState>
      )}
    </section>
  );
}

function CareConsentCompletionView({
  assignmentId,
  summary,
  onBack,
  onSigned,
  onUnavailable,
}: {
  assignmentId: string;
  summary: CareConsentSummaryDTO;
  onBack: () => void;
  onSigned: () => void;
  onUnavailable: () => void;
}) {
  return (
    <section className="care-block care-form-completion-shell">
      <button
        type="button"
        aria-label={t('backToConsents')}
        className="care-form-back"
        onClick={onBack}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {t('consents')}
      </button>
      <ConsentFlow
        assignmentId={assignmentId}
        fallbackTitle={summary.title}
        onSigned={onSigned}
        onUnavailable={onUnavailable}
      />
    </section>
  );
}

function ConsentFlow({
  assignmentId,
  fallbackTitle,
  onSigned,
  onUnavailable,
}: {
  assignmentId: string;
  fallbackTitle?: string;
  onSigned: () => void;
  onUnavailable: () => void;
}) {
  const [consent, setConsent] = useState<PublicConsentDTO | null>(null);
  const [signatures, setSignatures] = useState<Record<string, SignatureAnswer>>(
    {},
  );
  const [acknowledgements, setAcknowledgements] = useState<
    Record<string, boolean>
  >({});
  const [signatureErrors, setSignatureErrors] = useState<Record<string, string>>(
    {},
  );
  const [acknowledgementErrors, setAcknowledgementErrors] = useState<
    Record<string, string>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onUnavailableRef = useRef(onUnavailable);

  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  useEffect(() => {
    let active = true;
    setConsent(null);
    setError(null);
    setSignatures({});
    setSignatureErrors({});
    setAcknowledgementErrors({});
    setAcknowledgements({});
    corePublic<PublicConsentDTO>(
      `/care/consents/${encodeURIComponent(assignmentId)}`,
    )
      .then((data) => {
        if (active) setConsent(data);
      })
      .catch(() => {
        if (active) onUnavailableRef.current();
      });
    return () => {
      active = false;
    };
  }, [assignmentId]);

  if (!consent) {
    return error ? (
      <InlineError message={error} />
    ) : (
      <ContentLoader label={t('loadingConsent')} />
    );
  }
  const document = normalizeConsentDocument(consent.documentSchema);
  const signatureBlocks = consentSignatureBlocks(document);
  const acknowledgementBlocks = consentAcknowledgementBlocks(document);
  const signedSignatureValues = consentSignatureValues(consent, signatureBlocks);
  const signedAcknowledgementValues = consentAcknowledgementValues(consent);
  const consentSignature = consentSignatureAnswer(consent);
  if (!consent.open && (hasSignatureValues(signedSignatureValues) || consentSignature))
    return (
      <div className="care-form-flow">
        <div className="notice success">{t('signed')}</div>
        <div className="care-form-title">
          <h2>{consent.title ?? fallbackTitle ?? t('consent')}</h2>
        </div>
        {signatureBlocks.length ? (
          <ConsentDocumentSections
            document={document}
            signatureValues={signedSignatureValues}
            acknowledgementValues={signedAcknowledgementValues}
            readOnly
            onSignatureChange={() => undefined}
            onAcknowledgementChange={() => undefined}
          />
        ) : (
          <SignatureField
            field={{
              id: 'consent-signature',
              type: 'SIGNATURE',
              label: t('signature'),
              required: true,
            }}
            value={consentSignature}
            readOnly
            onChange={() => undefined}
          />
        )}
      </div>
    );
  if (!consent.open)
    return (
      <NeutralEmptyState>
        {completedText(consent.closedReason, t('consentNoLongerAvailable'))}
      </NeutralEmptyState>
    );

  const legacyRequired =
    acknowledgementBlocks.length
      ? []
      : ((consent.requiredAcknowledgements as
          | Array<{ id?: string; label?: string }>
          | undefined) ?? []);
  async function sign() {
    const missingSignatures = signatureBlocks.filter(
      (block) => block.required !== false && !isSignatureComplete(signatures[block.id]),
    );
    const nextSignatureErrors = Object.fromEntries(
      missingSignatures.map((block) => [
        block.id,
        'Please complete the signing details.',
      ]),
    );
    const missingAcknowledgements = acknowledgementBlocks.filter(
      (block) => block.required !== false && acknowledgements[block.id] !== true,
    );
    const nextAcknowledgementErrors = Object.fromEntries(
      missingAcknowledgements.map((block) => [
        block.id,
        'Please complete the required acknowledgement.',
      ]),
    );
    if (
      missingSignatures.length ||
      missingAcknowledgements.length
    ) {
      setError(null);
      setSignatureErrors(nextSignatureErrors);
      setAcknowledgementErrors(nextAcknowledgementErrors);
      return;
    }
    setSignatureErrors({});
    setAcknowledgementErrors({});
    if (
      legacyRequired.some(
        (ack, index) => acknowledgements[ack.id ?? `ack-${index}`] !== true,
      )
    ) {
      setError('Please complete the required acknowledgements.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await corePublic(
        `/care/consents/${encodeURIComponent(assignmentId)}/sign`,
        {
          method: 'POST',
          body: JSON.stringify({
            acknowledgements,
            signatures: Object.fromEntries(
              signatureBlocks
                .filter((block) => isSignatureComplete(signatures[block.id]))
                .map((block) => [
                  block.id,
                  submissionSignatureValue(signatures[block.id]),
                ]),
            ),
          }),
        },
      );
      onSigned();
    } catch (signError) {
      setError(
        signError instanceof Error
          ? signError.message
          : 'Unable to sign this consent.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="care-form-flow">
      <div className="care-form-title">
        <h2>{consent.title ?? fallbackTitle ?? t('consent')}</h2>
        {consent.expiresAt ? (
          <p className="muted">Expires {formatClinicDate(consent.expiresAt)}</p>
        ) : null}
      </div>
      <ConsentDocumentSections
        document={document}
        signatureValues={signatures}
        signatureErrors={signatureErrors}
        acknowledgementValues={acknowledgements}
        acknowledgementErrors={acknowledgementErrors}
        readOnly={false}
        onSignatureChange={(blockId, value) => {
          setSignatureErrors((current) => {
            const next = { ...current };
            delete next[blockId];
            return next;
          });
          setSignatures((current) => ({
            ...current,
            [blockId]:
              signatureAnswer(value) ?? {
                method: 'DRAWN',
                drawing: { strokes: [] },
            },
          }));
        }}
        onAcknowledgementChange={(blockId, value) => {
          setAcknowledgementErrors((current) => {
            const next = { ...current };
            delete next[blockId];
            return next;
          });
          setAcknowledgements((current) => ({
            ...current,
            [blockId]: value,
          }));
        }}
      />
      {legacyRequired.length ? (
        <div className="choice-stack">
          {legacyRequired.map((ack, index) => {
            const id = ack.id ?? `ack-${index}`;
            return (
              <label key={id} className="checkbox-card">
                <input
                  type="checkbox"
                  checked={acknowledgements[id] === true}
                  onChange={(event) =>
                    setAcknowledgements((current) => ({
                      ...current,
                      [id]: event.target.checked,
                    }))
                  }
                />
                <span>{ack.label ?? 'I acknowledge this item.'}</span>
              </label>
            );
          })}
        </div>
      ) : null}
      {error ? <InlineError message={error} /> : null}
      <button type="button" disabled={busy} onClick={sign}>
        <Send size={16} />
        Sign consent
      </button>
    </div>
  );
}

function CareConsentsGroup({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: CareConsentSummaryDTO[];
  onOpen: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="care-task-group care-form-group">
      <h3>{title}</h3>
      <div className="care-list">
        {items.map((item) => (
          <CareConsentCard key={item.id} consent={item} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function ConsentDocumentSections({
  document,
  signatureValues = {},
  signatureErrors = {},
  acknowledgementValues = {},
  acknowledgementErrors = {},
  readOnly = true,
  onSignatureChange,
  onAcknowledgementChange,
}: {
  document: unknown;
  signatureValues?: Record<string, unknown>;
  signatureErrors?: Record<string, string>;
  acknowledgementValues?: Record<string, boolean>;
  acknowledgementErrors?: Record<string, string>;
  readOnly?: boolean;
  onSignatureChange?: (blockId: string, value: unknown) => void;
  onAcknowledgementChange?: (blockId: string, value: boolean) => void;
}) {
  const sections =
    document && typeof document === 'object' && 'sections' in document
      ? (document as ConsentDocument).sections
      : normalizeConsentDocument(document).sections;
  if (!sections.length) return null;
  return (
    <>
      {sections.map((section) => (
        <section
          key={section.id}
          className="document-section consent-document-section"
        >
          {section.title ? (
            <div className="document-section-heading">
              <h3>{section.title}</h3>
              {section.description ? (
                <p className="document-section-description">
                  {section.description}
                </p>
              ) : null}
            </div>
          ) : null}
          {section.blocks.length ? (
            <div className="document-fields">
              {section.blocks.map((block) => (
                <ConsentDocumentBlock
                  key={block.id}
                  block={block}
                  signatureValues={signatureValues}
                  signatureErrors={signatureErrors}
                  acknowledgementValues={acknowledgementValues}
                  acknowledgementErrors={acknowledgementErrors}
                  readOnly={readOnly}
                  onSignatureChange={onSignatureChange}
                  onAcknowledgementChange={onAcknowledgementChange}
                />
              ))}
            </div>
          ) : null}
        </section>
      ))}
    </>
  );
}

function ConsentDocumentBlock({
  block,
  signatureValues,
  signatureErrors,
  acknowledgementValues,
  acknowledgementErrors,
  readOnly,
  onSignatureChange,
  onAcknowledgementChange,
}: {
  block: ConsentBlock;
  signatureValues: Record<string, unknown>;
  signatureErrors: Record<string, string>;
  acknowledgementValues: Record<string, boolean>;
  acknowledgementErrors: Record<string, string>;
  readOnly: boolean;
  onSignatureChange?: (blockId: string, value: unknown) => void;
  onAcknowledgementChange?: (blockId: string, value: boolean) => void;
}) {
  if (block.type === 'COLUMNS') {
    const children = (block.children ?? []).filter(consentContentBlock);
    const ratios =
      block.ratios?.length === children.length
        ? block.ratios
        : children.length === 3
          ? [1, 1, 1]
          : [1, 1];
    if (!children.length) return null;
    return (
      <div
        className="document-field care-form-columns"
        style={
          {
            '--care-form-columns-template': ratios
              .map((ratio) => `minmax(0, ${ratio}fr)`)
              .join(' '),
          } as CSSProperties
        }
      >
        {children.map((child) => (
          <ConsentDocumentBlock
            key={child.id}
            block={child}
            signatureValues={signatureValues}
            signatureErrors={signatureErrors}
            acknowledgementValues={acknowledgementValues}
            acknowledgementErrors={acknowledgementErrors}
            readOnly={readOnly}
            onSignatureChange={onSignatureChange}
            onAcknowledgementChange={onAcknowledgementChange}
          />
        ))}
      </div>
    );
  }
  if (!consentContentBlock(block)) return null;
  return (
    <div className="document-field care-form-information">
      {block.type === 'HEADING' ? (
        <h4>{block.content || block.label}</h4>
      ) : block.type === 'PARAGRAPH' ? (
        <p>{block.content || block.label}</p>
      ) : block.type === 'RICH_TEXT' ? (
        <SafeRichText html={block.content ?? ''} />
      ) : block.type === 'DIVIDER' ? (
        <hr className="consent-document-divider" />
      ) : block.type === 'ACKNOWLEDGEMENT' ? (
        <ConsentAcknowledgementBlock
          block={block}
          checked={acknowledgementValues[block.id] === true}
          error={acknowledgementErrors[block.id]}
          readOnly={readOnly}
          onChange={(value) => onAcknowledgementChange?.(block.id, value)}
        />
      ) : block.type === 'SIGNATURE' ? (
        <SignatureField
          field={{
            id: block.id,
            type: 'SIGNATURE',
            label: block.label || t('signature'),
            required: block.required !== false,
          }}
          value={signatureValues[block.id]}
          error={signatureErrors[block.id]}
          readOnly={readOnly}
          onChange={(value) => onSignatureChange?.(block.id, value)}
        />
      ) : null}
    </div>
  );
}

function ConsentAcknowledgementBlock({
  block,
  checked,
  error,
  readOnly,
  onChange,
}: {
  block: ConsentBlock;
  checked: boolean;
  error?: string;
  readOnly: boolean;
  onChange: (value: boolean) => void;
}) {
  const inputId = `care-consent-ack-${block.id}`;
  const errorId = error ? `${inputId}-error` : undefined;
  const label = block.content || block.label || 'I acknowledge this item.';

  if (readOnly) {
    return (
      <div className="checkbox-card consent-acknowledgement-block read-only">
        <input type="checkbox" checked={checked} disabled readOnly />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <label
      className="checkbox-card consent-acknowledgement-block"
      data-invalid={error ? true : undefined}
      htmlFor={inputId}
    >
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        {label}
        {block.required !== false ? ' *' : ''}
      </span>
      {error ? (
        <small className="field-error" id={errorId}>
          {error}
        </small>
      ) : null}
    </label>
  );
}

function normalizeConsentDocument(value: unknown): ConsentDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { sections: [] };
  }
  const sections = (value as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return { sections: [] };
  return {
    sections: sections
      .map((section, sectionIndex): ConsentSection | null => {
        if (!section || typeof section !== 'object' || Array.isArray(section)) {
          return null;
        }
        const raw = section as {
          id?: unknown;
          title?: unknown;
          description?: unknown;
          blocks?: unknown;
        };
        const normalized: ConsentSection = {
          id: stringValue(raw.id) ?? `section-${sectionIndex + 1}`,
          title: stringValue(raw.title) ?? `Section ${sectionIndex + 1}`,
          blocks: Array.isArray(raw.blocks) ? normalizeConsentBlocks(raw.blocks) : [],
        };
        const description = stringValue(raw.description);
        if (description) normalized.description = description;
        return normalized;
      })
      .filter((section): section is ConsentSection => Boolean(section)),
  };
}

function normalizeConsentBlocks(value: unknown[]): ConsentBlock[] {
  return value
    .map((block, blockIndex): ConsentBlock | null => {
      if (!block || typeof block !== 'object' || Array.isArray(block)) {
        return null;
      }
      const raw = block as {
        id?: unknown;
        type?: unknown;
        label?: unknown;
        content?: unknown;
        required?: unknown;
        ratios?: unknown;
        children?: unknown;
      };
      const type = stringValue(raw.type)?.toUpperCase() as
        | ConsentBlockType
        | undefined;
      if (
        !type ||
        ![
          'COLUMNS',
          'HEADING',
          'PARAGRAPH',
          'RICH_TEXT',
          'DIVIDER',
          'ACKNOWLEDGEMENT',
          'SIGNATURE',
        ].includes(type)
      ) {
        return null;
      }
      const normalized: ConsentBlock = {
        id: stringValue(raw.id) ?? `block-${blockIndex + 1}`,
        type,
        label: stringValue(raw.label) ?? typeLabel(type),
      };
      if (raw.content != null) normalized.content = String(raw.content);
      if (type === 'ACKNOWLEDGEMENT') {
        normalized.required = raw.required !== false;
      }
      if (type === 'COLUMNS') {
        normalized.ratios = Array.isArray(raw.ratios)
          ? raw.ratios.filter(
              (ratio): ratio is number => typeof ratio === 'number',
            )
          : undefined;
        normalized.children = Array.isArray(raw.children)
          ? normalizeConsentBlocks(raw.children)
          : [];
      }
      return normalized;
    })
    .filter((block): block is ConsentBlock => Boolean(block));
}

function consentContentBlock(block: ConsentBlock) {
  return [
    'COLUMNS',
    'HEADING',
    'PARAGRAPH',
    'RICH_TEXT',
    'DIVIDER',
    'ACKNOWLEDGEMENT',
    'SIGNATURE',
  ].includes(block.type);
}

function typeLabel(type: ConsentBlockType) {
  return type
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^./, (char) => char.toUpperCase());
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function CareConsentCard({
  consent,
  onOpen,
}: {
  consent: CareConsentSummaryDTO;
  onOpen: (id: string) => void;
}) {
  if (!consent.id) return null;
  const pending = pendingConsentStatuses.has(consent.status ?? '');
  const statusLabel = pending
    ? t('reviewAndSign')
    : expiredConsentStatuses.has(consent.status ?? '')
      ? t('expired')
      : withdrawnConsentStatuses.has(consent.status ?? '')
        ? t('withdrawnByClinic')
        : completedConsentStatuses.has(consent.status ?? '')
          ? t('signed')
          : t('noLongerAvailable');
  const context = taskContext(
    consent.appointmentId,
    undefined,
    consent.expiresAt,
  );

  return (
    <button
      type="button"
      className="care-list-item care-form-card care-consent-card"
      onClick={() => consent.id && onOpen(consent.id)}
    >
      <span>
        <strong>{consent.title ?? t('consent')}</strong>
        {context ? <small>{context}</small> : null}
        <small className={pending ? undefined : 'care-list-status'}>
          {statusLabel}
        </small>
      </span>
      <ArrowRight size={16} aria-hidden="true" />
    </button>
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
    corePublic<ItemsResponse<CareDocumentDTO>>('/care/documents')
      .then((response) => {
        if (active) setDocuments(itemsResponse(response));
      })
      .catch((loadError) => {
        if (active)
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Unable to load documents.',
          );
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  async function download(documentId: string) {
    setError(null);
    try {
      const result = await corePublic<{ downloadUrl?: string }>(
        `/care/documents/${encodeURIComponent(documentId)}/download`,
      );
      if (result.downloadUrl) window.location.assign(result.downloadUrl);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : 'Unable to download this document.',
      );
    }
  }

  if (error) return <InlineError message={error} />;
  if (!documents) return <ContentLoader label={t('loadingDocumentList')} />;
  const selected = documents.find((item) => item.id === resourceId);

  return (
    <div className="care-two-column">
      <section className="care-block">
        <h2>Documents</h2>
        <DocumentList
          documents={documents}
          activeId={resourceId}
          onOpen={(id) => onNavigate('documents', id)}
        />
      </section>
      <section className="care-block">
        <h2>Document details</h2>
        {resourceId && !selected ? (
          <InlineError message="That document is not available in this Care Page." />
        ) : null}
        {selected ? (
          <div className="care-detail">
            <strong>
              {selected.title ?? selected.originalFilename ?? 'Document'}
            </strong>
            {selected.description ? (
              <p className="muted">{selected.description}</p>
            ) : null}
            <p className="muted">
              {selected.documentDate
                ? formatClinicDate(selected.documentDate)
                : selected.category}
            </p>
            <button
              type="button"
              onClick={() => selected.id && download(selected.id)}
            >
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
  return (
    <EmptyState>Payments are not available for this clinic yet.</EmptyState>
  );
}

function PendingTaskRow({
  task,
  onOpen,
}: {
  task: PendingTask;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="care-list-item care-task-row"
      onClick={onOpen}
    >
      <span>
        <small className="care-task-type">{task.typeLabel}</small>
        <strong>{task.title}</strong>
        {task.context ? <small>{task.context}</small> : null}
      </span>
      <strong className="care-row-action">{task.actionLabel}</strong>
      <ArrowRight size={16} />
    </button>
  );
}

function OverviewAppointmentCard({
  appointment,
  onOpen,
}: {
  appointment: ManagedAppointmentResponseDTO;
  onOpen: () => void;
}) {
  const locationLabel = appointmentLocationLabel(appointment);
  const practitioner = practitionerDisplayName(appointment);
  const status = getPatientVisibleAppointmentStatus(appointment.status);

  return (
    <button
      type="button"
      className="care-list-item care-appointment-card"
      onClick={onOpen}
    >
      <span className="care-appointment-main">
        <strong className="care-appointment-title">
          {appointment.service?.name ?? t('appointmentFallback')}
        </strong>
        {appointment.startAt ? (
          <small className="care-appointment-time">{`${formatClinicDate(appointment.startAt, appointment, 'long')} - ${formatClinicTime(appointment.startAt, appointment)}`}</small>
        ) : null}
        {practitioner ? (
          <small>{t('withPractitioner', { practitioner })}</small>
        ) : null}
        {locationLabel ? <small>{locationLabel}</small> : null}
      </span>
      <span className="care-row-side">
        {status ? <span className="care-status-pill">{status}</span> : null}
        <ArrowRight size={16} aria-hidden="true" />
      </span>
    </button>
  );
}

function OverviewDocumentList({
  documents,
  onOpen,
}: {
  documents: CareDocumentDTO[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="care-list">
      {documents.map((document) => (
        <OverviewDocumentRow
          key={document.id}
          document={document}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function OverviewDocumentRow({
  document,
  onOpen,
}: {
  document: CareDocumentDTO;
  onOpen: (id: string) => void;
}) {
  const meta = documentMeta(document);
  return (
    <button
      type="button"
      className="care-list-item care-document-row"
      onClick={() => document.id && onOpen(document.id)}
    >
      <span>
        <strong>
          {document.title ?? document.originalFilename ?? t('documentFallback')}
        </strong>
        {meta ? <small>{meta}</small> : null}
      </span>
      <ArrowRight size={16} />
    </button>
  );
}

function overviewTasks(overview: CareOverviewDTO): PendingTask[] {
  const nextAppointmentId = overview.nextAppointment?.id;
  return [
    ...(overview.pendingForms ?? [])
      .filter((form) => form.id && pendingFormStatuses.has(form.status ?? ''))
      .map((form): PendingTask => ({
        id: form.id!,
        view: 'forms',
        typeLabel: t('form'),
        title: formDisplayTitle(form as CareFormTitleSource, t('form')),
        actionLabel: t('completeForm'),
        context: taskContext(
          form.appointmentId,
          nextAppointmentId,
          form.dueAt ?? form.assignedAt,
        ),
        appointmentId: form.appointmentId,
        orderAt: form.dueAt ?? form.assignedAt,
      })),
    ...(overview.pendingConsents ?? [])
      .filter(
        (consent) =>
          consent.id && pendingConsentStatuses.has(consent.status ?? ''),
      )
      .map((consent): PendingTask => ({
        id: consent.id!,
        view: 'consents',
        typeLabel: t('consent'),
        title: consent.title ?? t('consent'),
        actionLabel: t('reviewAndSign'),
        context: taskContext(
          consent.appointmentId,
          nextAppointmentId,
          consent.expiresAt,
        ),
        appointmentId: consent.appointmentId,
        orderAt: consent.expiresAt ?? consent.requestedAt,
      })),
  ].sort((left, right) => {
    const leftForNext =
      left.appointmentId && left.appointmentId === nextAppointmentId ? 0 : 1;
    const rightForNext =
      right.appointmentId && right.appointmentId === nextAppointmentId ? 0 : 1;
    if (leftForNext !== rightForNext) return leftForNext - rightForNext;
    return timestamp(left.orderAt) - timestamp(right.orderAt);
  });
}

function taskContext(
  appointmentId?: string,
  nextAppointmentId?: string,
  date?: string,
) {
  if (appointmentId && appointmentId === nextAppointmentId)
    return t('forNextAppointment');
  if (date) return t('dueDate', { date: formatClinicDate(date) });
  return undefined;
}

function timestamp(value?: string) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function practitionerDisplayName(appointment: ManagedAppointmentResponseDTO) {
  const practitioner = appointment.practitioner;
  if (!practitioner) return '';
  return (
    practitioner.displayName?.trim() ||
    [practitioner.prefix, practitioner.firstName, practitioner.lastName]
      .filter(Boolean)
      .join(' ')
      .trim()
  );
}

function appointmentLocationLabel(appointment: ManagedAppointmentResponseDTO) {
  if (
    appointment.deliveryMode === 'VIRTUAL' ||
    appointment.location?.type === 'VIRTUAL'
  )
    return t('virtualAppointment');
  return (
    appointment.location?.publicDisplayName?.trim() ||
    appointment.location?.name?.trim() ||
    ''
  );
}

function documentMeta(document: CareDocumentDTO) {
  const date = document.documentDate ?? document.createdAt;
  return [
    date ? formatClinicDate(date) : null,
    document.category ?? document.contentType,
  ]
    .filter(Boolean)
    .join(' - ');
}

function getPatientVisibleAppointmentStatus(status?: string | null) {
  switch (status) {
    case 'SCHEDULED':
    case undefined:
    case null:
      return '';
    case 'PENDING_CONFIRMATION':
      return t('appointmentStatusPendingConfirmation');
    case 'PENDING_RESCHEDULE_CONFIRMATION':
      return t('appointmentStatusPendingRescheduleConfirmation');
    case 'CONFIRMED':
      return t('appointmentStatusConfirmed');
    case 'CHECKED_IN':
      return t('appointmentStatusCheckedIn');
    case 'CANCELLED':
      return t('appointmentStatusCancelled');
    case 'COMPLETED':
      return t('appointmentStatusCompleted');
    case 'NO_SHOW':
      return t('appointmentStatusNoShow');
    default:
      return humanizeStatus(status);
  }
}

type AppointmentGroups = {
  upcoming: ManagedAppointmentResponseDTO[];
  past: ManagedAppointmentResponseDTO[];
};

const terminalAppointmentStatuses = new Set([
  'CANCELLED',
  'COMPLETED',
  'NO_SHOW',
]);

function groupAppointments(
  appointments: ManagedAppointmentResponseDTO[],
  now = new Date(),
): AppointmentGroups {
  const nowTime = now.getTime();
  const upcoming = appointments
    .filter((appointment) => isUpcomingAppointment(appointment, nowTime))
    .sort((left, right) => appointmentTime(left) - appointmentTime(right));
  const past = appointments
    .filter((appointment) => !isUpcomingAppointment(appointment, nowTime))
    .sort((left, right) => appointmentTime(right) - appointmentTime(left));
  return { upcoming, past };
}

function isUpcomingAppointment(
  appointment: ManagedAppointmentResponseDTO,
  nowTime: number,
) {
  if (
    !appointment.startAt ||
    terminalAppointmentStatuses.has(appointment.status ?? '')
  )
    return false;
  return appointmentTime(appointment) >= nowTime;
}

function appointmentTime(appointment: ManagedAppointmentResponseDTO) {
  return timestamp(appointment.startAt);
}

function relevantAppointment(groups: AppointmentGroups) {
  return groups.upcoming[0] ?? groups.past[0] ?? null;
}

function getDefaultDesktopAppointment(
  groups: AppointmentGroups,
  excludedIds = new Set<string>(),
) {
  return relevantAppointment({
    upcoming: groups.upcoming.filter(
      (appointment) => !appointment.id || !excludedIds.has(appointment.id),
    ),
    past: groups.past.filter(
      (appointment) => !appointment.id || !excludedIds.has(appointment.id),
    ),
  });
}

function appointmentTitle(appointment: ManagedAppointmentResponseDTO) {
  return appointment.service?.name ?? t('appointmentFallback');
}

function appointmentAddress(appointment: ManagedAppointmentResponseDTO) {
  const address = appointment.location?.address;
  return [
    address?.addressLine1,
    address?.addressLine2,
    [address?.city, address?.stateOrRegion, address?.postalCode]
      .filter(Boolean)
      .join(', '),
    address?.countryCode,
  ]
    .filter(Boolean)
    .join('\n');
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function buildRescheduleDays(
  settings: ManagedAppointmentResponseDTO,
  count: number,
) {
  return Array.from({ length: count }).map((_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + index);
    const key = toDateKey(date);
    return {
      key,
      weekday: new Intl.DateTimeFormat(careLocale(), {
        weekday: 'short',
      }).format(date),
      label: formatClinicDate(`${key}T00:00:00`, settings),
    };
  });
}

type RescheduleDay = ReturnType<typeof buildRescheduleDays>[number];
type RescheduleAvailabilityGroup =
  | { type: 'slots'; day: RescheduleDay; slots: AvailabilitySlotResponseDTO[] }
  | { type: 'empty'; start: RescheduleDay; end: RescheduleDay };

function slotDateKey(slot: AvailabilitySlotResponseDTO) {
  return slot.startAt?.slice(0, 10);
}

function mergeAvailabilitySlots(
  current: AvailabilitySlotResponseDTO[],
  incoming: AvailabilitySlotResponseDTO[],
) {
  const merged = new Map<string, AvailabilitySlotResponseDTO>();
  [...current, ...incoming].forEach((slot) => {
    if (!slot.startAt) return;
    merged.set(
      `${slot.locationId ?? ''}:${slot.employeeId ?? ''}:${slot.startAt}`,
      slot,
    );
  });
  return Array.from(merged.values()).sort((left, right) =>
    String(left.startAt).localeCompare(String(right.startAt)),
  );
}

function groupRescheduleAvailability(
  days: RescheduleDay[],
  slotsByDate: Map<string, AvailabilitySlotResponseDTO[]>,
): RescheduleAvailabilityGroup[] {
  const groups: RescheduleAvailabilityGroup[] = [];
  let emptyStart: RescheduleDay | null = null;
  let emptyEnd: RescheduleDay | null = null;

  days.forEach((day, index) => {
    if (index === INITIAL_RESCHEDULE_DAY_COUNT && emptyStart && emptyEnd) {
      groups.push({ type: 'empty', start: emptyStart, end: emptyEnd });
      emptyStart = null;
      emptyEnd = null;
    }
    const daySlots = slotsByDate.get(day.key) ?? [];
    if (daySlots.length) {
      if (emptyStart && emptyEnd)
        groups.push({ type: 'empty', start: emptyStart, end: emptyEnd });
      emptyStart = null;
      emptyEnd = null;
      groups.push({ type: 'slots', day, slots: daySlots });
      return;
    }
    emptyStart ??= day;
    emptyEnd = day;
  });

  if (emptyStart && emptyEnd)
    groups.push({ type: 'empty', start: emptyStart, end: emptyEnd });
  return groups;
}

function rescheduleDayLabel(day: RescheduleDay) {
  return `${day.weekday}, ${day.label}`;
}

function rescheduleDayRangeLabel(start: RescheduleDay, end: RescheduleDay) {
  return start.key === end.key
    ? rescheduleDayLabel(start)
    : `${rescheduleDayLabel(start)} - ${rescheduleDayLabel(end)}`;
}

function humanizeStatus(status: string) {
  return status
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function useNarrowCareViewport() {
  const [narrow, setNarrow] = useState<boolean | null>(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(max-width: 640px)').matches
      : null,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      setNarrow(false);
      return undefined;
    }
    const media = window.matchMedia('(max-width: 640px)');
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => {
      media.removeEventListener?.('change', update);
    };
  }, []);

  return narrow;
}

function AppointmentGroup({
  title,
  appointments,
  activeId,
  onOpen,
  onButtonRef,
}: {
  title: string;
  appointments: ManagedAppointmentResponseDTO[];
  activeId?: string;
  onOpen: (id: string) => void;
  onButtonRef?: (id: string, node: HTMLButtonElement | null) => void;
}) {
  if (!appointments.length) return null;
  return (
    <div className="care-appointment-group">
      <h3>{title}</h3>
      <div className="care-list">
        {appointments.map((appointment) => (
          <AppointmentCard
            key={appointment.id}
            appointment={appointment}
            active={appointment.id === activeId}
            onOpen={() => appointment.id && onOpen(appointment.id)}
            buttonRef={(node) => {
              if (appointment.id) onButtonRef?.(appointment.id, node);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function AppointmentCard({
  appointment,
  active,
  onOpen,
  buttonRef,
}: {
  appointment: ManagedAppointmentResponseDTO;
  active?: boolean;
  onOpen: () => void;
  buttonRef?: (node: HTMLButtonElement | null) => void;
}) {
  const status = getPatientVisibleAppointmentStatus(appointment.status);
  return (
    <button
      type="button"
      aria-current={active ? 'true' : undefined}
      className={
        active
          ? 'care-list-item care-appointment-list-card active'
          : 'care-list-item care-appointment-list-card'
      }
      onClick={onOpen}
      ref={buttonRef}
    >
      <span>
        <strong>{appointmentTitle(appointment)}</strong>
        {appointment.startAt ? (
          <small>
            {formatClinicDateTime(appointment.startAt, appointment)}
          </small>
        ) : null}
        {status ? <small className="care-list-status">{status}</small> : null}
      </span>
      <ArrowRight size={16} aria-hidden="true" />
    </button>
  );
}

function AppointmentFacts({
  appointment,
}: {
  appointment: ManagedAppointmentResponseDTO;
}) {
  const location = appointment.location;
  const address = appointmentAddress(appointment);
  const status = getPatientVisibleAppointmentStatus(appointment.status);
  const locationName = appointmentLocationLabel(appointment);
  const practitioner = practitionerDisplayName(appointment);
  const duration =
    appointment.durationMinutes ?? appointment.service?.durationMinutes;

  return (
    <div className="care-facts care-appointment-summary">
      <div className="care-appointment-summary-head">
        <div>
          <h3>{appointmentTitle(appointment)}</h3>
          {appointment.startAt ? (
            <>
              <p className="care-summary-date">
                {formatClinicDate(
                  appointment.startAt,
                  {
                    ...appointment,
                    timezone: location?.timezone || appointment.timezone,
                  },
                  'long',
                )}
              </p>
              <p className="care-summary-time">
                {formatClinicTime(appointment.startAt, {
                  ...appointment,
                  timezone: location?.timezone || appointment.timezone,
                })}
              </p>
            </>
          ) : null}
        </div>
        {status ? <span className="care-status-pill">{status}</span> : null}
      </div>
      <dl className="care-fact-list">
        {practitioner ? (
          <FactRow label={t('practitioner')} value={practitioner} />
        ) : null}
        {locationName ? (
          <FactRow label={t('location')} value={locationName} />
        ) : null}
        {address ? <FactRow label={t('address')} value={address} /> : null}
        {duration ? (
          <FactRow
            label={t('duration')}
            value={t('durationMinutes', { count: duration })}
          />
        ) : null}
      </dl>
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="care-fact-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function MobileAppointmentRescheduleView({
  appointment,
  onBack,
  onSubmit,
  onSuccess,
}: {
  appointment: ManagedAppointmentResponseDTO | null;
  onBack: () => void;
  onSubmit: (slot: AvailabilitySlotResponseDTO) => Promise<void>;
  onSuccess: () => void;
}) {
  return (
    <section className="care-block care-mobile-reschedule-page">
      <button
        type="button"
        aria-label={t('backToAppointmentDetails')}
        className="care-mobile-back"
        onClick={onBack}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {t('appointmentDetails')}
      </button>
      <AppointmentRescheduleFlow
        appointment={appointment}
        onCancel={onBack}
        onSubmit={onSubmit}
        onSuccess={onSuccess}
      />
    </section>
  );
}

function CancelAppointmentDialog({
  busy,
  error,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    requestAnimationFrame(() => {
      const focusTarget = dialogRef.current?.querySelector<HTMLElement>(
        'button:not([disabled])',
      );
      focusTarget?.focus({ preventScroll: true });
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busy) onClose();
        return;
      }
      const dialog = dialogRef.current;
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus({ preventScroll: true });
    };
  }, [busy, onClose]);

  return (
    <div
      className="care-dialog-overlay care-cancel-dialog-overlay"
      onMouseDown={() => !busy && onClose()}
    >
      <div
        aria-labelledby="care-cancel-dialog-title"
        aria-describedby="care-cancel-dialog-description"
        aria-modal="true"
        className="care-dialog care-confirm-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <section
          className="care-confirm-content"
          aria-labelledby="care-cancel-dialog-title"
        >
          <header className="care-confirm-header">
            <h2 id="care-cancel-dialog-title">{t('cancelAppointmentTitle')}</h2>
          </header>
          <div
            className="care-confirm-description"
            id="care-cancel-dialog-description"
          >
            <p className="muted">{t('cancelAppointmentDescription')}</p>
            <p className="muted">{t('cancelAppointmentClinicNotified')}</p>
          </div>
          {error ? <InlineError message={error} /> : null}
          <div className="actions care-confirm-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={onClose}
            >
              {t('keepAppointment')}
            </button>
            <button
              type="button"
              className="danger-confirm-action"
              disabled={busy}
              aria-busy={busy}
              onClick={onConfirm}
            >
              {busy ? t('cancellingAppointment') : t('cancelAppointment')}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function AppointmentRescheduleDialog({
  appointment,
  onClose,
  onSubmit,
  onSuccess,
}: {
  appointment: ManagedAppointmentResponseDTO | null;
  onClose: () => void;
  onSubmit: (slot: AvailabilitySlotResponseDTO) => Promise<void>;
  onSuccess: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = dialogRef.current;
    requestAnimationFrame(() => {
      const focusTarget = dialog?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      focusTarget?.focus();
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!dirty) onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus({ preventScroll: true });
    };
  }, [dirty, onClose]);

  return (
    <div
      className="care-dialog-overlay"
      onMouseDown={() => !dirty && onClose()}
    >
      <div
        aria-labelledby="care-reschedule-dialog-title"
        aria-modal="true"
        className="care-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <AppointmentRescheduleFlow
          appointment={appointment}
          titleId="care-reschedule-dialog-title"
          onCancel={onClose}
          onDirtyChange={setDirty}
          onSubmit={onSubmit}
          onSuccess={onSuccess}
        />
      </div>
    </div>
  );
}

function AppointmentRescheduleFlow({
  appointment,
  onCancel,
  onDirtyChange,
  onSubmit,
  onSuccess,
  titleId,
}: {
  appointment: ManagedAppointmentResponseDTO | null;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSubmit: (slot: AvailabilitySlotResponseDTO) => Promise<void>;
  onSuccess: () => void;
  titleId?: string;
}) {
  const [slots, setSlots] = useState<AvailabilitySlotResponseDTO[] | null>(
    null,
  );
  const [selectedSlot, setSelectedSlot] =
    useState<AvailabilitySlotResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [step, setStep] = useState<'choose' | 'confirm'>('choose');
  const [submitting, setSubmitting] = useState(false);
  const [availabilityKey, setAvailabilityKey] = useState(0);
  const [visibleDayCount, setVisibleDayCount] = useState(
    INITIAL_RESCHEDULE_DAY_COUNT,
  );
  const days = useMemo(
    () =>
      appointment
        ? buildRescheduleDays(appointment, MAX_RESCHEDULE_DAY_COUNT)
        : [],
    [appointment],
  );
  const visibleDays = useMemo(
    () => days.slice(0, visibleDayCount),
    [days, visibleDayCount],
  );
  const slotsByDate = useMemo(() => {
    const grouped = new Map<string, AvailabilitySlotResponseDTO[]>();
    (slots ?? []).forEach((slot) => {
      const key = slotDateKey(slot);
      if (!key) return;
      grouped.set(key, [...(grouped.get(key) ?? []), slot]);
    });
    grouped.forEach((dateSlots, key) => {
      grouped.set(
        key,
        dateSlots.sort((left, right) =>
          String(left.startAt).localeCompare(String(right.startAt)),
        ),
      );
    });
    return grouped;
  }, [slots]);
  const availabilityGroups = useMemo(
    () => groupRescheduleAvailability(visibleDays, slotsByDate),
    [visibleDays, slotsByDate],
  );
  const canLoadMoreDays = visibleDayCount < days.length;
  const canLoadAvailability = Boolean(appointment?.id);

  const fetchAvailabilityRange = useCallback(
    async (fromIndex: number, toIndexExclusive: number) => {
      if (!appointment?.id) throw new Error('APPOINTMENT_NOT_RESCHEDULABLE');
      const firstDay = days[fromIndex];
      const lastDay = days[toIndexExclusive - 1];
      if (!firstDay || !lastDay) return [];

      const query = new URLSearchParams({
        from: firstDay.key,
        to: lastDay.key,
      });
      const items = await corePublic<AvailabilitySlotResponseDTO[]>(
        `/care/appointments/${encodeURIComponent(appointment.id)}/availability?${query}`,
      );
      return items.filter((slot) => slot.startAt);
    },
    [appointment?.id, days],
  );

  useEffect(() => {
    onDirtyChange?.(Boolean(selectedSlot) || step !== 'choose');
  }, [onDirtyChange, selectedSlot, step]);

  useEffect(() => {
    setVisibleDayCount(INITIAL_RESCHEDULE_DAY_COUNT);
    setSlots(null);
    setSelectedSlot(null);
    setError(null);
    setLoadMoreError(null);
    setStep('choose');
  }, [appointment?.id]);

  useEffect(() => {
    if (!appointment) return undefined;
    if (!canLoadAvailability || !appointment.id) {
      setSlots([]);
      setError(t('rescheduleUnavailable'));
      return undefined;
    }
    let active = true;
    setLoading(true);
    setError(null);
    setLoadMoreError(null);
    setSelectedSlot(null);
    setStep('choose');

    fetchAvailabilityRange(0, INITIAL_RESCHEDULE_DAY_COUNT)
      .then((items) => {
        if (active) setSlots(items);
      })
      .catch((error) => {
        if (active) {
          setSlots([]);
          setError(
            isRescheduleNoLongerAllowedError(error)
              ? t('rescheduleNoLongerAllowed')
              : t('rescheduleUnavailable'),
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    appointment,
    availabilityKey,
    canLoadAvailability,
    fetchAvailabilityRange,
  ]);

  async function loadMoreAvailability() {
    if (loadingMore || loading || !canLoadMoreDays) return;
    const nextVisibleDayCount = Math.min(
      days.length,
      visibleDayCount + RESCHEDULE_DAY_LOAD_COUNT,
    );
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const items = await fetchAvailabilityRange(
        visibleDayCount,
        nextVisibleDayCount,
      );
      setSlots((current) => mergeAvailabilitySlots(current ?? [], items));
      setVisibleDayCount(nextVisibleDayCount);
    } catch (error) {
      setLoadMoreError(
        isRescheduleNoLongerAllowedError(error)
          ? t('rescheduleNoLongerAllowed')
          : t('rescheduleUnavailable'),
      );
    } finally {
      setLoadingMore(false);
    }
  }

  async function confirmReschedule() {
    if (!selectedSlot?.startAt) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(selectedSlot);
      onSuccess();
    } catch {
      setError(t('rescheduleSlotUnavailable'));
      setSelectedSlot(null);
      setStep('choose');
      setAvailabilityKey((current) => current + 1);
    } finally {
      setSubmitting(false);
    }
  }

  if (!appointment) {
    return (
      <section className="care-reschedule-flow" aria-labelledby={titleId}>
        <h2 id={titleId}>{t('rescheduleAppointment')}</h2>
        <ContentLoader label={t('loadingAppointment')} />
      </section>
    );
  }

  return (
    <section className="care-reschedule-flow" aria-labelledby={titleId}>
      <div className="care-block-heading">
        <h2 id={titleId}>{t('rescheduleAppointment')}</h2>
        <button
          type="button"
          className="care-icon-action"
          aria-label={t('keepCurrentAppointment')}
          disabled={submitting}
          onClick={onCancel}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      {step === 'choose' ? (
        <>
          <div className="reschedule-availability">
            <h3>{t('availableTimes')}</h3>
            {error ? <InlineError message={error} /> : null}
            {loading ? (
              <p className="muted reschedule-empty" aria-live="polite">
                {t('loadingAvailableTimes')}
              </p>
            ) : null}
            {!loading && !error ? (
              <div className="reschedule-day-list">
                {availabilityGroups.map((group, index) => {
                  const groupKey =
                    group.type === 'slots'
                      ? group.day.key
                      : `${group.start.key}-${group.end.key}`;
                  const startsMoreAvailability =
                    index > 0 &&
                    groupKey.startsWith(
                      days[INITIAL_RESCHEDULE_DAY_COUNT]?.key ?? '',
                    );
                  return (
                    <section key={groupKey} className="reschedule-day-section">
                      {startsMoreAvailability ? (
                        <h3 className="reschedule-more-heading">
                          {t('moreAvailability')}
                        </h3>
                      ) : null}
                      {group.type === 'slots' ? (
                        <>
                          <h4>{rescheduleDayLabel(group.day)}</h4>
                          <div className="reschedule-times">
                            {group.slots.map((slot) => (
                              <button
                                key={`${slot.employeeId}-${slot.startAt}`}
                                type="button"
                                className={
                                  selectedSlot?.startAt === slot.startAt &&
                                  selectedSlot?.employeeId === slot.employeeId
                                    ? 'reschedule-time active'
                                    : 'reschedule-time'
                                }
                                aria-pressed={
                                  selectedSlot?.startAt === slot.startAt &&
                                  selectedSlot?.employeeId === slot.employeeId
                                }
                                disabled={submitting}
                                onClick={() => setSelectedSlot(slot)}
                              >
                                {slot.startAt
                                  ? formatClinicTime(slot.startAt, appointment)
                                  : ''}
                              </button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <h4>
                            {rescheduleDayRangeLabel(group.start, group.end)}
                          </h4>
                          <p className="muted reschedule-empty">
                            {t('noAvailableTimes')}
                          </p>
                        </>
                      )}
                    </section>
                  );
                })}
                {canLoadMoreDays && !loadingMore ? (
                  <button
                    type="button"
                    className="care-section-link reschedule-load-more"
                    disabled={submitting}
                    onClick={loadMoreAvailability}
                  >
                    {t('loadMoreAvailability')}
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                ) : null}
                {loadingMore ? (
                  <p
                    className="muted reschedule-empty reschedule-bottom-loader"
                    aria-live="polite"
                  >
                    {t('loadingAvailableTimes')}
                  </p>
                ) : null}
                {loadMoreError ? <InlineError message={loadMoreError} /> : null}
              </div>
            ) : null}
          </div>
          <div className="actions reschedule-flow-actions">
            <button
              type="button"
              className="secondary"
              disabled={submitting}
              onClick={onCancel}
            >
              {t('keepCurrentAppointment')}
            </button>
            <button
              type="button"
              disabled={!selectedSlot?.startAt || submitting}
              onClick={() => setStep('confirm')}
            >
              {t('continue')}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="reschedule-confirmation">
            <h3>{t('selectedTime')}</h3>
            <dl className="reschedule-details">
              {appointment.startAt ? (
                <FactRow
                  label={t('currentTime')}
                  value={formatClinicDateTime(appointment.startAt, appointment)}
                />
              ) : null}
              {selectedSlot?.startAt ? (
                <FactRow
                  label={t('newTime')}
                  value={formatClinicDateTime(
                    selectedSlot.startAt,
                    appointment,
                  )}
                />
              ) : null}
            </dl>
          </div>
          {error ? <InlineError message={error} /> : null}
          <div className="actions reschedule-flow-actions">
            <button
              type="button"
              className="secondary"
              disabled={submitting}
              onClick={() => setStep('choose')}
            >
              {t('chooseAnotherTime')}
            </button>
            <button
              type="button"
              disabled={submitting || !selectedSlot?.startAt}
              onClick={confirmReschedule}
            >
              {t('confirmReschedule')}
            </button>
          </div>
        </>
      )}
    </section>
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
  if (!documents.length)
    return <EmptyState>No documents are available.</EmptyState>;
  return (
    <div className="care-list">
      {documents.map((document) => (
        <button
          type="button"
          className={
            document.id === activeId
              ? 'care-list-item active'
              : 'care-list-item'
          }
          key={document.id}
          onClick={() => document.id && onOpen(document.id)}
        >
          <span>
            <strong>
              {document.title ?? document.originalFilename ?? 'Document'}
            </strong>
            <small>
              {document.documentDate
                ? formatClinicDate(document.documentDate)
                : document.category}
            </small>
          </span>
          <ArrowRight size={16} />
        </button>
      ))}
    </div>
  );
}

function CareFormSchemaNode({
  node,
  answers,
  errors,
  readOnly,
  onChange,
}: {
  node: SchemaNode;
  answers: Answers;
  errors: FieldErrors;
  readOnly: boolean;
  onChange: (fieldId: string, value: unknown) => void;
}) {
  if (isColumnsNode(node)) {
    const children = node.children ?? [];
    const ratios = normalizedColumnRatios(node.ratios, children.length);
    return (
      <div
        className="care-form-columns"
        style={
          {
            '--care-form-columns-template': ratios
              .map((ratio) => `minmax(0, ${ratio}fr)`)
              .join(' '),
          } as CSSProperties
        }
      >
        {children.map((field) => (
          <FieldInput
            key={field.id}
            field={field}
            value={answers[field.id]}
            error={errors[field.id]}
            readOnly={readOnly}
            onChange={(value) => onChange(field.id, value)}
          />
        ))}
      </div>
    );
  }

  return (
    <FieldInput
      field={node}
      value={answers[node.id]}
      error={errors[node.id]}
      readOnly={readOnly}
      onChange={(value) => onChange(node.id, value)}
    />
  );
}

function FieldInput({
  field,
  value,
  error,
  readOnly = false,
  onChange,
}: {
  field: Field;
  value: unknown;
  error?: string;
  readOnly?: boolean;
  onChange: (value: unknown) => void;
}) {
  const label = formTemplateText(field.label) || 'Field';
  const inputId = `care-form-field-${field.id}`;
  const labelId = `${inputId}-label`;
  const descriptionId = field.description
    ? `${inputId}-description`
    : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy =
    [descriptionId, errorId].filter(Boolean).join(' ') || undefined;
  const description = formTemplateText(field.description);
  if (field.type === 'INFORMATION') {
    const informationHtml = informationFieldContent(field, description, label);
    if (!informationHtml) return null;
    return (
      <div
        className="document-field care-form-information"
        data-field-id={field.id}
      >
        <SafeRichText html={informationHtml} />
      </div>
    );
  }

  if (field.type === 'SINGLE_CHOICE' && field.options?.length) {
    return (
      <fieldset
        className="document-field care-choice-field"
        data-field-id={field.id}
        data-invalid={error ? true : undefined}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
      >
        <span className="field-label" id={labelId}>
          {label}
          {field.required ? ' *' : ''}
        </span>
        {field.description ? (
          <small className="field-description" id={descriptionId}>
            {description}
          </small>
        ) : null}
        <span className="choice-stack">
          {field.options.map((option) => {
            const selected = selectedSingleChoiceOptionId(value);
            const checked = selected === option.id;
            const other = isOtherOption(option);
            const otherText = singleChoiceOtherText(value);
            const optionInputId = `${inputId}-${option.id}`;
            return (
              <span key={option.id} className="checkbox-line">
                <input
                  id={optionInputId}
                  name={inputId}
                  type="radio"
                  checked={checked}
                  disabled={readOnly}
                  aria-describedby={describedBy}
                  onChange={() =>
                    onChange(
                      other
                        ? { optionId: option.id, text: otherText }
                        : option.id,
                    )
                  }
                />
                <label className="choice-option-label" htmlFor={optionInputId}>
                  {formTemplateText(option.label) || option.id}
                </label>
                {other ? (
                  <input
                    className="other-choice-input"
                    type="text"
                    tabIndex={-1}
                    value={checked ? otherText : ''}
                    disabled={readOnly}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy}
                    onChange={(event) =>
                      onChange({
                        optionId: option.id,
                        text: event.target.value,
                      })
                    }
                    onPointerDown={() => {
                      if (!checked)
                        onChange({ optionId: option.id, text: otherText });
                    }}
                    onFocus={() =>
                      onChange({ optionId: option.id, text: otherText })
                    }
                  />
                ) : null}
              </span>
            );
          })}
        </span>
        {error ? (
          <small className="field-error" id={errorId}>
            {error}
          </small>
        ) : null}
      </fieldset>
    );
  }

  if (field.type === 'BOOLEAN') {
    return (
      <fieldset
        className="document-field care-choice-field"
        data-field-id={field.id}
        data-invalid={error ? true : undefined}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
      >
        <span className="field-label" id={labelId}>
          {label}
          {field.required ? ' *' : ''}
        </span>
        {field.description ? (
          <small className="field-description" id={descriptionId}>
            {description}
          </small>
        ) : null}
        <span className="choice-stack">
          {[
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ].map((option) => {
            const optionInputId = `${inputId}-${option.label.toLowerCase()}`;
            return (
              <span key={option.label} className="checkbox-line">
                <input
                  id={optionInputId}
                  name={inputId}
                  type="radio"
                  checked={value === option.value}
                  disabled={readOnly}
                  aria-describedby={describedBy}
                  onChange={() => onChange(option.value)}
                />
                <label className="choice-option-label" htmlFor={optionInputId}>
                  {option.label}
                </label>
              </span>
            );
          })}
        </span>
        {error ? (
          <small className="field-error" id={errorId}>
            {error}
          </small>
        ) : null}
      </fieldset>
    );
  }

  if (field.type === 'MULTIPLE_CHOICE' && field.options?.length) {
    const values = selectedMultipleChoiceOptionIds(value);
    const tabStopIndex = Math.max(
      0,
      field.options.findIndex((option) => values.includes(option.id)),
    );
    return (
      <fieldset
        className="document-field care-choice-field"
        data-field-id={field.id}
        data-invalid={error ? true : undefined}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
      >
        <span className="field-label" id={labelId}>
          {label}
          {field.required ? ' *' : ''}
        </span>
        {field.description ? (
          <small className="field-description" id={descriptionId}>
            {description}
          </small>
        ) : null}
        <span className="choice-stack">
          {field.options.map((option, index) => {
            const checked = values.includes(option.id);
            const other = isOtherOption(option);
            const otherText = multipleChoiceOtherText(value, option.id);
            const optionInputId = `${inputId}-${option.id}`;
            return (
              <span key={option.id} className="checkbox-line">
                <input
                  id={optionInputId}
                  type="checkbox"
                  checked={checked}
                  disabled={readOnly}
                  tabIndex={index === tabStopIndex ? 0 : -1}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={describedBy}
                  onKeyDown={handleGroupedCheckboxKeyDown}
                  onChange={(event) =>
                    onChange(
                      updateMultipleChoiceAnswer(
                        value,
                        option,
                        event.target.checked,
                        otherText,
                      ),
                    )
                  }
                />
                <label className="choice-option-label" htmlFor={optionInputId}>
                  {formTemplateText(option.label) || option.id}
                </label>
                {other ? (
                  <input
                    className="other-choice-input"
                    type="text"
                    tabIndex={checked ? 0 : -1}
                    value={checked ? otherText : ''}
                    disabled={readOnly}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy}
                    onChange={(event) =>
                      onChange(
                        updateMultipleChoiceAnswer(
                          value,
                          option,
                          true,
                          event.target.value,
                        ),
                      )
                    }
                    onPointerDown={() => {
                      if (!checked)
                        onChange(
                          updateMultipleChoiceAnswer(
                            value,
                            option,
                            true,
                            otherText,
                          ),
                        );
                    }}
                    onFocus={() =>
                      onChange(
                        updateMultipleChoiceAnswer(
                          value,
                          option,
                          true,
                          otherText,
                        ),
                      )
                    }
                  />
                ) : null}
              </span>
            );
          })}
        </span>
        {error ? (
          <small className="field-error" id={errorId}>
            {error}
          </small>
        ) : null}
      </fieldset>
    );
  }

  if (isSignatureField(field)) {
    return (
      <SignatureField
        field={field}
        value={value}
        error={error}
        readOnly={readOnly}
        onChange={onChange}
      />
    );
  }

  return (
    <label
      className="document-field"
      data-field-id={field.id}
      data-invalid={error ? true : undefined}
    >
      <span className="field-label">
        {label}
        {field.required ? ' *' : ''}
      </span>
      {field.description ? (
        <small className="field-description" id={descriptionId}>
          {description}
        </small>
      ) : null}
      {field.type === 'LONG_TEXT' || field.type === 'RICH_TEXT' ? (
        <textarea
          id={inputId}
          value={typeof value === 'string' ? value : ''}
          readOnly={readOnly}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.type === 'DROPDOWN' && field.options?.length ? (
        <select
          id={inputId}
          value={typeof value === 'string' ? value : ''}
          disabled={readOnly}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select</option>
          {field.options.map((option) => (
            <option key={option.id} value={option.id}>
              {formTemplateText(option.label) || option.id}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={inputId}
          type={inputTypeForField(field.type)}
          value={
            typeof value === 'string' || typeof value === 'number' ? value : ''
          }
          readOnly={readOnly}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error ? (
        <small className="field-error" id={errorId}>
          {error}
        </small>
      ) : null}
    </label>
  );
}

function SignatureField({
  field,
  value,
  error,
  readOnly,
  onChange,
}: {
  field: Field;
  value: unknown;
  error?: string;
  readOnly: boolean;
  onChange: (value: unknown) => void;
}) {
  const answer = signatureAnswer(value);
  const label = formTemplateText(field.label) || t('signature');
  const inputId = `care-form-field-${field.id}`;
  const labelId = `${inputId}-label`;
  const descriptionId = field.description
    ? `${inputId}-description`
    : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy =
    [descriptionId, errorId].filter(Boolean).join(' ') || undefined;
  const description = formTemplateText(field.description);

  if (readOnly) {
    return (
      <div
        className="document-field signature-field"
        data-field-id={field.id}
        aria-labelledby={labelId}
      >
        <span className="field-label" id={labelId}>
          {label}
        </span>
        <SubmittedSignature answer={answer} />
      </div>
    );
  }

  function changeMode(method: 'DRAWN' | 'TYPED') {
    const current = answer ?? { method, drawing: { strokes: [] } };
    if (method === 'DRAWN') {
      onChange({
        method: 'DRAWN',
        drawing: current.drawing ?? { strokes: [] },
      });
      return;
    }
    onChange({
      method: 'TYPED',
      typedName: current.typedName ?? '',
    });
  }

  const method = answer?.method ?? 'DRAWN';
  const drawing = answer?.drawing ?? { strokes: [] };
  const typedName = answer?.typedName ?? '';

  return (
    <fieldset
      className="document-field signature-field"
      data-field-id={field.id}
      data-invalid={error ? true : undefined}
      aria-labelledby={labelId}
      aria-describedby={describedBy}
    >
      <span className="field-label" id={labelId}>
        {label}
        {field.required ? ' *' : ''}
      </span>
      {field.description ? (
        <small className="field-description" id={descriptionId}>
          {description}
        </small>
      ) : null}
      <div className="signature-mode-tabs" role="tablist" aria-label={label}>
        {(['DRAWN', 'TYPED'] as const).map((mode) => (
          <button
            key={mode}
            role="tab"
            type="button"
            className={method === mode ? 'active' : undefined}
            aria-selected={method === mode}
            onClick={() => changeMode(mode)}
          >
            {mode === 'DRAWN' ? t('signatureDraw') : t('signatureType')}
          </button>
        ))}
      </div>
      {method === 'DRAWN' ? (
        <SignatureCanvasInput
          id={inputId}
          drawing={drawing}
          describedBy={describedBy}
          onChange={(nextDrawing) =>
            onChange({ method: 'DRAWN', drawing: nextDrawing })
          }
        />
      ) : (
        <label className="signature-type-field" htmlFor={inputId}>
          <span>{t('signatureFullName')}</span>
          <input
            id={inputId}
            type="text"
            value={typedName}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) =>
              onChange({ method: 'TYPED', typedName: event.target.value })
            }
          />
          <small>{t('signatureTypedStatement')}</small>
        </label>
      )}
      {error ? (
        <small className="field-error" id={errorId}>
          {error}
        </small>
      ) : null}
    </fieldset>
  );
}

function SignatureCanvasInput({
  id,
  drawing,
  describedBy,
  onChange,
}: {
  id: string;
  drawing: SignatureDrawingData;
  describedBy?: string;
  onChange: (drawing: SignatureDrawingData) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef<SignatureDrawingData>(drawing);
  const activePointerRef = useRef<number | null>(null);

  useEffect(() => {
    drawingRef.current = drawing;
    redrawSignatureCanvas(canvasRef.current, drawing);
  }, [drawing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const resize = () => redrawSignatureCanvas(canvas, drawingRef.current);
    resize();
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);
    window.addEventListener('resize', resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, []);

  function pointFromEvent(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / Math.max(rect.width, 1)),
      y: clamp01((event.clientY - rect.top) / Math.max(rect.height, 1)),
    };
  }

  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerRef.current = event.pointerId;
    const next = {
      strokes: [...drawingRef.current.strokes, { points: [pointFromEvent(event)] }],
    };
    drawingRef.current = next;
    onChange(next);
  }

  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (activePointerRef.current !== event.pointerId) return;
    event.preventDefault();
    const strokes = drawingRef.current.strokes;
    const currentStroke = strokes.at(-1);
    if (!currentStroke) return;
    const next = {
      strokes: [
        ...strokes.slice(0, -1),
        { points: [...currentStroke.points, pointFromEvent(event)] },
      ],
    };
    drawingRef.current = next;
    onChange(next);
  }

  function endPointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (activePointerRef.current !== event.pointerId) return;
    event.preventDefault();
    activePointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div className="signature-pad">
      <div className="signature-canvas-wrap">
        {!hasSignatureDrawing(drawing) ? (
          <span className="signature-canvas-placeholder">
            {t('signatureDrawPlaceholder')}
          </span>
        ) : null}
        <canvas
          id={id}
          ref={canvasRef}
          className="signature-canvas"
          role="img"
          tabIndex={0}
          aria-label={t('signatureCanvasLabel')}
          aria-describedby={describedBy}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        />
      </div>
      <button
        type="button"
        className="secondary compact signature-clear"
        onClick={() => onChange({ strokes: [] })}
      >
        {t('signatureClear')}
      </button>
    </div>
  );
}

function SubmittedSignature({ answer }: { answer: SignatureAnswer | null }) {
  if (!answer) return <span className="muted">-</span>;
  const signedLine = signatureSignedLine(answer.signedAt);
  if (answer.method === 'TYPED') {
    return (
      <div className="submitted-signature">
        <strong>{answer.typedName ?? '-'}</strong>
        <small>{signedLine}</small>
      </div>
    );
  }
  return (
    <div className="submitted-signature">
      <SignaturePreview drawing={answer.drawing ?? { strokes: [] }} />
      <small>{signedLine}</small>
    </div>
  );
}

function signatureSignedLine(signedAt?: string) {
  if (!signedAt) return t('signatureSigned');
  return t('signatureSignedOnAt', {
    date: formatClinicDate(signedAt),
    time: formatClinicTime(signedAt),
  });
}

function SignaturePreview({ drawing }: { drawing: SignatureDrawingData }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    redrawSignatureCanvas(canvasRef.current, drawing);
  }, [drawing]);
  return (
    <canvas
      className="signature-canvas signature-preview-canvas"
      ref={canvasRef}
      aria-label={t('signaturePreviewLabel')}
    />
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="notice">{children}</div>;
}

function handleGroupedCheckboxKeyDown(
  event: ReactKeyboardEvent<HTMLInputElement>,
) {
  const direction = checkboxArrowDirection(event.key);
  if (!direction) return;

  event.preventDefault();
  const choices = Array.from(
    event.currentTarget
      .closest('.choice-stack')
      ?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? [],
  ).filter((input) => !input.disabled);
  const currentIndex = choices.indexOf(event.currentTarget);
  if (currentIndex < 0 || choices.length < 2) return;

  const nextIndex =
    (currentIndex + direction + choices.length) % choices.length;
  choices[nextIndex]?.focus();
}

function checkboxArrowDirection(key: string) {
  if (key === 'ArrowDown' || key === 'ArrowRight') return 1;
  if (key === 'ArrowUp' || key === 'ArrowLeft') return -1;
  return 0;
}

function NeutralEmptyState({ children }: { children: ReactNode }) {
  return <div className="care-empty-state">{children}</div>;
}

function InlineError({ message }: { message: string }) {
  return <div className="notice danger">{message}</div>;
}

function SafeRichText({ html }: { html: string }) {
  return (
    <div
      className="safe-rich-text"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function informationFieldContent(
  field: Field,
  description: string,
  label: string,
) {
  const content = field.content?.trim();
  if (content && !isDefaultInformationText(content))
    return field.content ?? content;
  if (label && !isDefaultInformationText(label)) return label;
  if (description && !isDefaultInformationText(description)) return description;
  return '';
}

function isDefaultInformationText(value: string) {
  return value.trim().toLowerCase() === DEFAULT_INFORMATION_TEXT.toLowerCase();
}

function isOtherOption(option: Option) {
  return option.isOther === true;
}

function selectedSingleChoiceOptionId(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const optionId = (value as { optionId?: unknown }).optionId;
    return typeof optionId === 'string' ? optionId : '';
  }
  return '';
}

function singleChoiceOtherText(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const answerText = (value as { text?: unknown }).text;
    return typeof answerText === 'string' ? answerText : '';
  }
  return '';
}

function selectedMultipleChoiceOptionIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const optionId = (item as { optionId?: unknown }).optionId;
        return typeof optionId === 'string' ? optionId : '';
      }
      return '';
    })
    .filter(Boolean);
}

function multipleChoiceOtherText(value: unknown, optionId: string) {
  if (!Array.isArray(value)) return '';
  const answer = value.find(
    (item) =>
      item &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      (item as { optionId?: unknown }).optionId === optionId,
  );
  const answerText = (answer as { text?: unknown } | undefined)?.text;
  return typeof answerText === 'string' ? answerText : '';
}

function updateMultipleChoiceAnswer(
  value: unknown,
  option: Option,
  checked: boolean,
  text?: string,
) {
  const current = Array.isArray(value) ? value : [];
  const withoutOption = current.filter((item) => {
    if (typeof item === 'string') return item !== option.id;
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return (item as { optionId?: unknown }).optionId !== option.id;
    }
    return true;
  });
  if (!checked) return withoutOption;
  if (isOtherOption(option))
    return [...withoutOption, { optionId: option.id, text: text ?? '' }];
  return [...withoutOption, option.id];
}

function isEmptyOtherChoiceAnswer(field: Field, value: unknown) {
  if (field.type !== 'SINGLE_CHOICE' && field.type !== 'MULTIPLE_CHOICE')
    return false;
  const otherOption = (field.options ?? []).find(isOtherOption);
  if (!otherOption) return false;
  if (field.type === 'MULTIPLE_CHOICE') {
    if (!selectedMultipleChoiceOptionIds(value).includes(otherOption.id))
      return false;
    return !multipleChoiceOtherText(value, otherOption.id).trim();
  }
  if (selectedSingleChoiceOptionId(value) !== otherOption.id) return false;
  return !singleChoiceOtherText(value).trim();
}

function isSignatureField(field: Field) {
  return field.type === 'SIGNATURE' || field.type === 'SIGNATURE_ACKNOWLEDGEMENT';
}

function signatureAnswer(value: unknown): SignatureAnswer | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const answer = value as {
    method?: unknown;
    typedName?: unknown;
    drawing?: unknown;
    signedAt?: unknown;
  };
  const method = answer.method === 'TYPED' ? 'TYPED' : answer.method === 'DRAWN' ? 'DRAWN' : null;
  if (!method) return null;
  return {
    method,
    typedName: typeof answer.typedName === 'string' ? answer.typedName : undefined,
    drawing: signatureDrawing(answer.drawing),
    signedAt: typeof answer.signedAt === 'string' ? answer.signedAt : undefined,
  };
}

function consentSignatureBlocks(document: ConsentDocument) {
  return document.sections.flatMap((section) => consentSignatureBlocksIn(section.blocks));
}

function consentSignatureBlocksIn(blocks: ConsentBlock[]): ConsentBlock[] {
  return blocks.flatMap((block): ConsentBlock[] =>
    block.type === 'SIGNATURE'
      ? [block]
      : block.type === 'COLUMNS'
        ? consentSignatureBlocksIn(block.children ?? [])
        : [],
  );
}

function consentAcknowledgementBlocks(document: ConsentDocument) {
  return document.sections.flatMap((section) =>
    consentAcknowledgementBlocksIn(section.blocks),
  );
}

function consentAcknowledgementBlocksIn(blocks: ConsentBlock[]): ConsentBlock[] {
  return blocks.flatMap((block): ConsentBlock[] =>
    block.type === 'ACKNOWLEDGEMENT'
      ? [block]
      : block.type === 'COLUMNS'
        ? consentAcknowledgementBlocksIn(block.children ?? [])
        : [],
  );
}

function consentSignatureValues(
  consent: PublicConsentDTO,
  signatureBlocks: ConsentBlock[],
) {
  const signature = (consent as PublicConsentWithSignature).signature;
  if (!signature || typeof signature !== 'object' || Array.isArray(signature)) {
    return {};
  }
  const values: Record<string, SignatureAnswer> = {};
  const signaturePayload = signature.signature;
  const nestedSignatures =
    objectRecord(signaturePayload)?.signatures ?? signature.signatures;
  if (
    nestedSignatures &&
    typeof nestedSignatures === 'object' &&
    !Array.isArray(nestedSignatures)
  ) {
    Object.entries(nestedSignatures as Record<string, unknown>).forEach(
      ([blockId, value]) => {
        const answer = signatureAnswer(value);
        if (answer) values[blockId] = { ...answer, signedAt: answer.signedAt ?? signature.signedAt };
      },
    );
  }
  const legacy = consentSignatureAnswer(consent);
  if (legacy && signatureBlocks.length && !hasSignatureValues(values)) {
    values[signatureBlocks[0].id] = legacy;
  }
  return values;
}

function consentAcknowledgementValues(consent: PublicConsentDTO) {
  const signature = (consent as PublicConsentWithSignature).signature;
  if (!signature || typeof signature !== 'object' || Array.isArray(signature)) {
    return {};
  }
  const values = signature.acknowledgements;
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value === true]),
  );
}

function hasSignatureValues(values: Record<string, unknown>) {
  return Object.values(values).some((value) => Boolean(signatureAnswer(value)));
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function consentSignatureAnswer(consent: PublicConsentDTO): SignatureAnswer | null {
  const signature = (consent as PublicConsentWithSignature).signature;
  if (!signature || typeof signature !== 'object' || Array.isArray(signature)) {
    return null;
  }
  const payload = signatureAnswer(signature.signature);
  if (payload) {
    return {
      ...payload,
      signedAt: payload.signedAt ?? signature.signedAt,
    };
  }
  if (typeof signature.typedSignature === 'string') {
    return {
      method: 'TYPED',
      typedName: signature.typedSignature,
      signedAt: signature.signedAt,
    };
  }
  return signatureAnswer(signature);
}

function signatureDrawing(value: unknown): SignatureDrawingData | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const strokes = (value as { strokes?: unknown }).strokes;
  if (!Array.isArray(strokes)) return undefined;
  return {
    strokes: strokes
      .map((stroke) => {
        if (!stroke || typeof stroke !== 'object' || Array.isArray(stroke)) {
          return null;
        }
        const points = (stroke as { points?: unknown }).points;
        if (!Array.isArray(points)) return null;
        return {
          points: points
            .map((point) => {
              if (!point || typeof point !== 'object' || Array.isArray(point)) {
                return null;
              }
              const x = (point as { x?: unknown }).x;
              const y = (point as { y?: unknown }).y;
              return typeof x === 'number' && typeof y === 'number'
                ? { x: clamp01(x), y: clamp01(y) }
                : null;
            })
            .filter((point): point is SignaturePoint => Boolean(point)),
        };
      })
      .filter((stroke): stroke is SignatureStroke => Boolean(stroke)),
  };
}

function hasSignatureDrawing(drawing?: SignatureDrawingData) {
  return Boolean(
    drawing?.strokes.some((stroke) => stroke.points.length > 1),
  );
}

function isSignatureComplete(value: unknown) {
  const answer = signatureAnswer(value);
  if (!answer) return false;
  if (answer.method === 'TYPED') return Boolean(answer.typedName?.trim());
  return hasSignatureDrawing(answer.drawing);
}

function submissionSignatureValue(value: unknown) {
  const answer = signatureAnswer(value);
  if (!answer) return value;
  if (answer.method === 'TYPED') {
    return { method: 'TYPED', typedName: answer.typedName?.trim() ?? '' };
  }
  return { method: 'DRAWN', drawing: answer.drawing ?? { strokes: [] } };
}

function submissionAnswers(answers: Answers, schema: ClinicalSchema) {
  const signatureIds = new Set(
    schema.sections.flatMap((section) =>
      fieldsInNodes(section.fields)
        .filter(isSignatureField)
        .map((field) => field.id),
    ),
  );
  if (!signatureIds.size) return answers;
  return Object.fromEntries(
    Object.entries(answers).map(([id, value]) => [
      id,
      signatureIds.has(id) ? submissionSignatureValue(value) : value,
    ]),
  );
}

function redrawSignatureCanvas(
  canvas: HTMLCanvasElement | null,
  drawing?: SignatureDrawingData,
) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width || canvas.clientWidth || 1);
  const height = Math.max(1, rect.height || canvas.clientHeight || 1);
  const ratio = window.devicePixelRatio || 1;
  const pixelWidth = Math.floor(width * ratio);
  const pixelHeight = Math.floor(height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = '#111827';
  context.lineWidth = 2.5;
  (drawing?.strokes ?? []).forEach((stroke) => {
    if (!stroke.points.length) return;
    context.beginPath();
    stroke.points.forEach((point, index) => {
      const x = point.x * width;
      const y = point.y * height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  });
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function validateRequired(
  schema: ClinicalSchema,
  answers: Answers,
  sectionId?: string,
) {
  const errors: FieldErrors = {};
  schema.sections.forEach((section) => {
    if (sectionId && section.id !== sectionId) return;
    fieldsInNodes(section.fields).forEach((field) => {
      if (!field.required || field.type === 'INFORMATION') return;
      const value = answers[field.id];
      const missing =
        value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0) ||
        isEmptyOtherChoiceAnswer(field, value) ||
        (field.type === 'BOOLEAN' && typeof value !== 'boolean') ||
        (isSignatureField(field) && !isSignatureComplete(value));
      if (missing) errors[field.id] = t('formRequiredField');
    });
  });
  return errors;
}

function completedText(reason: string | undefined | null, fallback: string) {
  return reason === 'COMPLETED' ||
    reason === 'SUBMITTED' ||
    reason === 'SIGNED' ||
    reason === 'REVIEWED'
    ? 'This item has already been completed.'
    : fallback;
}
