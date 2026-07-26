import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CarePageClient, {
  careNavRevealScrollLeft,
  careNavScrollAvailability,
  careNavScrollBehavior,
} from './care-page-client';
import { corePublic } from '@/lib/api';

const router = {
  back: vi.fn(() => {
    window.history.back();
  }),
  push: vi.fn((href: string) => {
    window.history.pushState(null, '', href);
  }),
  replace: vi.fn((href: string) => {
    window.history.replaceState(null, '', href);
  }),
};

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock('@/lib/api', () => ({
  corePublic: vi.fn(),
}));

const mockCorePublic = vi.mocked(corePublic);

function rect(left: number, right: number) {
  return {
    bottom: 44,
    height: 44,
    left,
    right,
    top: 0,
    width: right - left,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function mockCareNavLayout() {
  let scrollLeft = 0;
  let clientWidth = 320;
  let scrollWidth = 700;

  const clientWidthSpy = vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function getClientWidth(this: Element) {
    return this.classList.contains('care-nav') ? clientWidth : 0;
  });
  const scrollWidthSpy = vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function getScrollWidth(this: Element) {
    return this.classList.contains('care-nav') ? scrollWidth : 0;
  });
  const scrollLeftGetSpy = vi.spyOn(Element.prototype, 'scrollLeft', 'get').mockImplementation(function getScrollLeft(this: Element) {
    return this.classList.contains('care-nav') ? scrollLeft : 0;
  });
  const scrollLeftSetSpy = vi.spyOn(Element.prototype, 'scrollLeft', 'set').mockImplementation(function setScrollLeft(this: Element, value) {
    if (this.classList.contains('care-nav')) scrollLeft = Number(value);
  });
  const rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: Element) {
    if (this.classList.contains('care-nav')) return rect(0, clientWidth);
    if (this.textContent?.includes('Overview')) return rect(0 - scrollLeft, 120 - scrollLeft);
    if (this.textContent?.includes('Appointments')) return rect(128 - scrollLeft, 270 - scrollLeft);
    if (this.textContent?.includes('Forms')) return rect(278 - scrollLeft, 360 - scrollLeft);
    if (this.textContent?.includes('Consents')) return rect(368 - scrollLeft, 478 - scrollLeft);
    if (this.textContent?.includes('Documents')) return rect(586 - scrollLeft, 700 - scrollLeft);
    return rect(0, 120);
  });
  const originalScrollTo = HTMLElement.prototype.scrollTo;
  const scrollToSpy = vi.fn(function scrollTo(this: HTMLElement, options?: ScrollToOptions | number) {
    if (!this.classList.contains('care-nav')) return;
    if (typeof options === 'number') {
      scrollLeft = options;
      return;
    }
    if (options?.left !== undefined) scrollLeft = Number(options.left);
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: scrollToSpy,
  });

  return {
    scrollToSpy,
    setScrollLeft(value: number) {
      scrollLeft = value;
    },
    setSizes(nextClientWidth: number, nextScrollWidth: number) {
      clientWidth = nextClientWidth;
      scrollWidth = nextScrollWidth;
      scrollLeft = Math.min(scrollLeft, Math.max(0, scrollWidth - clientWidth));
    },
    restore() {
      clientWidthSpy.mockRestore();
      scrollWidthSpy.mockRestore();
      scrollLeftGetSpy.mockRestore();
      scrollLeftSetSpy.mockRestore();
      rectSpy.mockRestore();
      if (originalScrollTo) {
        Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
          configurable: true,
          value: originalScrollTo,
        });
      } else {
        delete (HTMLElement.prototype as unknown as { scrollTo?: unknown }).scrollTo;
      }
    },
  };
}

function bootstrap(overrides = {}) {
  return {
    clinic: { id: 'clinic-1', name: 'Clinic 17' },
    patient: { id: 'patient-1', firstName: 'Karim', lastName: 'Gouba' },
    navigation: {
      overview: true,
      appointments: true,
      forms: true,
      consents: true,
      documents: true,
      payments: false,
    },
    summary: {
      upcomingAppointmentCount: 0,
      pendingFormCount: 0,
      pendingConsentCount: 0,
      sharedDocumentCount: 0,
      unpaidPaymentCount: 0,
    },
    ...overrides,
  };
}

