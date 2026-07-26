'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  PublicConsentSignRequestDTOSignerTypeEnum,
  PublicFormDTO,
} from '@allomed-api/core-service-public-api';
import { ContentLoader } from '@/components/common/content-loader';
import { corePublic } from '@/lib/api';
import { formatClinicDate, formatClinicDateTime, formatClinicTime } from '@/lib/date-time-format';

export type CareView = 'overview' | 'appointments' | 'forms' | 'consents' | 'documents' | 'payments';

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
type Section = { id: string; label?: LocalizedText; description?: LocalizedText; fields: Field[] };
type ClinicalSchema = { sections: Section[] };
type Answers = Record<string, unknown>;
type FieldErrors = Record<string, string>;
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

const pendingFormStatuses = new Set(['ASSIGNED', 'SENT', 'OPENED', 'IN_PROGRESS']);
const pendingConsentStatuses = new Set(['REQUESTED', 'SENT', 'OPENED']);
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
  | 'appointmentDetails'
  | 'actions'
  | 'address'
  | 'appointmentUnavailable'
  | 'backToAppointments'
  | 'backToAppointmentDetails'
  | 'availableTimes'
  | 'carePageUnavailable'
  | 'carePageSections'
  | 'careSessionRequired'
  | 'cancelAppointment'
  | 'cancelAppointmentClinicNotified'
  | 'cancelAppointmentConfirm'
  | 'cancelAppointmentDescription'
  | 'cancelAppointmentError'
  | 'cancelAppointmentSuccess'
  | 'cancelAppointmentTitle'
  | 'cancelNoLongerAllowed'
  | 'cancellingAppointment'
  | 'keepAppointment'
  | 'chooseAnotherTime'
  | 'chooseAnotherDate'
  | 'chooseAppointment'
  | 'completeForm'
  | 'confirmReschedule'
  | 'continue'
  | 'consent'
  | 'consents'
  | 'contactClinic'
  | 'currentTime'
  | 'currentAppointment'
  | 'documents'
  | 'dismissAppointmentMessage'
  | 'documentFallback'
  | 'dueDate'
  | 'duration'
  | 'durationMinutes'
  | 'forNextAppointment'
  | 'form'
  | 'forms'
  | 'keepCurrentAppointment'
  | 'loadAppointmentsError'
  | 'loadingAvailableTimes'
  | 'loadMoreAvailability'
  | 'location'
  | 'moreAvailability'
  | 'nextAppointment'
  | 'newTime'
  | 'noAppointments'
  | 'noAvailableTimes'
  | 'overview'
  | 'overviewError'
  | 'payments'
  | 'pastAppointments'
  | 'pendingConsentsCount'
  | 'pendingFormsCount'
  | 'pendingNavBadge'
  | 'practitioner'
  | 'recentDocuments'
  | 'rescheduleAppointment'
  | 'rescheduleAppointmentError'
  | 'rescheduleAppointmentSuccess'
  | 'rescheduleNoLongerAllowed'
  | 'rescheduleSlotUnavailable'
  | 'rescheduleUnavailable'
  | 'reviewAndSign'
  | 'seeAllAppointments'
  | 'seeAllDocuments'
  | 'selectedTime'
  | 'signOut'
  | 'thingsToComplete'
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
    appointmentDetails: 'Appointment details',
    actions: 'Actions',
    address: 'Address',
    appointmentUnavailable: 'This appointment is no longer available.',
    backToAppointments: 'Back to appointments',
    backToAppointmentDetails: 'Back to appointment details',
    availableTimes: 'Available times',
    carePageUnavailable: 'Care Page unavailable',
    carePageSections: 'Care page sections',
    careSessionRequired: 'Care Page session required.',
    cancelAppointment: 'Cancel appointment',
    cancelAppointmentClinicNotified: 'The clinic will be notified of the cancellation.',
    cancelAppointmentConfirm: 'Cancel this appointment?',
    cancelAppointmentDescription: 'Are you sure you want to cancel this appointment?',
    cancelAppointmentError: 'We could not cancel the appointment. Please try again.',
    cancelAppointmentSuccess: 'Your appointment has been cancelled.',
    cancelAppointmentTitle: 'Cancel appointment?',
    cancelNoLongerAllowed: 'This appointment can no longer be cancelled.',
    cancellingAppointment: 'Cancelling...',
    keepAppointment: 'Keep appointment',
    chooseAnotherTime: 'Choose another time',
    chooseAnotherDate: 'Choose another date',
    chooseAppointment: 'Choose an appointment from the list to view its details.',
    completeForm: 'Complete form',
    confirmReschedule: 'Confirm reschedule',
    continue: 'Continue',
    consent: 'Consent',
    consents: 'Consents',
    contactClinic: 'Contact the clinic to request a new secure link.',
    currentTime: 'Current time',
    currentAppointment: 'Current appointment',
    documents: 'Documents',
    dismissAppointmentMessage: 'Dismiss appointment message',
    documentFallback: 'Document',
    dueDate: 'Due {date}',
    duration: 'Duration',
    durationMinutes: '{count} minutes',
    forNextAppointment: 'For your next appointment',
    form: 'Form',
    forms: 'Forms',
    keepCurrentAppointment: 'Keep current appointment',
    loadAppointmentsError: 'Unable to load appointments.',
    loadingAvailableTimes: 'Loading available times...',
    loadMoreAvailability: 'Load more',
    location: 'Location',
    moreAvailability: 'More availability',
    nextAppointment: 'Next appointment',
    newTime: 'New time',
    noAppointments: 'You do not have any appointments yet.',
    noAvailableTimes: 'No available times were found for this date.',
    overview: 'Overview',
    overviewError: 'Unable to load your Care Page overview.',
    payments: 'Payments',
    pastAppointments: 'Past',
    pendingConsentsCount: '{count} pending consents',
    pendingFormsCount: '{count} pending forms',
    pendingNavBadge: '{label}, {count} pending',
    practitioner: 'Practitioner',
    recentDocuments: 'Recent documents',
    rescheduleAppointment: 'Reschedule appointment',
    rescheduleAppointmentError: 'Unable to reschedule this appointment.',
    rescheduleAppointmentSuccess: 'Your appointment has been rescheduled.',
    rescheduleNoLongerAllowed: 'This appointment can no longer be rescheduled.',
    rescheduleSlotUnavailable: 'This time is no longer available.',
    rescheduleUnavailable: 'Available times cannot be loaded for this appointment.',
    reviewAndSign: 'Review and sign',
    seeAllAppointments: 'See all appointments',
    seeAllDocuments: 'See all documents',
    selectedTime: 'Selected time',
    signOut: 'Sign out',
    thingsToComplete: 'Things to complete',
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
    appointmentDetails: 'Details du rendez-vous',
    actions: 'Actions',
    address: 'Adresse',
    appointmentUnavailable: 'Ce rendez-vous n est plus disponible.',
    backToAppointments: 'Retour aux rendez-vous',
    backToAppointmentDetails: 'Retour aux details du rendez-vous',
    availableTimes: 'Heures disponibles',
    carePageUnavailable: 'Page de soins indisponible',
    carePageSections: 'Sections de la page de soins',
    careSessionRequired: 'Session de page de soins requise.',
    cancelAppointment: 'Annuler le rendez-vous',
    cancelAppointmentClinicNotified: 'La clinique sera informee de l annulation.',
    cancelAppointmentConfirm: 'Annuler ce rendez-vous ?',
    cancelAppointmentDescription: 'Voulez-vous vraiment annuler ce rendez-vous ?',
    cancelAppointmentError: 'Nous n avons pas pu annuler le rendez-vous. Veuillez reessayer.',
    cancelAppointmentSuccess: 'Votre rendez-vous a ete annule.',
    cancelAppointmentTitle: 'Annuler le rendez-vous ?',
    cancelNoLongerAllowed: 'Ce rendez-vous ne peut plus etre annule.',
    cancellingAppointment: 'Annulation...',
    keepAppointment: 'Garder le rendez-vous',
    chooseAnotherTime: 'Choisir une autre heure',
    chooseAnotherDate: 'Choisir une autre date',
    chooseAppointment: 'Choisissez un rendez-vous dans la liste pour voir ses details.',
    completeForm: 'Remplir le formulaire',
    confirmReschedule: 'Confirmer le changement',
    continue: 'Continuer',
    consent: 'Consentement',
    consents: 'Consentements',
    contactClinic: 'Contactez la clinique pour demander un nouveau lien securise.',
    currentTime: 'Heure actuelle',
    currentAppointment: 'Rendez-vous actuel',
    documents: 'Documents',
    dismissAppointmentMessage: 'Fermer le message de rendez-vous',
    documentFallback: 'Document',
    dueDate: 'A faire avant le {date}',
    duration: 'Duree',
    durationMinutes: '{count} minutes',
    forNextAppointment: 'Pour votre prochain rendez-vous',
    form: 'Formulaire',
    forms: 'Formulaires',
    keepCurrentAppointment: 'Garder le rendez-vous actuel',
    loadAppointmentsError: 'Impossible de charger les rendez-vous.',
    loadingAvailableTimes: 'Chargement des heures disponibles...',
    loadMoreAvailability: 'Charger plus',
    location: 'Lieu',
    moreAvailability: 'Plus de disponibilites',
    nextAppointment: 'Prochain rendez-vous',
    newTime: 'Nouvelle heure',
    noAppointments: 'Vous n avez pas encore de rendez-vous.',
    noAvailableTimes: 'Aucune heure disponible n a ete trouvee pour cette date.',
    overview: 'Accueil',
    overviewError: 'Impossible de charger votre accueil.',
    payments: 'Paiements',
    pastAppointments: 'Passes',
    pendingConsentsCount: '{count} consentements en attente',
    pendingFormsCount: '{count} formulaires en attente',
    pendingNavBadge: '{label}, {count} en attente',
    practitioner: 'Praticien',
    recentDocuments: 'Documents recents',
    rescheduleAppointment: 'Deplacer le rendez-vous',
    rescheduleAppointmentError: 'Impossible de deplacer ce rendez-vous.',
    rescheduleAppointmentSuccess: 'Votre rendez-vous a ete deplace.',
    rescheduleNoLongerAllowed: 'Ce rendez-vous ne peut plus etre deplace.',
    rescheduleSlotUnavailable: 'Cette heure n est plus disponible.',
    rescheduleUnavailable: 'Les heures disponibles ne peuvent pas etre chargees pour ce rendez-vous.',
    reviewAndSign: 'Verifier et signer',
    seeAllAppointments: 'Voir tous les rendez-vous',
    seeAllDocuments: 'Voir tous les documents',
    selectedTime: 'Heure choisie',
    signOut: 'Se deconnecter',
    thingsToComplete: 'A completer',
    upcomingAppointments: 'A venir',
    virtualAppointment: 'Rendez-vous virtuel',
    withPractitioner: 'Avec {practitioner}',
    yourClinic: 'Votre clinique',
    welcome: 'Bienvenue, {firstName}',
  },
} satisfies Record<string, Record<CareCopyKey, string>>;

function itemsResponse<T>(value: ItemsResponse<T>): T[] {
  return Array.isArray(value) ? value : value.items ?? [];
}

function careLocale() {
  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('fr')) {
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

function isRescheduleNoLongerAllowedError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return ['APPOINTMENT_NOT_RESCHEDULABLE', 'APPOINTMENT_HAS_NO_SERVICE', 'SERVICE_NOT_BOOKABLE'].includes(error.message);
}

function isCancelNoLongerAllowedError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return ['APPOINTMENT_NOT_CANCELLABLE', 'APPOINTMENT_NOT_FOUND'].includes(error.message);
}

function positiveCount(value: number | undefined) {
  return value && value > 0 ? value : undefined;
}

function patientGreeting(bootstrap: CareBootstrapDTO) {
  const firstName = bootstrap.patient?.firstName?.trim();
  if (firstName) return t('welcome', { firstName });
  const displayName = [bootstrap.patient?.firstName, bootstrap.patient?.lastName].filter(Boolean).join(' ').trim();
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

export function careNavScrollAvailability(metrics: ScrollMetrics, threshold = 2) {
  return {
    canScrollLeft: metrics.scrollLeft > threshold,
    canScrollRight: metrics.scrollLeft + metrics.clientWidth < metrics.scrollWidth - threshold,
  };
}

export function careNavRevealScrollLeft(container: Bounds, item: Bounds, scrollLeft: number, maxScrollLeft: number, threshold = 2) {
  if (maxScrollLeft <= 0) return 0;

  const containerWidth = container.right - container.left;
  const itemWidth = item.right - item.left;
  const itemOffset = item.left - container.left;
  const centeredScrollLeft = scrollLeft + itemOffset - (containerWidth - itemWidth) / 2;
  const nextScrollLeft = Math.abs(centeredScrollLeft - scrollLeft) < threshold ? scrollLeft : centeredScrollLeft;

  return Math.max(0, Math.min(maxScrollLeft, nextScrollLeft));
}

export function careNavScrollBehavior(reducedMotion: boolean) {
  return reducedMotion ? 'auto' : 'smooth';
}

function visualBadgeCount(count: number) {
  return count > 99 ? '99+' : String(count);
}

function navItemAriaLabel(item: NavItem) {
  return item.badgeCount ? t('pendingNavBadge', { label: item.label, count: item.badgeCount }) : item.label;
}

function careNavHref(view: CareView) {
  return view === 'overview' ? '/care' : `/care?view=${encodeURIComponent(view)}`;
}

function careHref(view: CareView, resourceId?: string, action?: CareAction) {
  const params = new URLSearchParams();
  if (view !== 'overview') params.set('view', view);
  if (resourceId) params.set('resourceId', resourceId);
  if (view === 'appointments' && resourceId && action) params.set('action', action);
  const query = params.toString();
  return query ? `/care?${query}` : '/care';
}

const allowedCareViews = new Set<CareView>(['overview', 'appointments', 'forms', 'consents', 'documents', 'payments']);

function parseCareRoute(searchParams: URLSearchParams): { view: CareView; resourceId?: string; action?: CareAction; invalidAction: boolean } {
  const routeView = searchParams.get('view');
  const nextView = routeView && allowedCareViews.has(routeView as CareView) ? (routeView as CareView) : 'overview';
  const resourceId = searchParams.get('resourceId') || undefined;
  const routeAction = searchParams.get('action');
  const action = nextView === 'appointments' && resourceId && routeAction === 'reschedule' ? routeAction : undefined;
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
  const [scrollState, setScrollState] = useState({ canScrollLeft: false, canScrollRight: false });
  const [containerVersion, setContainerVersion] = useState(0);
  const itemsSignature = items.map((item) => `${item.view}:${item.badgeCount ?? 0}`).join('|');

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
    setScrollState((current) => (
      current.canScrollLeft === next.canScrollLeft && current.canScrollRight === next.canScrollRight
        ? current
        : next
    ));
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

  const revealTab = useCallback((nextView: CareView) => {
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
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    container.scrollTo({
      left: nextScrollLeft,
      behavior: careNavScrollBehavior(reducedMotion),
    });
  }, [applyScrollState]);

  const setTabRef = useCallback((viewName: CareView, node: HTMLAnchorElement | null) => {
    if (node) {
      tabRefs.current.set(viewName, node);
    } else {
      tabRefs.current.delete(viewName);
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    updateScrollState();
    container.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleUpdate) : null;
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
  }, [activeView, containerVersion, itemsSignature, revealTab, updateScrollState]);

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
  const [resourceId, setResourceId] = useState<string | undefined>(initialResourceId);
  const [action, setAction] = useState<CareAction | undefined>(initialView === 'appointments' && initialResourceId ? initialAction : undefined);
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

  useEffect(() => {
    const next = parseCareRoute(new URLSearchParams(searchParams.toString()));
    setView((current) => (current === next.view ? current : next.view));
    setResourceId((current) => (current === next.resourceId ? current : next.resourceId));
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
      { view: 'overview', label: t('overview'), icon: <Home size={17} />, enabled: available?.overview !== false },
      { view: 'appointments', label: t('appointments'), icon: <CalendarDays size={17} />, enabled: available?.appointments !== false },
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
      { view: 'documents', label: t('documents'), icon: <FileText size={17} />, enabled: available?.documents !== false },
      { view: 'payments', label: t('payments'), icon: <CreditCard size={17} />, enabled: available?.payments === true },
    ];
    return items.filter((item) => item.enabled);
  }, [bootstrap]);

  const navigate = useCallback(
    (nextView: CareView, nextResourceId?: string, options?: CareNavigationOptions) => {
      const nextAction = nextView === 'appointments' && nextResourceId ? options?.action : undefined;
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
    await fetch('/api/core/care/sessions', { method: 'DELETE', credentials: 'same-origin', cache: 'no-store' }).catch(() => undefined);
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
            <h1>{t('carePageUnavailable')}</h1>
            <p>{t('contactClinic')}</p>
          </header>
          <div className="content">
            <div className="notice danger">{error || t('careSessionRequired')}</div>
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
          <button type="button" className="secondary compact care-sign-out" onClick={signOut}>
            <LogOut size={14} aria-hidden="true" />
            {t('signOut')}
          </button>
        </header>
        <div className="care-nav-shell">
          <nav className="care-nav" aria-label={t('carePageSections')} ref={careNav.containerRef}>
            {navigation.map((item) => (
              <Link
                aria-current={item.view === view ? 'page' : undefined}
                aria-label={navItemAriaLabel(item)}
                className={item.view === view ? 'active secondary' : 'secondary'}
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
          {careNav.canScrollLeft ? <span className="care-nav-fade care-nav-fade-left" data-testid="care-nav-left-fade" aria-hidden="true" /> : null}
          {careNav.canScrollRight ? <span className="care-nav-fade care-nav-fade-right" data-testid="care-nav-right-fade" aria-hidden="true" /> : null}
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
  refreshKey,
  onNavigate,
}: {
  refreshKey: number;
  onNavigate: (view: CareView, resourceId?: string, options?: CareNavigationOptions) => void;
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
  if (!overview) return <ContentLoader />;

  const pendingTasks = overviewTasks(overview);
  const recentDocuments = (overview.recentDocuments ?? []).filter((document) => document.id).slice(0, 3);
  return (
    <div className="care-section">
      {pendingTasks.length ? (
        <section className="care-block care-priority-block">
          <h2>{t('thingsToComplete')}</h2>
          <div className="care-list">
            {pendingTasks.map((task) => (
              <PendingTaskRow key={`${task.view}-${task.id}`} task={task} onOpen={() => onNavigate(task.view, task.id)} />
            ))}
          </div>
        </section>
      ) : null}

      {overview.nextAppointment ? (
        <section className="care-block">
          <div className="care-block-heading">
            <h2>{t('nextAppointment')}</h2>
            <button type="button" className="care-section-link" onClick={() => onNavigate('appointments')}>
              {t('seeAllAppointments')}
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
          <OverviewAppointmentCard appointment={overview.nextAppointment} onOpen={() => onNavigate('appointments', overview.nextAppointment?.id, { mode: 'push' })} />
        </section>
      ) : null}

      {recentDocuments.length ? (
        <section className="care-block">
          <div className="care-block-heading">
            <h2>{t('recentDocuments')}</h2>
            <button type="button" className="secondary compact" onClick={() => onNavigate('documents')}>
              {t('seeAllDocuments')}
            </button>
          </div>
          <OverviewDocumentList documents={recentDocuments} onOpen={(id) => onNavigate('documents', id)} />
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
  onNavigate: (view: CareView, resourceId?: string, options?: CareNavigationOptions) => void;
  onChanged: () => void;
}) {
  const [appointments, setAppointments] = useState<ManagedAppointmentResponseDTO[] | null>(null);
  const [detail, setDetail] = useState<ManagedAppointmentResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelDialogError, setCancelDialogError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [invalidAppointmentIds, setInvalidAppointmentIds] = useState<Set<string>>(() => new Set());
  const narrowViewport = useNarrowCareViewport();
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const rescheduleTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cancelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const openedFromListRef = useRef(false);
  const lastOpenedAppointmentIdRef = useRef<string | null>(null);
  const listScrollYRef = useRef<number | null>(null);
  const groups = useMemo(() => groupAppointments(appointments ?? []), [appointments]);
  const hasAppointments = Boolean(appointments?.length);
  const isExplicitAppointmentSelection = Boolean(resourceId);
  const explicitAppointmentIsListValid = Boolean(
    resourceId &&
    !invalidAppointmentIds.has(resourceId) &&
    (!appointments || appointments.some((appointment) => appointment.id === resourceId)),
  );
  const desktopDefaultAppointment = useMemo(
    () => (narrowViewport === false ? getDefaultDesktopAppointment(groups, invalidAppointmentIds) : null),
    [groups, invalidAppointmentIds, narrowViewport],
  );
  const selectedAppointmentId = explicitAppointmentIsListValid ? resourceId : desktopDefaultAppointment?.id;
  const showMobileDetail = narrowViewport !== false && isExplicitAppointmentSelection;
  const showMobileReschedule = narrowViewport !== false && isExplicitAppointmentSelection && action === 'reschedule';
  const showMobileList = narrowViewport !== false && !isExplicitAppointmentSelection;
  const showDesktopSplit = narrowViewport === false;
  const showDesktopRescheduleDialog = showDesktopSplit && action === 'reschedule';

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

    const explicitSelectionMissing = Boolean(resourceId && !appointments.some((appointment) => appointment.id === resourceId));
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
    if (appointments && resourceId === selectedAppointmentId && !appointments.some((appointment) => appointment.id === selectedAppointmentId)) {
      setDetail(null);
      setError(t('appointmentUnavailable'));
      return;
    }
    let active = true;
    setError(null);
    setDetail((current) => (current?.id === selectedAppointmentId ? current : null));
    corePublic<ManagedAppointmentResponseDTO>(`/care/appointments/${encodeURIComponent(selectedAppointmentId)}`)
      .then((item) => {
        if (active) setDetail(item);
      })
      .catch(() => {
        if (!active) return;
        setDetail(null);
        setError(t('appointmentUnavailable'));
        if (resourceId === selectedAppointmentId) {
          setInvalidAppointmentIds((current) => new Set(current).add(selectedAppointmentId));
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
      sectionRef.current?.scrollIntoView?.({ block: 'start', behavior: careNavScrollBehavior(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true) });
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
      const updated = await corePublic<ManagedAppointmentResponseDTO>(`/care/appointments/${encodeURIComponent(selectedAppointmentId)}/cancel`, { method: 'POST' });
      setDetail(updated);
      setCancelConfirmOpen(false);
      setSuccessMessage(t('cancelAppointmentSuccess'));
      onChanged();
    } catch (error) {
      setCancelDialogError(isCancelNoLongerAllowedError(error) ? t('cancelNoLongerAllowed') : t('cancelAppointmentError'));
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
    onNavigate('appointments', selectedAppointmentId, { mode: 'push', action: 'reschedule' });
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
    const updated = await corePublic<ManagedAppointmentResponseDTO>(`/care/appointments/${encodeURIComponent(selectedAppointmentId)}/reschedule`, {
      method: 'POST',
      body: JSON.stringify({ newStartAt: slot.startAt, employeeId: slot.employeeId }),
    });
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

  if (!appointments) return <ContentLoader />;
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
      {error && !isExplicitAppointmentSelection ? <InlineError message={error} /> : null}
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
      {selectedAppointmentId && !detail && !error ? <ContentLoader /> : null}
      {detail ? (
        <div className="care-detail">
          <AppointmentFacts appointment={detail} />
          {detail.rescheduleAllowed || detail.cancellationAllowed ? (
            <section className="care-actions-section">
              <h3>{t('actions')}</h3>
              <div className="actions">
                {detail.rescheduleAllowed ? (
                  <button type="button" className="reschedule-action-button" disabled={cancelBusy} onClick={openRescheduleFlow} ref={rescheduleTriggerRef}>
                    {t('rescheduleAppointment')}
                  </button>
                ) : null}
                {detail.cancellationAllowed ? (
                  <button type="button" className="secondary danger-action" disabled={cancelBusy} onClick={requestCancelAppointment} ref={cancelTriggerRef}>
                    {t('cancelAppointment')}
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
      {!selectedAppointmentId && !error ? <NeutralEmptyState>{t('chooseAppointment')}</NeutralEmptyState> : null}
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
  onNavigate: (view: CareView, resourceId?: string) => void;
  onChanged: () => void;
}) {
  const [forms, setForms] = useState<CareFormSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    corePublic<ItemsResponse<CareFormSummaryDTO>>('/care/forms')
      .then((response) => {
        if (active) setForms(itemsResponse(response));
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load forms.');
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  if (error) return <InlineError message={error} />;
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setForm(null);
    setMessage(null);
    setActionError(null);
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
    setActionError(null);
    try {
      await corePublic(`/care/forms/${encodeURIComponent(assignmentId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ answers }),
      });
      setMessage('Progress saved.');
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : 'Unable to save progress.');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    const validation = validateRequired(schema!, answers);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;
    setBusy(true);
    setActionError(null);
    try {
      await corePublic(`/care/forms/${encodeURIComponent(assignmentId)}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers, submittedByType: 'PATIENT' }),
      });
      setMessage('Your form has been submitted.');
      onChanged();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : 'Unable to submit the form.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="care-form-flow">
      {message ? <div className="notice success">{message}</div> : null}
      {actionError ? <InlineError message={actionError} /> : null}
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    corePublic<ItemsResponse<CareConsentSummaryDTO>>('/care/consents')
      .then((response) => {
        if (active) setConsents(itemsResponse(response));
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load consents.');
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  if (error) return <InlineError message={error} />;
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
    } catch (signError) {
      setError(signError instanceof Error ? signError.message : 'Unable to sign this consent.');
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
    corePublic<ItemsResponse<CareDocumentDTO>>('/care/documents')
      .then((response) => {
        if (active) setDocuments(itemsResponse(response));
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load documents.');
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  async function download(documentId: string) {
    setError(null);
    try {
      const result = await corePublic<{ downloadUrl?: string }>(`/care/documents/${encodeURIComponent(documentId)}/download`);
      if (result.downloadUrl) window.location.assign(result.downloadUrl);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Unable to download this document.');
    }
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

function PendingTaskRow({ task, onOpen }: { task: PendingTask; onOpen: () => void }) {
  return (
    <button type="button" className="care-list-item care-task-row" onClick={onOpen}>
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

function OverviewAppointmentCard({ appointment, onOpen }: { appointment: ManagedAppointmentResponseDTO; onOpen: () => void }) {
  const locationLabel = appointmentLocationLabel(appointment);
  const practitioner = practitionerDisplayName(appointment);
  const status = getPatientVisibleAppointmentStatus(appointment.status);

  return (
    <button type="button" className="care-list-item care-appointment-card" onClick={onOpen}>
      <span className="care-appointment-main">
        <strong className="care-appointment-title">{appointment.service?.name ?? t('appointmentFallback')}</strong>
        {appointment.startAt ? (
          <small className="care-appointment-time">{`${formatClinicDate(appointment.startAt, appointment, 'long')} - ${formatClinicTime(appointment.startAt, appointment)}`}</small>
        ) : null}
        {practitioner ? <small>{t('withPractitioner', { practitioner })}</small> : null}
        {locationLabel ? <small>{locationLabel}</small> : null}
      </span>
      <span className="care-row-side">
        {status ? <span className="care-status-pill">{status}</span> : null}
        <ArrowRight size={16} aria-hidden="true" />
      </span>
    </button>
  );
}

function OverviewDocumentList({ documents, onOpen }: { documents: CareDocumentDTO[]; onOpen: (id: string) => void }) {
  return (
    <div className="care-list">
      {documents.map((document) => (
        <OverviewDocumentRow key={document.id} document={document} onOpen={onOpen} />
      ))}
    </div>
  );
}

function OverviewDocumentRow({ document, onOpen }: { document: CareDocumentDTO; onOpen: (id: string) => void }) {
  const meta = documentMeta(document);
  return (
    <button type="button" className="care-list-item care-document-row" onClick={() => document.id && onOpen(document.id)}>
      <span>
        <strong>{document.title ?? document.originalFilename ?? t('documentFallback')}</strong>
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
  items: Array<{ id?: string; title?: string; status?: string; dueAt?: string; expiresAt?: string; assignedAt?: string; requestedAt?: string }>;
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

function overviewTasks(overview: CareOverviewDTO): PendingTask[] {
  const nextAppointmentId = overview.nextAppointment?.id;
  return [
    ...(overview.pendingForms ?? [])
      .filter((form) => form.id && pendingFormStatuses.has(form.status ?? ''))
      .map((form): PendingTask => ({
        id: form.id!,
        view: 'forms',
        typeLabel: t('form'),
        title: form.title ?? t('form'),
        actionLabel: t('completeForm'),
        context: taskContext(form.appointmentId, nextAppointmentId, form.dueAt ?? form.assignedAt),
        appointmentId: form.appointmentId,
        orderAt: form.dueAt ?? form.assignedAt,
      })),
    ...(overview.pendingConsents ?? [])
      .filter((consent) => consent.id && pendingConsentStatuses.has(consent.status ?? ''))
      .map((consent): PendingTask => ({
        id: consent.id!,
        view: 'consents',
        typeLabel: t('consent'),
        title: consent.title ?? t('consent'),
        actionLabel: t('reviewAndSign'),
        context: taskContext(consent.appointmentId, nextAppointmentId, consent.expiresAt ?? consent.requestedAt),
        appointmentId: consent.appointmentId,
        orderAt: consent.expiresAt ?? consent.requestedAt,
      })),
  ].sort((left, right) => {
    const leftForNext = left.appointmentId && left.appointmentId === nextAppointmentId ? 0 : 1;
    const rightForNext = right.appointmentId && right.appointmentId === nextAppointmentId ? 0 : 1;
    if (leftForNext !== rightForNext) return leftForNext - rightForNext;
    return timestamp(left.orderAt) - timestamp(right.orderAt);
  });
}

function taskContext(appointmentId?: string, nextAppointmentId?: string, date?: string) {
  if (appointmentId && appointmentId === nextAppointmentId) return t('forNextAppointment');
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
  return practitioner.displayName?.trim() || [practitioner.prefix, practitioner.firstName, practitioner.lastName].filter(Boolean).join(' ').trim();
}

function appointmentLocationLabel(appointment: ManagedAppointmentResponseDTO) {
  if (appointment.deliveryMode === 'VIRTUAL' || appointment.location?.type === 'VIRTUAL') return t('virtualAppointment');
  return appointment.location?.publicDisplayName?.trim() || appointment.location?.name?.trim() || '';
}

function documentMeta(document: CareDocumentDTO) {
  const date = document.documentDate ?? document.createdAt;
  return [date ? formatClinicDate(date) : null, document.category ?? document.contentType].filter(Boolean).join(' - ');
}

function getPatientVisibleAppointmentStatus(status?: string | null) {
  switch (status) {
    case 'SCHEDULED':
    case undefined:
    case null:
      return '';
    case 'PENDING_CONFIRMATION':
      return t('appointmentStatusPendingConfirmation');
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

const terminalAppointmentStatuses = new Set(['CANCELLED', 'COMPLETED', 'NO_SHOW']);

function groupAppointments(appointments: ManagedAppointmentResponseDTO[], now = new Date()): AppointmentGroups {
  const nowTime = now.getTime();
  const upcoming = appointments
    .filter((appointment) => isUpcomingAppointment(appointment, nowTime))
    .sort((left, right) => appointmentTime(left) - appointmentTime(right));
  const past = appointments
    .filter((appointment) => !isUpcomingAppointment(appointment, nowTime))
    .sort((left, right) => appointmentTime(right) - appointmentTime(left));
  return { upcoming, past };
}

function isUpcomingAppointment(appointment: ManagedAppointmentResponseDTO, nowTime: number) {
  if (!appointment.startAt || terminalAppointmentStatuses.has(appointment.status ?? '')) return false;
  return appointmentTime(appointment) >= nowTime;
}

function appointmentTime(appointment: ManagedAppointmentResponseDTO) {
  return timestamp(appointment.startAt);
}

function relevantAppointment(groups: AppointmentGroups) {
  return groups.upcoming[0] ?? groups.past[0] ?? null;
}

function getDefaultDesktopAppointment(groups: AppointmentGroups, excludedIds = new Set<string>()) {
  return relevantAppointment({
    upcoming: groups.upcoming.filter((appointment) => !appointment.id || !excludedIds.has(appointment.id)),
    past: groups.past.filter((appointment) => !appointment.id || !excludedIds.has(appointment.id)),
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
    [address?.city, address?.stateOrRegion, address?.postalCode].filter(Boolean).join(', '),
    address?.countryCode,
  ]
    .filter(Boolean)
    .join('\n');
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function buildRescheduleDays(settings: ManagedAppointmentResponseDTO, count: number) {
  return Array.from({ length: count }).map((_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + index);
    const key = toDateKey(date);
    return {
      key,
      weekday: new Intl.DateTimeFormat(careLocale(), { weekday: 'short' }).format(date),
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

function mergeAvailabilitySlots(current: AvailabilitySlotResponseDTO[], incoming: AvailabilitySlotResponseDTO[]) {
  const merged = new Map<string, AvailabilitySlotResponseDTO>();
  [...current, ...incoming].forEach((slot) => {
    if (!slot.startAt) return;
    merged.set(`${slot.locationId ?? ''}:${slot.employeeId ?? ''}:${slot.startAt}`, slot);
  });
  return Array.from(merged.values()).sort((left, right) => String(left.startAt).localeCompare(String(right.startAt)));
}

function groupRescheduleAvailability(days: RescheduleDay[], slotsByDate: Map<string, AvailabilitySlotResponseDTO[]>): RescheduleAvailabilityGroup[] {
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
      if (emptyStart && emptyEnd) groups.push({ type: 'empty', start: emptyStart, end: emptyEnd });
      emptyStart = null;
      emptyEnd = null;
      groups.push({ type: 'slots', day, slots: daySlots });
      return;
    }
    emptyStart ??= day;
    emptyEnd = day;
  });

  if (emptyStart && emptyEnd) groups.push({ type: 'empty', start: emptyStart, end: emptyEnd });
  return groups;
}

function rescheduleDayLabel(day: RescheduleDay) {
  return `${day.weekday}, ${day.label}`;
}

function rescheduleDayRangeLabel(start: RescheduleDay, end: RescheduleDay) {
  return start.key === end.key ? rescheduleDayLabel(start) : `${rescheduleDayLabel(start)} - ${rescheduleDayLabel(end)}`;
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
  const [narrow, setNarrow] = useState<boolean | null>(() => (
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(max-width: 640px)').matches
      : null
  ));

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
      className={active ? 'care-list-item care-appointment-list-card active' : 'care-list-item care-appointment-list-card'}
      onClick={onOpen}
      ref={buttonRef}
    >
      <span>
        <strong>{appointmentTitle(appointment)}</strong>
        {appointment.startAt ? <small>{formatClinicDateTime(appointment.startAt, appointment)}</small> : null}
        {status ? <small className="care-list-status">{status}</small> : null}
      </span>
      <ArrowRight size={16} aria-hidden="true" />
    </button>
  );
}

function AppointmentFacts({ appointment }: { appointment: ManagedAppointmentResponseDTO }) {
  const location = appointment.location;
  const address = appointmentAddress(appointment);
  const status = getPatientVisibleAppointmentStatus(appointment.status);
  const locationName = appointmentLocationLabel(appointment);
  const practitioner = practitionerDisplayName(appointment);
  const duration = appointment.durationMinutes ?? appointment.service?.durationMinutes;

  return (
    <div className="care-facts care-appointment-summary">
      <div className="care-appointment-summary-head">
        <div>
          <h3>{appointmentTitle(appointment)}</h3>
          {appointment.startAt ? (
            <>
              <p className="care-summary-date">{formatClinicDate(appointment.startAt, { ...appointment, timezone: location?.timezone || appointment.timezone }, 'long')}</p>
              <p className="care-summary-time">{formatClinicTime(appointment.startAt, { ...appointment, timezone: location?.timezone || appointment.timezone })}</p>
            </>
          ) : null}
        </div>
        {status ? <span className="care-status-pill">{status}</span> : null}
      </div>
      <dl className="care-fact-list">
        {practitioner ? <FactRow label={t('practitioner')} value={practitioner} /> : null}
        {locationName ? <FactRow label={t('location')} value={locationName} /> : null}
        {address ? <FactRow label={t('address')} value={address} /> : null}
        {duration ? <FactRow label={t('duration')} value={t('durationMinutes', { count: duration })} /> : null}
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
      <button type="button" aria-label={t('backToAppointmentDetails')} className="care-mobile-back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        {t('appointmentDetails')}
      </button>
      <AppointmentRescheduleFlow appointment={appointment} onCancel={onBack} onSubmit={onSubmit} onSuccess={onSuccess} />
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
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    requestAnimationFrame(() => {
      const focusTarget = dialogRef.current?.querySelector<HTMLElement>('button:not([disabled])');
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
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
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
    <div className="care-dialog-overlay care-cancel-dialog-overlay" onMouseDown={() => !busy && onClose()}>
      <div
        aria-labelledby="care-cancel-dialog-title"
        aria-describedby="care-cancel-dialog-description"
        aria-modal="true"
        className="care-dialog care-confirm-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <section className="care-confirm-content" aria-labelledby="care-cancel-dialog-title">
          <header className="care-confirm-header">
            <h2 id="care-cancel-dialog-title">{t('cancelAppointmentTitle')}</h2>
          </header>
          <div className="care-confirm-description" id="care-cancel-dialog-description">
            <p className="muted">{t('cancelAppointmentDescription')}</p>
            <p className="muted">{t('cancelAppointmentClinicNotified')}</p>
          </div>
          {error ? <InlineError message={error} /> : null}
          <div className="actions care-confirm-actions">
            <button type="button" className="secondary" disabled={busy} onClick={onClose}>
              {t('keepAppointment')}
            </button>
            <button type="button" className="danger-confirm-action" disabled={busy} aria-busy={busy} onClick={onConfirm}>
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
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    requestAnimationFrame(() => {
      const focusTarget = dialog?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      focusTarget?.focus();
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!dirty) onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
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
    <div className="care-dialog-overlay" onMouseDown={() => !dirty && onClose()}>
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
  const [slots, setSlots] = useState<AvailabilitySlotResponseDTO[] | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlotResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [step, setStep] = useState<'choose' | 'confirm'>('choose');
  const [submitting, setSubmitting] = useState(false);
  const [availabilityKey, setAvailabilityKey] = useState(0);
  const [visibleDayCount, setVisibleDayCount] = useState(INITIAL_RESCHEDULE_DAY_COUNT);
  const days = useMemo(() => (appointment ? buildRescheduleDays(appointment, MAX_RESCHEDULE_DAY_COUNT) : []), [appointment]);
  const visibleDays = useMemo(() => days.slice(0, visibleDayCount), [days, visibleDayCount]);
  const slotsByDate = useMemo(() => {
    const grouped = new Map<string, AvailabilitySlotResponseDTO[]>();
    (slots ?? []).forEach((slot) => {
      const key = slotDateKey(slot);
      if (!key) return;
      grouped.set(key, [...(grouped.get(key) ?? []), slot]);
    });
    grouped.forEach((dateSlots, key) => {
      grouped.set(key, dateSlots.sort((left, right) => String(left.startAt).localeCompare(String(right.startAt))));
    });
    return grouped;
  }, [slots]);
  const availabilityGroups = useMemo(() => groupRescheduleAvailability(visibleDays, slotsByDate), [visibleDays, slotsByDate]);
  const canLoadMoreDays = visibleDayCount < days.length;
  const canLoadAvailability = Boolean(appointment?.id);

  const fetchAvailabilityRange = useCallback(async (fromIndex: number, toIndexExclusive: number) => {
    if (!appointment?.id) throw new Error('APPOINTMENT_NOT_RESCHEDULABLE');
    const firstDay = days[fromIndex];
    const lastDay = days[toIndexExclusive - 1];
    if (!firstDay || !lastDay) return [];

    const query = new URLSearchParams({
      from: firstDay.key,
      to: lastDay.key,
    });
    const items = await corePublic<AvailabilitySlotResponseDTO[]>(`/care/appointments/${encodeURIComponent(appointment.id)}/availability?${query}`);
    return items.filter((slot) => slot.startAt);
  }, [appointment?.id, days]);

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
          setError(isRescheduleNoLongerAllowedError(error) ? t('rescheduleNoLongerAllowed') : t('rescheduleUnavailable'));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [appointment, availabilityKey, canLoadAvailability, fetchAvailabilityRange]);

  async function loadMoreAvailability() {
    if (loadingMore || loading || !canLoadMoreDays) return;
    const nextVisibleDayCount = Math.min(days.length, visibleDayCount + RESCHEDULE_DAY_LOAD_COUNT);
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const items = await fetchAvailabilityRange(visibleDayCount, nextVisibleDayCount);
      setSlots((current) => mergeAvailabilitySlots(current ?? [], items));
      setVisibleDayCount(nextVisibleDayCount);
    } catch (error) {
      setLoadMoreError(isRescheduleNoLongerAllowedError(error) ? t('rescheduleNoLongerAllowed') : t('rescheduleUnavailable'));
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
        <ContentLoader />
      </section>
    );
  }

  return (
    <section className="care-reschedule-flow" aria-labelledby={titleId}>
      <div className="care-block-heading">
        <h2 id={titleId}>{t('rescheduleAppointment')}</h2>
        <button type="button" className="care-icon-action" aria-label={t('keepCurrentAppointment')} disabled={submitting} onClick={onCancel}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      {step === 'choose' ? (
        <>
          <div className="reschedule-availability">
            <h3>{t('availableTimes')}</h3>
            {error ? <InlineError message={error} /> : null}
            {loading ? <p className="muted reschedule-empty" aria-live="polite">{t('loadingAvailableTimes')}</p> : null}
            {!loading && !error ? (
              <div className="reschedule-day-list">
                {availabilityGroups.map((group, index) => {
                  const groupKey = group.type === 'slots' ? group.day.key : `${group.start.key}-${group.end.key}`;
                  const startsMoreAvailability = index > 0 && groupKey.startsWith(days[INITIAL_RESCHEDULE_DAY_COUNT]?.key ?? '');
                  return (
                    <section key={groupKey} className="reschedule-day-section">
                      {startsMoreAvailability ? <h3 className="reschedule-more-heading">{t('moreAvailability')}</h3> : null}
                      {group.type === 'slots' ? (
                        <>
                          <h4>{rescheduleDayLabel(group.day)}</h4>
                          <div className="reschedule-times">
                            {group.slots.map((slot) => (
                              <button
                                key={`${slot.employeeId}-${slot.startAt}`}
                                type="button"
                                className={selectedSlot?.startAt === slot.startAt && selectedSlot?.employeeId === slot.employeeId ? 'reschedule-time active' : 'reschedule-time'}
                                aria-pressed={selectedSlot?.startAt === slot.startAt && selectedSlot?.employeeId === slot.employeeId}
                                disabled={submitting}
                                onClick={() => setSelectedSlot(slot)}
                              >
                                {slot.startAt ? formatClinicTime(slot.startAt, appointment) : ''}
                              </button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <h4>{rescheduleDayRangeLabel(group.start, group.end)}</h4>
                          <p className="muted reschedule-empty">{t('noAvailableTimes')}</p>
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
                {loadingMore ? <p className="muted reschedule-empty reschedule-bottom-loader" aria-live="polite">{t('loadingAvailableTimes')}</p> : null}
                {loadMoreError ? <InlineError message={loadMoreError} /> : null}
              </div>
            ) : null}
          </div>
          <div className="actions reschedule-flow-actions">
            <button type="button" className="secondary" disabled={submitting} onClick={onCancel}>
              {t('keepCurrentAppointment')}
            </button>
            <button type="button" disabled={!selectedSlot?.startAt || submitting} onClick={() => setStep('confirm')}>
              {t('continue')}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="reschedule-confirmation">
            <h3>{t('selectedTime')}</h3>
            <dl className="reschedule-details">
              {appointment.startAt ? <FactRow label={t('currentTime')} value={formatClinicDateTime(appointment.startAt, appointment)} /> : null}
              {selectedSlot?.startAt ? <FactRow label={t('newTime')} value={formatClinicDateTime(selectedSlot.startAt, appointment)} /> : null}
            </dl>
          </div>
          {error ? <InlineError message={error} /> : null}
          <div className="actions reschedule-flow-actions">
            <button type="button" className="secondary" disabled={submitting} onClick={() => setStep('choose')}>
              {t('chooseAnotherTime')}
            </button>
            <button type="button" disabled={submitting || !selectedSlot?.startAt} onClick={confirmReschedule}>
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
      ) : field.type === 'SINGLE_CHOICE' && field.options?.length ? (
        <span className="choice-stack">
          {field.options.map((option) => {
            const selected = selectedSingleChoiceOptionId(value);
            const checked = selected === option.id;
            const other = isOtherOption(option);
            const otherText = singleChoiceOtherText(value);
            return (
              <span key={option.id} className="checkbox-line">
                <input
                  type="radio"
                  checked={checked}
                  onChange={() => onChange(other ? { optionId: option.id, text: otherText } : option.id)}
                />
                <span>{text(option.label) || option.id}</span>
                {other ? (
                  <input
                    className="other-choice-input"
                    type="text"
                    value={checked ? otherText : ''}
                    disabled={!checked}
                    onChange={(event) => onChange({ optionId: option.id, text: event.target.value })}
                    onFocus={() => onChange({ optionId: option.id, text: otherText })}
                  />
                ) : null}
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

function NeutralEmptyState({ children }: { children: ReactNode }) {
  return <div className="care-empty-state">{children}</div>;
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

function isEmptyOtherChoiceAnswer(field: Field, value: unknown) {
  if (field.type !== 'SINGLE_CHOICE') return false;
  const otherOption = (field.options ?? []).find(isOtherOption);
  if (!otherOption) return false;
  if (selectedSingleChoiceOptionId(value) !== otherOption.id) return false;
  return !singleChoiceOtherText(value).trim();
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
        isEmptyOtherChoiceAnswer(field, value) ||
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