function renderCarePage({
  boot = bootstrap(),
  overview = {},
  extraResponses = new Map<string, unknown>(),
  initialView = 'overview',
  initialResourceId,
  initialAction,
  initialRawAction,
}: {
  boot?: ReturnType<typeof bootstrap>;
  overview?: Record<string, unknown>;
  extraResponses?: Map<string, unknown>;
  initialView?: 'overview' | 'appointments' | 'forms' | 'consents' | 'documents' | 'payments';
  initialResourceId?: string;
  initialAction?: 'reschedule';
  initialRawAction?: string;
} = {}) {
  const params = new URLSearchParams();
  if (initialView !== 'overview') params.set('view', initialView);
  if (initialResourceId) params.set('resourceId', initialResourceId);
  if (initialRawAction) params.set('action', initialRawAction);
  else if (initialAction && initialResourceId) params.set('action', initialAction);
  window.history.replaceState(null, '', params.toString() ? `/care?${params}` : '/care');

  mockCorePublic.mockImplementation((path: string) => {
    if (path === '/care/bootstrap') return Promise.resolve(boot);
    if (path === '/care/overview') return Promise.resolve(overview);
    if (extraResponses.has(path)) return Promise.resolve(extraResponses.get(path));
    if (path === '/care/appointments') return Promise.resolve([]);
    if (path === '/care/documents') return Promise.resolve([]);
    if (path === '/care/forms') return Promise.resolve([]);
    if (path === '/care/consents') return Promise.resolve([]);
    return Promise.resolve({});
  });

  return render(<CarePageClient initialView={initialView} initialResourceId={initialResourceId} initialAction={initialAction} />);
}

function appointment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'apt-1',
    clinicSlug: 'clinic-17',
    status: 'SCHEDULED',
    startAt: '2099-07-28T10:35:00',
    durationMinutes: 30,
    service: { id: 'srv-1', name: 'Controle', durationMinutes: 30 },
    practitioner: { id: 'prac-1', displayName: 'Foulen El Foulani' },
    location: {
      id: 'loc-1',
      name: 'Main Location',
      address: {
        addressLine1: '208 Av. Filion',
        city: 'Saint-Lambert',
        stateOrRegion: 'QC',
        postalCode: 'J4R 1W9',
      },
    },
    cancellationAllowed: true,
    rescheduleAllowed: true,
    timeFormat: 'H12',
    ...overrides,
  };
}

function todayKey() {
  return dateKeyAfter(0);
}

function dateKeyAfter(offsetDays: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function mockCareViewport(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('max-width: 640px') ? matches : false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

describe('CarePageClient overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'confirm', {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
  });

  it('removes statistic cards and hides empty overview sections', async () => {
    renderCarePage();

    expect(await screen.findByText('Welcome, Karim')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Clinic 17' })).toBeTruthy();
    expect(screen.queryByText('Secure Care Page')).toBeNull();
    expect(screen.queryByText('Upcoming appointments')).toBeNull();
    expect(screen.queryByText('Pending forms')).toBeNull();
    expect(screen.queryByText('Pending consents')).toBeNull();
    expect(screen.queryByText('Shared documents')).toBeNull();
    expect(screen.queryByText('Things to complete')).toBeNull();
    expect(screen.queryByText('Next appointment')).toBeNull();
    expect(screen.queryByText('Recent documents')).toBeNull();
  });

  it('falls back safely when the patient first name is unavailable', async () => {
    renderCarePage({
      boot: bootstrap({
        patient: { id: 'patient-1', firstName: undefined, lastName: 'Gouba' },
      }),
    });

    expect(await screen.findByText('Gouba')).toBeTruthy();
  });

  it('keeps Sign out available as a compact utility action', async () => {
    renderCarePage();

    const signOut = await screen.findByRole('button', { name: 'Sign out' });
    expect(signOut.className).toContain('care-sign-out');

    fireEvent.click(signOut);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/');
    });
  });

  it('renders pending form and consent tasks with non-zero navigation badges', async () => {
    renderCarePage({
      boot: bootstrap({
        summary: {
          pendingFormCount: 2,
          pendingConsentCount: 1,
        },
      }),
      overview: {
        nextAppointment: { id: 'apt-1', service: { name: 'Consultation' } },
        pendingForms: [{ id: 'form-1', title: 'Intake form', status: 'ASSIGNED', appointmentId: 'apt-1' }],
        pendingConsents: [{ id: 'consent-1', title: 'Privacy consent', status: 'REQUESTED', requestedAt: '2026-07-24T10:00:00' }],
      },
    });

    expect(await screen.findByText('Things to complete')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Forms, 2 pending' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Consents, 1 pending' })).toBeTruthy();
    expect(screen.getByText('Complete form')).toBeTruthy();
    expect(screen.getByText('Review and sign')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Intake form/i }));

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/care?view=forms&resourceId=form-1');
    });
  });

  it('hides zero count badges', async () => {
    renderCarePage();

    await screen.findByText('Welcome, Karim');
    expect(screen.queryByRole('link', { name: 'Forms, 0 pending' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Consents, 0 pending' })).toBeNull();
  });

  it('caps large pending badges visually while preserving the real accessible count', async () => {
    renderCarePage({
      boot: bootstrap({
        summary: {
          pendingFormCount: 125,
          pendingConsentCount: 0,
        },
      }),
    });

    expect(await screen.findByRole('link', { name: 'Forms, 125 pending' })).toBeTruthy();
    expect(screen.getByText('99+')).toBeTruthy();
  });

  it('renders appointment context without blank optional metadata', async () => {
    renderCarePage({
      overview: {
        nextAppointment: {
          id: 'apt-1',
          startAt: '2026-07-28T10:35:00',
          service: { name: 'Physiotherapy' },
          status: 'SCHEDULED',
          timeFormat: 'H12',
        },
      },
    });

    expect(await screen.findByText('Next appointment')).toBeTruthy();
    expect(screen.getByText('Physiotherapy')).toBeTruthy();
    expect(screen.queryByText(/^With /)).toBeNull();
    expect(screen.queryByText('Scheduled')).toBeNull();

    const seeAll = screen.getByRole('button', { name: 'See all appointments' });
    expect(seeAll.className).toContain('care-section-link');
    expect(seeAll.className).not.toContain('secondary');
    expect(seeAll.querySelector('.lucide-arrow-right')).toBeTruthy();
    fireEvent.click(seeAll);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/care?view=appointments');
    });
  });

  it('shows meaningful appointment status and separates practitioner and location metadata', async () => {
    renderCarePage({
      overview: {
        nextAppointment: {
          id: 'apt-2',
          startAt: '2026-07-28T10:35:00',
          service: { name: 'Controle' },
          practitioner: { displayName: 'Foulen El Foulani' },
          location: { name: '17 Main Location' },
          status: 'PENDING_CONFIRMATION',
          timeFormat: 'H24',
        },
      },
    });

    const card = await screen.findByRole('button', { name: /Controle/i });
    const practitioner = screen.getByText('With Foulen El Foulani');
    const location = screen.getByText('17 Main Location');
    expect(screen.getByText('Pending confirmation')).toBeTruthy();
    expect(practitioner).toBeTruthy();
    expect(location).toBeTruthy();
    expect(practitioner).not.toBe(location);
    expect(card.querySelector('.lucide-arrow-right')).toBeTruthy();

    fireEvent.click(card);

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/care?view=appointments&resourceId=apt-2');
    });
  });

  it('shows recent documents only when present and opens the Documents tab', async () => {
    renderCarePage({
      overview: {
        recentDocuments: [{ id: 'doc-1', title: 'Lab results', documentDate: '2026-07-20', category: 'PDF' }],
      },
    });

    expect(await screen.findByText('Recent documents')).toBeTruthy();
    expect(screen.getByText('Lab results')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'See all documents' }));

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/care?view=documents');
    });
  });

  it('groups appointments and selects the nearest upcoming appointment by default', async () => {
    const near = appointment({ id: 'near', startAt: '2099-07-28T10:35:00', service: { id: 'srv-1', name: 'Near visit' } });
    const later = appointment({ id: 'later', startAt: '2099-08-02T10:35:00', service: { id: 'srv-1', name: 'Later visit' } });
    const past = appointment({ id: 'past', startAt: '2001-07-28T10:35:00', service: { id: 'srv-1', name: 'Past visit' }, status: 'COMPLETED' });
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [later, past, near]],
      ['/care/appointments/near', near],
    ]);

    renderCarePage({ initialView: 'appointments', extraResponses });

    expect(await screen.findByRole('heading', { name: 'Appointments' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Upcoming' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Past' })).toBeTruthy();
    expect(
      Boolean(screen.getByRole('button', { name: /Near visit/i }).compareDocumentPosition(screen.getByRole('button', { name: /Later visit/i })) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);

    expect(router.replace).not.toHaveBeenCalledWith('/care?view=appointments&resourceId=near');
    expect(await screen.findByRole('heading', { name: 'Near visit' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Near visit/i }).getAttribute('aria-current')).toBe('true');
    expect(screen.queryByText('Appointment details')).toBeNull();
  });

  it('selects the most recent past appointment when there are no upcoming appointments', async () => {
    const older = appointment({ id: 'older', startAt: '2001-01-10T10:00:00', service: { id: 'srv-1', name: 'Older visit' }, status: 'COMPLETED' });
    const recent = appointment({ id: 'recent', startAt: '2001-02-10T10:00:00', service: { id: 'srv-1', name: 'Recent visit' }, status: 'COMPLETED' });
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [older, recent]],
      ['/care/appointments/recent', recent],
    ]);

    renderCarePage({ initialView: 'appointments', extraResponses });

    expect(router.replace).not.toHaveBeenCalledWith('/care?view=appointments&resourceId=recent');
    expect(await screen.findByRole('heading', { name: 'Recent visit' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Upcoming' })).toBeNull();
    expect(
      Boolean(screen.getByRole('button', { name: /Recent visit/i }).compareDocumentPosition(screen.getByRole('button', { name: /Older visit/i })) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
  });

  it('preserves an explicit selected appointment and hides empty group headings', async () => {
    const selected = appointment({ id: 'selected', startAt: '2001-07-28T10:35:00', service: { id: 'srv-1', name: 'Selected past visit' }, status: 'COMPLETED' });
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [selected]],
      ['/care/appointments/selected', selected],
    ]);

    renderCarePage({ initialView: 'appointments', initialResourceId: 'selected', extraResponses });

    expect(await screen.findByRole('heading', { name: 'Selected past visit' })).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalledWith('/care?view=appointments&resourceId=selected');
    expect(screen.queryByRole('heading', { name: 'Upcoming' })).toBeNull();
  });

  it('falls back safely when the selected appointment is not accessible', async () => {
    const fallback = appointment({ id: 'fallback', service: { id: 'srv-1', name: 'Fallback visit' } });
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [fallback]],
      ['/care/appointments/fallback', fallback],
    ]);

    renderCarePage({ initialView: 'appointments', initialResourceId: 'missing', extraResponses });

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/care?view=appointments');
    });
    expect(await screen.findByRole('heading', { name: 'Fallback visit' })).toBeTruthy();
  });

  it('keeps the list first on mobile when no appointment is explicitly selected', async () => {
    mockCareViewport(true);
    const selected = appointment();
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [selected]],
    ]);

    renderCarePage({ initialView: 'appointments', extraResponses });

    expect(await screen.findByRole('button', { name: /Controle/i })).toBeTruthy();
    expect(screen.queryByText('Choose an appointment from the list to view its details.')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Controle' })).toBeNull();
    expect(router.replace).not.toHaveBeenCalledWith('/care?view=appointments&resourceId=apt-1');
  });

  it('opens appointment details as a single mobile view with push navigation', async () => {
    mockCareViewport(true);
    const selected = appointment();
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [selected]],
      ['/care/appointments/apt-1', selected],
    ]);

    renderCarePage({ initialView: 'appointments', extraResponses });

    fireEvent.click(await screen.findByRole('button', { name: /Controle/i }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/care?view=appointments&resourceId=apt-1');
    });
    expect(await screen.findByRole('heading', { name: 'Controle' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to appointments' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Upcoming' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Tuesday, Jul 28/i })).toBeNull();
  });

  it('uses mobile back action to return to the list without leaving the Care Page', async () => {
    mockCareViewport(true);
    const selected = appointment();
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [selected]],
      ['/care/appointments/apt-1', selected],
    ]);

    renderCarePage({ initialView: 'appointments', extraResponses });

    fireEvent.click(await screen.findByRole('button', { name: /Controle/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Back to appointments' }));

    await waitFor(() => {
      expect(router.back).toHaveBeenCalled();
    });
    expect(await screen.findByRole('heading', { name: 'Appointments' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Upcoming' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to appointments' })).toBeNull();
  });

  it('keeps mobile appointment details synchronized with browser back and forward', async () => {
    mockCareViewport(true);
    const selected = appointment();
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [selected]],
      ['/care/appointments/apt-1', selected],
    ]);

    renderCarePage({ initialView: 'appointments', extraResponses });

    fireEvent.click(await screen.findByRole('button', { name: /Controle/i }));
    expect(await screen.findByRole('button', { name: 'Back to appointments' })).toBeTruthy();

    window.history.back();

    await waitFor(() => {
      expect(window.location.href).toContain('/care?view=appointments');
      expect(window.location.href).not.toContain('resourceId=apt-1');
    });
    expect(await screen.findByRole('heading', { name: 'Upcoming' })).toBeTruthy();

    window.history.forward();

    await waitFor(() => {
      expect(window.location.href).toContain('resourceId=apt-1');
    });
    expect(await screen.findByRole('button', { name: 'Back to appointments' })).toBeTruthy();
  });

  it('opens a directly selected mobile appointment route without rendering the list beside it', async () => {
    mockCareViewport(true);
    const selected = appointment({ id: 'direct' });
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [selected]],
      ['/care/appointments/direct', selected],
    ]);

    renderCarePage({ initialView: 'appointments', initialResourceId: 'direct', extraResponses });

    expect(await screen.findByRole('heading', { name: 'Controle' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to appointments' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Upcoming' })).toBeNull();
  });

  it('clears an invalid mobile appointment selection back to the list with a generic message', async () => {
    mockCareViewport(true);
    const fallback = appointment({ id: 'fallback', service: { id: 'srv-1', name: 'Fallback visit' } });
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [fallback]],
    ]);

    renderCarePage({ initialView: 'appointments', initialResourceId: 'missing', extraResponses });

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/care?view=appointments');
    });
    expect(await screen.findByText('This appointment is no longer available.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Appointments' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Fallback visit' })).toBeNull();
  });

  it('shows a neutral no-appointments empty state', async () => {
    const { container } = renderCarePage({ initialView: 'appointments' });

    expect(await screen.findByText('You do not have any appointments yet.')).toBeTruthy();
    expect(container.querySelector('.care-empty-state')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Upcoming' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Past' })).toBeNull();
  });

  it('renders structured appointment details without raw scheduled status or empty rows', async () => {
    const selected = appointment();
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [selected]],
      ['/care/appointments/apt-1', selected],
    ]);

    renderCarePage({ initialView: 'appointments', initialResourceId: 'apt-1', extraResponses });

    expect(await screen.findByRole('heading', { name: 'Controle' })).toBeTruthy();
    expect(screen.getByText('Practitioner')).toBeTruthy();
    expect(screen.getByText('Foulen El Foulani')).toBeTruthy();
    expect(screen.getByText('Location')).toBeTruthy();
    expect(screen.getByText('Main Location')).toBeTruthy();
    expect(screen.getByText(/208 Av\. Filion/)).toBeTruthy();
    expect(screen.getByText('Duration')).toBeTruthy();
    expect(screen.getByText('30 minutes')).toBeTruthy();
    expect(screen.queryByText('SCHEDULED')).toBeNull();
    expect(screen.queryByText('Scheduled')).toBeNull();
  });

  it('shows a compact contextual cancellation dialog before cancelling', async () => {
    const selected = appointment({ id: 'cancel-me' });
    const cancelled = appointment({ id: 'cancel-me', status: 'CANCELLED', cancellationAllowed: false, rescheduleAllowed: false });
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [selected]],
      ['/care/appointments/cancel-me', selected],
      ['/care/appointments/cancel-me/cancel', cancelled],
    ]);

    renderCarePage({ initialView: 'appointments', initialResourceId: 'cancel-me', extraResponses });

    const cancel = await screen.findByRole('button', { name: 'Cancel appointment' });
    expect(cancel.className).toContain('secondary');
    expect(cancel.className).toContain('danger-action');

    fireEvent.click(cancel);

    const dialog = screen.getByRole('dialog', { name: 'Cancel appointment?' });
    const dialogView = within(dialog);
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('aria-describedby')).toBe('care-cancel-dialog-description');
    expect(dialogView.getByText('Are you sure you want to cancel this appointment?')).toBeTruthy();
    expect(dialogView.getByText('The clinic will be notified of the cancellation.')).toBeTruthy();
    expect(dialogView.queryByText('Controle')).toBeNull();
    expect(dialogView.queryByText(/Tuesday, Jul 28 - 10:35 AM/)).toBeNull();
    expect(dialogView.queryByText('With Foulen El Foulani')).toBeNull();
    expect(dialogView.queryByText('Main Location')).toBeNull();
    expect(dialogView.queryByText('cancel-me')).toBeNull();
    expect(dialogView.queryByText('SCHEDULED')).toBeNull();
    const keep = dialogView.getByRole('button', { name: 'Keep appointment' });
    const confirm = dialogView.getByRole('button', { name: 'Cancel appointment' });
    expect(keep.className).toContain('secondary');
    expect(confirm.className).toContain('danger-confirm-action');
    expect(mockCorePublic).not.toHaveBeenCalledWith('/care/appointments/cancel-me/cancel', { method: 'POST' });

    fireEvent.click(keep);
    expect(screen.queryByRole('dialog', { name: 'Cancel appointment?' })).toBeNull();
    expect(mockCorePublic).not.toHaveBeenCalledWith('/care/appointments/cancel-me/cancel', { method: 'POST' });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel appointment' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel appointment' }).at(-1)!);

    await waitFor(() => {
      expect(mockCorePublic).toHaveBeenCalledWith('/care/appointments/cancel-me/cancel', { method: 'POST' });
    });
    expect(await screen.findByText('Your appointment has been cancelled.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss appointment message' }));
    expect(screen.queryByText('Your appointment has been cancelled.')).toBeNull();
  });

  it('keeps the cancellation dialog open with a friendly error when cancellation fails', async () => {
    const selected = appointment({ id: 'cancel-fails' });
    mockCorePublic.mockImplementation((path: string) => {
      if (path === '/care/bootstrap') return Promise.resolve(bootstrap());
      if (path === '/care/appointments') return Promise.resolve([selected]);
      if (path === '/care/appointments/cancel-fails') return Promise.resolve(selected);
      if (path === '/care/appointments/cancel-fails/cancel') return Promise.reject(new Error('RAW_BACKEND_FAILURE'));
      return Promise.resolve({});
    });
    render(<CarePageClient initialView="appointments" initialResourceId="cancel-fails" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel appointment' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel appointment' }).at(-1)!);

    expect(await screen.findByText('We could not cancel the appointment. Please try again.')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Cancel appointment?' })).toBeTruthy();
    expect(screen.queryByText('RAW_BACKEND_FAILURE')).toBeNull();
  });

  it('hides appointment actions when current rules disallow changes', async () => {
    const selected = appointment({ id: 'locked', cancellationAllowed: false, rescheduleAllowed: false });
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [selected]],
      ['/care/appointments/locked', selected],
    ]);

    renderCarePage({ initialView: 'appointments', initialResourceId: 'locked', extraResponses });

    expect(await screen.findByRole('heading', { name: 'Controle' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Actions' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel appointment' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reschedule appointment' })).toBeNull();
  });

  it('uses availability slots for rescheduling instead of a raw datetime input', async () => {
    const selected = appointment({ id: 'move-me' });
    const date = todayKey();
    const weekEnd = dateKeyAfter(6);
    const newStartAt = `${date}T09:30:00`;
    const moved = appointment({ id: 'move-me', startAt: newStartAt });
    const availabilityPath = `/care/appointments/move-me/availability?from=${date}&to=${weekEnd}`;
    const slot = { serviceId: 'srv-1', locationId: 'loc-1', employeeId: 'prac-1', employeeName: 'Foulen El Foulani', startAt: newStartAt, endAt: `${date}T10:00:00` };
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [selected]],
      ['/care/appointments/move-me', selected],
      [availabilityPath, [slot]],
      ['/care/appointments/move-me/reschedule', moved],
    ]);
    const { container } = renderCarePage({ initialView: 'appointments', initialResourceId: 'move-me', extraResponses });

    fireEvent.click(await screen.findByRole('button', { name: 'Reschedule appointment' }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/care?view=appointments&resourceId=move-me&action=reschedule');
    });
    expect(container.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Reschedule appointment' })).toBeTruthy();
    expect(await screen.findByText('Available times')).toBeTruthy();
    expect(screen.queryByText('Current appointment')).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue' }).hasAttribute('disabled')).toBe(true);
    expect(container.querySelector('.care-appointment-detail-panel .care-reschedule-flow')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: '9:30 AM' }));

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Selected time')).toBeTruthy();
    expect(screen.getByText('Current time')).toBeTruthy();
    expect(screen.getByText('New time')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose another time' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm reschedule' }));

    await waitFor(() => {
      expect(mockCorePublic).toHaveBeenCalledWith('/care/appointments/move-me/reschedule', {
        method: 'POST',
        body: JSON.stringify({ newStartAt, employeeId: 'prac-1' }),
      });
    });
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/care?view=appointments&resourceId=move-me');
    });
    expect(await screen.findByText('Your appointment has been rescheduled.')).toBeTruthy();
  });

  it('shows a friendly no-availability state while rescheduling', async () => {
    const selected = appointment({ id: 'no-slots' });
    const date = todayKey();
    const weekEnd = dateKeyAfter(6);
    const availabilityPath = `/care/appointments/no-slots/availability?from=${date}&to=${weekEnd}`;
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [selected]],
      ['/care/appointments/no-slots', selected],
      [availabilityPath, []],
    ]);

    renderCarePage({ initialView: 'appointments', initialResourceId: 'no-slots', extraResponses });

    fireEvent.click(await screen.findByRole('button', { name: 'Reschedule appointment' }));

    expect(await screen.findByText('No available times were found for this date.')).toBeTruthy();
  });

  it('loads more rescheduling availability as additional date sections', async () => {
    const selected = appointment({ id: 'more-slots' });
    const firstDate = todayKey();
    const firstWeekEnd = dateKeyAfter(6);
    const secondWeekStart = dateKeyAfter(7);
    const lastDate = dateKeyAfter(13);
    const laterSlot = {
      serviceId: 'srv-1',
      locationId: 'loc-1',
      employeeId: 'prac-1',
      employeeName: 'Foulen El Foulani',
      startAt: `${lastDate}T11:00:00`,
      endAt: `${lastDate}T11:30:00`,
    };
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [selected]],
      ['/care/appointments/more-slots', selected],
      [`/care/appointments/more-slots/availability?from=${firstDate}&to=${firstWeekEnd}`, []],
      [`/care/appointments/more-slots/availability?from=${secondWeekStart}&to=${lastDate}`, [laterSlot]],
    ]);

    renderCarePage({ initialView: 'appointments', initialResourceId: 'more-slots', extraResponses });

    fireEvent.click(await screen.findByRole('button', { name: 'Reschedule appointment' }));
    expect(await screen.findByText('No available times were found for this date.')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    await waitFor(() => {
      expect(mockCorePublic).toHaveBeenCalledWith(`/care/appointments/more-slots/availability?from=${secondWeekStart}&to=${lastDate}`);
    });
    expect(await screen.findByText('More availability')).toBeTruthy();
    expect(await screen.findByRole('button', { name: '11:00 AM' })).toBeTruthy();
  });

  it('restores a desktop rescheduling URL as a dialog and closes back to appointment details', async () => {
    const selected = appointment({ id: 'deep-link' });
    const date = todayKey();
    const weekEnd = dateKeyAfter(6);
    const availabilityPath = `/care/appointments/deep-link/availability?from=${date}&to=${weekEnd}`;
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [selected]],
      ['/care/appointments/deep-link', selected],
      [availabilityPath, []],
    ]);

    renderCarePage({ initialView: 'appointments', initialResourceId: 'deep-link', initialAction: 'reschedule', extraResponses });

    expect(await screen.findByRole('dialog', { name: 'Reschedule appointment' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Controle' })).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Keep current appointment' })[0]);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/care?view=appointments&resourceId=deep-link');
    });
  });

  it('keeps rescheduling synchronized with browser back and forward', async () => {
    const selected = appointment({ id: 'history-reschedule' });
    const date = todayKey();
    const weekEnd = dateKeyAfter(6);
    const availabilityPath = `/care/appointments/history-reschedule/availability?from=${date}&to=${weekEnd}`;
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [selected]],
      ['/care/appointments/history-reschedule', selected],
      [availabilityPath, []],
    ]);

    renderCarePage({ initialView: 'appointments', initialResourceId: 'history-reschedule', extraResponses });

    fireEvent.click(await screen.findByRole('button', { name: 'Reschedule appointment' }));
    expect(await screen.findByRole('dialog', { name: 'Reschedule appointment' })).toBeTruthy();

    window.history.back();

    await waitFor(() => {
      expect(window.location.href).toContain('/care?view=appointments&resourceId=history-reschedule');
      expect(window.location.href).not.toContain('action=reschedule');
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Controle' })).toBeTruthy();

    window.history.forward();

    await waitFor(() => {
      expect(window.location.href).toContain('action=reschedule');
    });
    expect(await screen.findByRole('dialog', { name: 'Reschedule appointment' })).toBeTruthy();
  });

  it('opens mobile rescheduling as a page-like view without list or detail underneath', async () => {
    mockCareViewport(true);
    const selected = appointment({ id: 'mobile-reschedule' });
    const date = todayKey();
    const weekEnd = dateKeyAfter(6);
    const availabilityPath = `/care/appointments/mobile-reschedule/availability?from=${date}&to=${weekEnd}`;
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [selected]],
      ['/care/appointments/mobile-reschedule', selected],
      [availabilityPath, []],
    ]);

    renderCarePage({ initialView: 'appointments', initialResourceId: 'mobile-reschedule', initialAction: 'reschedule', extraResponses });

    expect(await screen.findByRole('button', { name: 'Back to appointment details' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Reschedule appointment' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Upcoming' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Actions' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Back to appointment details' }));

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/care?view=appointments&resourceId=mobile-reschedule');
    });
  });

  it('clears invalid appointment action values safely', async () => {
    const selected = appointment({ id: 'bad-action' });
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [selected]],
      ['/care/appointments/bad-action', selected],
    ]);

    renderCarePage({
      initialView: 'appointments',
      initialResourceId: 'bad-action',
      initialRawAction: 'print',
      extraResponses,
    });

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/care?view=appointments&resourceId=bad-action');
    });
    expect(await screen.findByRole('heading', { name: 'Controle' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps Care Page navigation horizontally scrollable on narrow screens', () => {
    const css = readFileSync(path.resolve(process.cwd(), 'app/globals.css'), 'utf8');

    expect(css).toMatch(/\.care-nav\s*{[\s\S]*?overflow-x:\s*auto/);
    expect(css).toMatch(/\.care-nav\s*{[\s\S]*?overflow-y:\s*hidden/);
    expect(css).toMatch(/\.care-nav\s*{[\s\S]*?flex-wrap:\s*nowrap/);
    expect(css).toMatch(/\.care-nav\s*{[\s\S]*?scroll-snap-type:\s*x proximity/);
    expect(css).toMatch(/\.care-shell\s*{[\s\S]*?max-width:\s*100vw/);
    expect(css).toMatch(/\.care-shell\s*{[\s\S]*?overflow-x:\s*clip/);
    expect(css).toMatch(/\.care-panel\s*{[\s\S]*?min-width:\s*0/);
    expect(css).toMatch(/\.care-nav-shell\s*{[\s\S]*?min-width:\s*0/);
    expect(css).toMatch(/\.care-nav\s*{[\s\S]*?width:\s*100%/);
    expect(css).toMatch(/\.care-nav\s*{[\s\S]*?max-width:\s*100%/);
    expect(css).toMatch(/\.care-nav a\s*{[\s\S]*?scroll-snap-align:\s*start/);
    expect(css).toMatch(/@media\s*\(max-width:\s*640px\)[\s\S]*\.shell\.care-shell\s*{[^}]*padding:/);
    expect(css).toMatch(/@media\s*\(max-width:\s*640px\)[\s\S]*\.care-nav-shell\s*{[^}]*position:\s*sticky/);
    expect(css).toMatch(/@media\s*\(max-width:\s*640px\)[\s\S]*\.care-nav\s*{[^}]*padding:\s*8px 16px/);
    expect(css).toMatch(/@media\s*\(max-width:\s*640px\)[\s\S]*\.care-nav\s*{[^}]*scroll-padding-inline:\s*16px/);
    expect(css).toMatch(/@media\s*\(max-width:\s*640px\)[\s\S]*\.care-nav a\s*{[^}]*min-height:\s*44px/);
  });

  it('marks the active route with active state and aria-current', async () => {
    renderCarePage({ initialView: 'documents' });

    const documents = await screen.findByRole('link', { name: 'Documents' });
    expect(documents.getAttribute('aria-current')).toBe('page');
    expect(documents.className).toContain('active');
  });

  it('calculates overflow fades with scroll thresholds', () => {
    expect(careNavScrollAvailability({ scrollLeft: 0, clientWidth: 320, scrollWidth: 700 })).toEqual({
      canScrollLeft: false,
      canScrollRight: true,
    });
    expect(careNavScrollAvailability({ scrollLeft: 90, clientWidth: 320, scrollWidth: 700 })).toEqual({
      canScrollLeft: true,
      canScrollRight: true,
    });
    expect(careNavScrollAvailability({ scrollLeft: 380, clientWidth: 320, scrollWidth: 700 })).toEqual({
      canScrollLeft: true,
      canScrollRight: false,
    });
    expect(careNavScrollAvailability({ scrollLeft: 0, clientWidth: 700, scrollWidth: 700 })).toEqual({
      canScrollLeft: false,
      canScrollRight: false,
    });
  });

  it('calculates active-tab centering without vertical page scrolling', () => {
    expect(careNavRevealScrollLeft({ left: 0, right: 320 }, { left: 370, right: 470 }, 0, 420)).toBe(260);
    expect(careNavRevealScrollLeft({ left: 0, right: 320 }, { left: -30, right: 70 }, 160, 420)).toBe(20);
    expect(careNavRevealScrollLeft({ left: 0, right: 320 }, { left: 30, right: 180 }, 100, 420)).toBe(45);
    expect(careNavRevealScrollLeft({ left: 0, right: 320 }, { left: 30, right: 180 }, 0, 0)).toBe(0);
  });

  it('uses reduced-motion safe scroll behavior', () => {
    expect(careNavScrollBehavior(true)).toBe('auto');
    expect(careNavScrollBehavior(false)).toBe('smooth');
  });

  it('renders fades from measured horizontal overflow and recalculates after scroll and resize', async () => {
    const layout = mockCareNavLayout();
    try {
      renderCarePage();
      const nav = await screen.findByRole('navigation', { name: 'Care page sections' });

      await waitFor(() => {
        expect(screen.queryByTestId('care-nav-left-fade')).toBeNull();
        expect(screen.getByTestId('care-nav-right-fade')).toBeTruthy();
      });

      layout.setScrollLeft(120);
      fireEvent.scroll(nav);

      await waitFor(() => {
        expect(screen.getByTestId('care-nav-left-fade')).toBeTruthy();
        expect(screen.getByTestId('care-nav-right-fade')).toBeTruthy();
      });

      layout.setScrollLeft(380);
      fireEvent.scroll(nav);

      await waitFor(() => {
        expect(screen.getByTestId('care-nav-left-fade')).toBeTruthy();
        expect(screen.queryByTestId('care-nav-right-fade')).toBeNull();
      });

      layout.setSizes(700, 700);
      window.dispatchEvent(new Event('resize'));

      await waitFor(() => {
        expect(screen.queryByTestId('care-nav-left-fade')).toBeNull();
        expect(screen.queryByTestId('care-nav-right-fade')).toBeNull();
      });
    } finally {
      layout.restore();
    }
  });

  it('centers Documents for direct navigation and when selected from overflow', async () => {
    const layout = mockCareNavLayout();
    try {
      renderCarePage({ initialView: 'documents' });

      await waitFor(() => {
        expect(layout.scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
      });
      expect((layout.scrollToSpy.mock.calls.at(-1)?.[0] as ScrollToOptions | undefined)?.left).toBe(380);
      expect(await screen.findByRole('link', { name: 'Documents' })).toBeTruthy();

      layout.scrollToSpy.mockClear();
      layout.setScrollLeft(0);
      fireEvent.click(screen.getByRole('link', { name: 'Overview' }));
      fireEvent.click(screen.getByRole('link', { name: 'Documents' }));

      await waitFor(() => {
        expect(router.replace).toHaveBeenCalledWith('/care?view=documents');
        expect(layout.scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
      });
      expect((layout.scrollToSpy.mock.calls.at(-1)?.[0] as ScrollToOptions | undefined)?.left).toBe(380);
    } finally {
      layout.restore();
    }
  });

  it('hides the edge fade immediately when selecting the first or last tab', async () => {
    const layout = mockCareNavLayout();
    try {
      renderCarePage({ initialView: 'documents' });

      await waitFor(() => {
        expect(screen.getByTestId('care-nav-left-fade')).toBeTruthy();
        expect(screen.queryByTestId('care-nav-right-fade')).toBeNull();
      });

      fireEvent.click(screen.getByRole('link', { name: 'Overview' }));

      await waitFor(() => {
        expect(router.replace).toHaveBeenCalledWith('/care');
        expect(screen.queryByTestId('care-nav-left-fade')).toBeNull();
        expect(screen.getByTestId('care-nav-right-fade')).toBeTruthy();
      });

      fireEvent.click(screen.getByRole('link', { name: 'Documents' }));

      await waitFor(() => {
        expect(router.replace).toHaveBeenCalledWith('/care?view=documents');
        expect(screen.getByTestId('care-nav-left-fade')).toBeTruthy();
        expect(screen.queryByTestId('care-nav-right-fade')).toBeNull();
      });
    } finally {
      layout.restore();
    }
  });
});
