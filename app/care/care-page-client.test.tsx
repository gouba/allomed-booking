import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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

  const clientWidthSpy = vi
    .spyOn(Element.prototype, 'clientWidth', 'get')
    .mockImplementation(function getClientWidth(this: Element) {
      return this.classList.contains('care-nav') ? clientWidth : 0;
    });
  const scrollWidthSpy = vi
    .spyOn(Element.prototype, 'scrollWidth', 'get')
    .mockImplementation(function getScrollWidth(this: Element) {
      return this.classList.contains('care-nav') ? scrollWidth : 0;
    });
  const scrollLeftGetSpy = vi
    .spyOn(Element.prototype, 'scrollLeft', 'get')
    .mockImplementation(function getScrollLeft(this: Element) {
      return this.classList.contains('care-nav') ? scrollLeft : 0;
    });
  const scrollLeftSetSpy = vi
    .spyOn(Element.prototype, 'scrollLeft', 'set')
    .mockImplementation(function setScrollLeft(this: Element, value) {
      if (this.classList.contains('care-nav')) scrollLeft = Number(value);
    });
  const rectSpy = vi
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockImplementation(function getRect(this: Element) {
      if (this.classList.contains('care-nav')) return rect(0, clientWidth);
      if (this.textContent?.includes('Overview'))
        return rect(0 - scrollLeft, 120 - scrollLeft);
      if (this.textContent?.includes('Appointments'))
        return rect(128 - scrollLeft, 270 - scrollLeft);
      if (this.textContent?.includes('Forms'))
        return rect(278 - scrollLeft, 360 - scrollLeft);
      if (this.textContent?.includes('Consents'))
        return rect(368 - scrollLeft, 478 - scrollLeft);
      if (this.textContent?.includes('Documents'))
        return rect(586 - scrollLeft, 700 - scrollLeft);
      return rect(0, 120);
    });
  const originalScrollTo = HTMLElement.prototype.scrollTo;
  const scrollToSpy = vi.fn(function scrollTo(
    this: HTMLElement,
    options?: ScrollToOptions | number,
  ) {
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
        delete (HTMLElement.prototype as unknown as { scrollTo?: unknown })
          .scrollTo;
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

function consentDocumentSchema() {
  return {
    sections: [
      {
        id: 'section-1',
        title: 'Consent section',
        blocks: [
          {
            id: 'consent-body',
            type: 'PARAGRAPH',
            label: 'Consent text',
            content: 'Consent body',
          },
          {
            id: 'consent-signature',
            type: 'SIGNATURE',
            label: 'Signature',
          },
        ],
      },
    ],
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
  initialView?:
    | 'overview'
    | 'appointments'
    | 'forms'
    | 'consents'
    | 'documents'
    | 'payments';
  initialResourceId?: string;
  initialAction?: 'reschedule';
  initialRawAction?: string;
} = {}) {
  const params = new URLSearchParams();
  if (initialView !== 'overview') params.set('view', initialView);
  if (initialResourceId) params.set('resourceId', initialResourceId);
  if (initialRawAction) params.set('action', initialRawAction);
  else if (initialAction && initialResourceId)
    params.set('action', initialAction);
  window.history.replaceState(
    null,
    '',
    params.toString() ? `/care?${params}` : '/care',
  );

  mockCorePublic.mockImplementation((path: string) => {
    if (path === '/care/bootstrap') return Promise.resolve(boot);
    if (path === '/care/overview') return Promise.resolve(overview);
    if (extraResponses.has(path))
      return Promise.resolve(extraResponses.get(path));
    if (path === '/care/appointments') return Promise.resolve([]);
    if (path === '/care/documents') return Promise.resolve([]);
    if (path === '/care/forms') return Promise.resolve([]);
    if (path === '/care/consents') return Promise.resolve([]);
    return Promise.resolve({});
  });

  return render(
    <CarePageClient
      initialView={initialView}
      initialResourceId={initialResourceId}
      initialAction={initialAction}
    />,
  );
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

function publicForm(overrides: Record<string, unknown> = {}) {
  return {
    open: true,
    status: 'SENT',
    title: 'Patient intake',
    description: 'Before your visit',
    draft: {},
    schema: {
      sections: [
        {
          id: 'section-1',
          label: 'Section 1',
          fields: [
            {
              id: 'patient-info',
              type: 'TEXT',
              label: 'Patient informations',
              required: true,
            },
          ],
        },
        {
          id: 'section-2',
          label: 'Medical details',
          fields: [{ id: 'notes', type: 'LONG_TEXT', label: 'Notes' }],
        },
      ],
    },
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
    expect(screen.getByText('You’re all caught up')).toBeTruthy();
    expect(
      screen.getByText(
        'There’s nothing that needs your attention right now. New appointments, forms, consents, and other updates from your clinic will appear here.',
      ),
    ).toBeTruthy();
    expect(document.querySelector('.care-empty-state')).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Clinic 17' }),
    ).toBeTruthy();
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

  it('shows a friendly expired-session page when the Care session cookie is missing', async () => {
    window.history.replaceState(null, '', '/care');
    mockCorePublic.mockImplementation((path: string) => {
      if (path === '/care/bootstrap')
        return Promise.reject(new Error('CARE_SESSION_REQUIRED'));
      return Promise.resolve({});
    });

    render(<CarePageClient initialView="overview" />);

    expect(
      await screen.findByRole('heading', { name: 'Care Page unavailable' }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Your secure Care Page session has expired. Please reopen your secure link.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('CARE_SESSION_REQUIRED')).toBeNull();
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
        pendingForms: [
          {
            id: 'form-1',
            title: 'Intake form',
            status: 'ASSIGNED',
            appointmentId: 'apt-1',
          },
        ],
        pendingConsents: [
          {
            id: 'consent-1',
            title: 'Privacy consent',
            status: 'REQUESTED',
            requestedAt: '2026-07-24T10:00:00',
          },
        ],
      },
    });

    expect(await screen.findByText('Things to complete')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Forms, 2 pending' })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Consents, 1 pending' }),
    ).toBeTruthy();
    expect(screen.getByText('Complete form')).toBeTruthy();
    expect(screen.getByText('Review and sign')).toBeTruthy();
    expect(screen.queryByText(/Due Jul 24/i)).toBeNull();
    expect(document.querySelector('.care-priority-block')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Intake form/i }));

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith(
        '/care?view=forms&resourceId=form-1',
      );
    });
  });

  it('hides zero count badges', async () => {
    renderCarePage();

    await screen.findByText('Welcome, Karim');
    expect(screen.queryByRole('link', { name: 'Forms, 0 pending' })).toBeNull();
    expect(
      screen.queryByRole('link', { name: 'Consents, 0 pending' }),
    ).toBeNull();
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

    expect(
      await screen.findByRole('link', { name: 'Forms, 125 pending' }),
    ).toBeTruthy();
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
      expect(router.push).toHaveBeenCalledWith(
        '/care?view=appointments&resourceId=apt-2',
      );
    });
  });

  it('shows recent documents only when present and opens the Documents tab', async () => {
    renderCarePage({
      overview: {
        recentDocuments: [
          {
            id: 'doc-1',
            title: 'Lab results',
            documentDate: '2026-07-20',
            category: 'PDF',
          },
        ],
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
    const near = appointment({
      id: 'near',
      startAt: '2099-07-28T10:35:00',
      service: { id: 'srv-1', name: 'Near visit' },
    });
    const later = appointment({
      id: 'later',
      startAt: '2099-08-02T10:35:00',
      service: { id: 'srv-1', name: 'Later visit' },
    });
    const past = appointment({
      id: 'past',
      startAt: '2001-07-28T10:35:00',
      service: { id: 'srv-1', name: 'Past visit' },
      status: 'COMPLETED',
    });
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [later, past, near]],
      ['/care/appointments/near', near],
    ]);

    renderCarePage({ initialView: 'appointments', extraResponses });

    expect(
      await screen.findByRole('heading', { name: 'Appointments' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Upcoming' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Past' })).toBeTruthy();
    expect(
      Boolean(
        screen
          .getByRole('button', { name: /Near visit/i })
          .compareDocumentPosition(
            screen.getByRole('button', { name: /Later visit/i }),
          ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);

    expect(router.replace).not.toHaveBeenCalledWith(
      '/care?view=appointments&resourceId=near',
    );
    expect(
      await screen.findByRole('heading', { name: 'Near visit' }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: /Near visit/i })
        .getAttribute('aria-current'),
    ).toBe('true');
    expect(screen.queryByText('Appointment details')).toBeNull();
  });

  it('selects the most recent past appointment when there are no upcoming appointments', async () => {
    const older = appointment({
      id: 'older',
      startAt: '2001-01-10T10:00:00',
      service: { id: 'srv-1', name: 'Older visit' },
      status: 'COMPLETED',
    });
    const recent = appointment({
      id: 'recent',
      startAt: '2001-02-10T10:00:00',
      service: { id: 'srv-1', name: 'Recent visit' },
      status: 'COMPLETED',
    });
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [older, recent]],
      ['/care/appointments/recent', recent],
    ]);

    renderCarePage({ initialView: 'appointments', extraResponses });

    expect(router.replace).not.toHaveBeenCalledWith(
      '/care?view=appointments&resourceId=recent',
    );
    expect(
      await screen.findByRole('heading', { name: 'Recent visit' }),
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Upcoming' })).toBeNull();
    expect(
      Boolean(
        screen
          .getByRole('button', { name: /Recent visit/i })
          .compareDocumentPosition(
            screen.getByRole('button', { name: /Older visit/i }),
          ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
  });

  it('preserves an explicit selected appointment and hides empty group headings', async () => {
    const selected = appointment({
      id: 'selected',
      startAt: '2001-07-28T10:35:00',
      service: { id: 'srv-1', name: 'Selected past visit' },
      status: 'COMPLETED',
    });
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [selected]],
      ['/care/appointments/selected', selected],
    ]);

    renderCarePage({
      initialView: 'appointments',
      initialResourceId: 'selected',
      extraResponses,
    });

    expect(
      await screen.findByRole('heading', { name: 'Selected past visit' }),
    ).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalledWith(
      '/care?view=appointments&resourceId=selected',
    );
    expect(screen.queryByRole('heading', { name: 'Upcoming' })).toBeNull();
  });

  it('falls back safely when the selected appointment is not accessible', async () => {
    const fallback = appointment({
      id: 'fallback',
      service: { id: 'srv-1', name: 'Fallback visit' },
    });
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [fallback]],
      ['/care/appointments/fallback', fallback],
    ]);

    renderCarePage({
      initialView: 'appointments',
      initialResourceId: 'missing',
      extraResponses,
    });

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/care?view=appointments');
    });
    expect(
      await screen.findByRole('heading', { name: 'Fallback visit' }),
    ).toBeTruthy();
  });

  it('keeps the list first on mobile when no appointment is explicitly selected', async () => {
    mockCareViewport(true);
    const selected = appointment();
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [selected]],
    ]);

    renderCarePage({ initialView: 'appointments', extraResponses });

    expect(
      await screen.findByRole('button', { name: /Controle/i }),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        'Choose an appointment from the list to view its details.',
      ),
    ).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Controle' })).toBeNull();
    expect(router.replace).not.toHaveBeenCalledWith(
      '/care?view=appointments&resourceId=apt-1',
    );
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
      expect(router.push).toHaveBeenCalledWith(
        '/care?view=appointments&resourceId=apt-1',
      );
    });
    expect(
      await screen.findByRole('heading', { name: 'Controle' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Back to appointments' }),
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Upcoming' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Tuesday, Jul 28/i }),
    ).toBeNull();
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
    fireEvent.click(
      await screen.findByRole('button', { name: 'Back to appointments' }),
    );

    await waitFor(() => {
      expect(router.back).toHaveBeenCalled();
    });
    expect(
      await screen.findByRole('heading', { name: 'Appointments' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Upcoming' })).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Back to appointments' }),
    ).toBeNull();
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
    expect(
      await screen.findByRole('button', { name: 'Back to appointments' }),
    ).toBeTruthy();

    window.history.back();

    await waitFor(() => {
      expect(window.location.href).toContain('/care?view=appointments');
      expect(window.location.href).not.toContain('resourceId=apt-1');
    });
    expect(
      await screen.findByRole('heading', { name: 'Upcoming' }),
    ).toBeTruthy();

    window.history.forward();

    await waitFor(() => {
      expect(window.location.href).toContain('resourceId=apt-1');
    });
    expect(
      await screen.findByRole('button', { name: 'Back to appointments' }),
    ).toBeTruthy();
  });

  it('opens a directly selected mobile appointment route without rendering the list beside it', async () => {
    mockCareViewport(true);
    const selected = appointment({ id: 'direct' });
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [selected]],
      ['/care/appointments/direct', selected],
    ]);

    renderCarePage({
      initialView: 'appointments',
      initialResourceId: 'direct',
      extraResponses,
    });

    expect(
      await screen.findByRole('heading', { name: 'Controle' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Back to appointments' }),
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Upcoming' })).toBeNull();
  });

  it('clears an invalid mobile appointment selection back to the list with a generic message', async () => {
    mockCareViewport(true);
    const fallback = appointment({
      id: 'fallback',
      service: { id: 'srv-1', name: 'Fallback visit' },
    });
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [fallback]],
    ]);

    renderCarePage({
      initialView: 'appointments',
      initialResourceId: 'missing',
      extraResponses,
    });

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/care?view=appointments');
    });
    expect(
      await screen.findByText('This appointment is no longer available.'),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Appointments' })).toBeTruthy();
    expect(
      screen.queryByRole('heading', { name: 'Fallback visit' }),
    ).toBeNull();
  });

  it('shows a neutral no-appointments empty state', async () => {
    const { container } = renderCarePage({ initialView: 'appointments' });

    expect(
      await screen.findByText('You do not have any appointments yet.'),
    ).toBeTruthy();
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

    renderCarePage({
      initialView: 'appointments',
      initialResourceId: 'apt-1',
      extraResponses,
    });

    expect(
      await screen.findByRole('heading', { name: 'Controle' }),
    ).toBeTruthy();
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
    const cancelled = appointment({
      id: 'cancel-me',
      status: 'CANCELLED',
      cancellationAllowed: false,
      rescheduleAllowed: false,
    });
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [selected]],
      ['/care/appointments/cancel-me', selected],
      ['/care/appointments/cancel-me/cancel', cancelled],
    ]);

    renderCarePage({
      initialView: 'appointments',
      initialResourceId: 'cancel-me',
      extraResponses,
    });

    const cancel = await screen.findByRole('button', {
      name: 'Cancel appointment',
    });
    expect(cancel.className).toContain('secondary');
    expect(cancel.className).toContain('danger-action');

    fireEvent.click(cancel);

    const dialog = screen.getByRole('dialog', { name: 'Cancel appointment?' });
    const dialogView = within(dialog);
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('aria-describedby')).toBe(
      'care-cancel-dialog-description',
    );
    expect(
      dialogView.getByText('Are you sure you want to cancel this appointment?'),
    ).toBeTruthy();
    expect(
      dialogView.getByText('The clinic will be notified of the cancellation.'),
    ).toBeTruthy();
    expect(dialogView.queryByText('Controle')).toBeNull();
    expect(dialogView.queryByText(/Tuesday, Jul 28 - 10:35 AM/)).toBeNull();
    expect(dialogView.queryByText('With Foulen El Foulani')).toBeNull();
    expect(dialogView.queryByText('Main Location')).toBeNull();
    expect(dialogView.queryByText('cancel-me')).toBeNull();
    expect(dialogView.queryByText('SCHEDULED')).toBeNull();
    const keep = dialogView.getByRole('button', { name: 'Keep appointment' });
    const confirm = dialogView.getByRole('button', {
      name: 'Cancel appointment',
    });
    expect(keep.className).toContain('secondary');
    expect(confirm.className).toContain('danger-confirm-action');
    expect(mockCorePublic).not.toHaveBeenCalledWith(
      '/care/appointments/cancel-me/cancel',
      { method: 'POST' },
    );

    fireEvent.click(keep);
    expect(
      screen.queryByRole('dialog', { name: 'Cancel appointment?' }),
    ).toBeNull();
    expect(mockCorePublic).not.toHaveBeenCalledWith(
      '/care/appointments/cancel-me/cancel',
      { method: 'POST' },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel appointment' }));
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Cancel appointment' }).at(-1)!,
    );

    await waitFor(() => {
      expect(mockCorePublic).toHaveBeenCalledWith(
        '/care/appointments/cancel-me/cancel',
        { method: 'POST' },
      );
    });
    expect(
      await screen.findByText('Your appointment has been cancelled.'),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss appointment message' }),
    );
    expect(
      screen.queryByText('Your appointment has been cancelled.'),
    ).toBeNull();
  });

  it('keeps the cancellation dialog open with a friendly error when cancellation fails', async () => {
    const selected = appointment({ id: 'cancel-fails' });
    mockCorePublic.mockImplementation((path: string) => {
      if (path === '/care/bootstrap') return Promise.resolve(bootstrap());
      if (path === '/care/appointments') return Promise.resolve([selected]);
      if (path === '/care/appointments/cancel-fails')
        return Promise.resolve(selected);
      if (path === '/care/appointments/cancel-fails/cancel')
        return Promise.reject(new Error('RAW_BACKEND_FAILURE'));
      return Promise.resolve({});
    });
    render(
      <CarePageClient
        initialView="appointments"
        initialResourceId="cancel-fails"
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cancel appointment' }),
    );
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Cancel appointment' }).at(-1)!,
    );

    expect(
      await screen.findByText(
        'We could not cancel the appointment. Please try again.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole('dialog', { name: 'Cancel appointment?' }),
    ).toBeTruthy();
    expect(screen.queryByText('RAW_BACKEND_FAILURE')).toBeNull();
  });

  it('hides appointment actions when current rules disallow changes', async () => {
    const selected = appointment({
      id: 'locked',
      cancellationAllowed: false,
      rescheduleAllowed: false,
    });
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [selected]],
      ['/care/appointments/locked', selected],
    ]);

    renderCarePage({
      initialView: 'appointments',
      initialResourceId: 'locked',
      extraResponses,
    });

    expect(
      await screen.findByRole('heading', { name: 'Controle' }),
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Actions' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Cancel appointment' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Reschedule appointment' }),
    ).toBeNull();
  });

  it('uses availability slots for rescheduling instead of a raw datetime input', async () => {
    const selected = appointment({ id: 'move-me' });
    const date = todayKey();
    const weekEnd = dateKeyAfter(6);
    const newStartAt = `${date}T09:30:00`;
    const moved = appointment({ id: 'move-me', startAt: newStartAt });
    const availabilityPath = `/care/appointments/move-me/availability?from=${date}&to=${weekEnd}`;
    const slot = {
      serviceId: 'srv-1',
      locationId: 'loc-1',
      employeeId: 'prac-1',
      employeeName: 'Foulen El Foulani',
      startAt: newStartAt,
      endAt: `${date}T10:00:00`,
    };
    const extraResponses = new Map<string, unknown>([
      ['/care/appointments', [selected]],
      ['/care/appointments/move-me', selected],
      [availabilityPath, [slot]],
      ['/care/appointments/move-me/reschedule', moved],
    ]);
    const { container } = renderCarePage({
      initialView: 'appointments',
      initialResourceId: 'move-me',
      extraResponses,
    });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Reschedule appointment' }),
    );

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith(
        '/care?view=appointments&resourceId=move-me&action=reschedule',
      );
    });
    expect(container.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(
      screen.getByRole('dialog', { name: 'Reschedule appointment' }),
    ).toBeTruthy();
    expect(await screen.findByText('Available times')).toBeTruthy();
    expect(screen.queryByText('Current appointment')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Continue' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(
      container.querySelector(
        '.care-appointment-detail-panel .care-reschedule-flow',
      ),
    ).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: '9:30 AM' }));

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Selected time')).toBeTruthy();
    expect(screen.getByText('Current time')).toBeTruthy();
    expect(screen.getByText('New time')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Choose another time' }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm reschedule' }));

    await waitFor(() => {
      expect(mockCorePublic).toHaveBeenCalledWith(
        '/care/appointments/move-me/reschedule',
        {
          method: 'POST',
          body: JSON.stringify({ newStartAt, employeeId: 'prac-1' }),
        },
      );
    });
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith(
        '/care?view=appointments&resourceId=move-me',
      );
    });
    expect(
      await screen.findByText('Your appointment has been rescheduled.'),
    ).toBeTruthy();
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

    renderCarePage({
      initialView: 'appointments',
      initialResourceId: 'no-slots',
      extraResponses,
    });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Reschedule appointment' }),
    );

    expect(
      await screen.findByText('No available times were found for this date.'),
    ).toBeTruthy();
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
      [
        `/care/appointments/more-slots/availability?from=${firstDate}&to=${firstWeekEnd}`,
        [],
      ],
      [
        `/care/appointments/more-slots/availability?from=${secondWeekStart}&to=${lastDate}`,
        [laterSlot],
      ],
    ]);

    renderCarePage({
      initialView: 'appointments',
      initialResourceId: 'more-slots',
      extraResponses,
    });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Reschedule appointment' }),
    );
    expect(
      await screen.findByText('No available times were found for this date.'),
    ).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    await waitFor(() => {
      expect(mockCorePublic).toHaveBeenCalledWith(
        `/care/appointments/more-slots/availability?from=${secondWeekStart}&to=${lastDate}`,
      );
    });
    expect(await screen.findByText('More availability')).toBeTruthy();
    expect(
      await screen.findByRole('button', { name: '11:00 AM' }),
    ).toBeTruthy();
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

    renderCarePage({
      initialView: 'appointments',
      initialResourceId: 'deep-link',
      initialAction: 'reschedule',
      extraResponses,
    });

    expect(
      await screen.findByRole('dialog', { name: 'Reschedule appointment' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Controle' })).toBeTruthy();

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Keep current appointment' })[0],
    );

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith(
        '/care?view=appointments&resourceId=deep-link',
      );
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

    renderCarePage({
      initialView: 'appointments',
      initialResourceId: 'history-reschedule',
      extraResponses,
    });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Reschedule appointment' }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Reschedule appointment' }),
    ).toBeTruthy();

    window.history.back();

    await waitFor(() => {
      expect(window.location.href).toContain(
        '/care?view=appointments&resourceId=history-reschedule',
      );
      expect(window.location.href).not.toContain('action=reschedule');
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Controle' })).toBeTruthy();

    window.history.forward();

    await waitFor(() => {
      expect(window.location.href).toContain('action=reschedule');
    });
    expect(
      await screen.findByRole('dialog', { name: 'Reschedule appointment' }),
    ).toBeTruthy();
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

    renderCarePage({
      initialView: 'appointments',
      initialResourceId: 'mobile-reschedule',
      initialAction: 'reschedule',
      extraResponses,
    });

    expect(
      await screen.findByRole('button', {
        name: 'Back to appointment details',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Reschedule appointment' }),
    ).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Upcoming' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Actions' })).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: 'Back to appointment details' }),
    );

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith(
        '/care?view=appointments&resourceId=mobile-reschedule',
      );
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
      expect(router.replace).toHaveBeenCalledWith(
        '/care?view=appointments&resourceId=bad-action',
      );
    });
    expect(
      await screen.findByRole('heading', { name: 'Controle' }),
    ).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps Care Page navigation horizontally scrollable on narrow screens', () => {
    const css = readFileSync(
      path.resolve(process.cwd(), 'app/globals.css'),
      'utf8',
    );

    expect(css).toMatch(/\.care-nav\s*{[\s\S]*?overflow-x:\s*auto/);
    expect(css).toMatch(/\.care-nav\s*{[\s\S]*?overflow-y:\s*hidden/);
    expect(css).toMatch(/\.care-nav\s*{[\s\S]*?flex-wrap:\s*nowrap/);
    expect(css).toMatch(
      /\.care-nav\s*{[\s\S]*?scroll-snap-type:\s*x proximity/,
    );
    expect(css).toMatch(/\.care-shell\s*{[\s\S]*?max-width:\s*100vw/);
    expect(css).toMatch(/\.care-shell\s*{[\s\S]*?overflow-x:\s*clip/);
    expect(css).toMatch(/\.care-panel\s*{[\s\S]*?min-width:\s*0/);
    expect(css).toMatch(
      /\.care-section,\s*\.care-forms-landing,\s*\.care-consents-landing\s*{[\s\S]*?width:\s*min\(860px, 100%\)/,
    );
    expect(css).toMatch(/\.care-nav-shell\s*{[\s\S]*?min-width:\s*0/);
    expect(css).toMatch(/\.care-nav\s*{[\s\S]*?width:\s*100%/);
    expect(css).toMatch(/\.care-nav\s*{[\s\S]*?max-width:\s*100%/);
    expect(css).toMatch(/\.care-nav a\s*{[\s\S]*?scroll-snap-align:\s*start/);
    expect(css).toMatch(
      /@media\s*\(max-width:\s*640px\)[\s\S]*\.shell\.care-shell\s*{[^}]*padding:/,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*640px\)[\s\S]*\.care-nav-shell\s*{[^}]*position:\s*sticky/,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*640px\)[\s\S]*\.care-nav\s*{[^}]*padding:\s*8px 16px/,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*640px\)[\s\S]*\.care-nav\s*{[^}]*scroll-padding-inline:\s*16px/,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*640px\)[\s\S]*\.care-nav a\s*{[^}]*min-height:\s*44px/,
    );
    expect(css).toMatch(
      /\.care-form-flow \.checkbox-line > input\[type="radio"\]\s*{[\s\S]*?width:\s*18px/,
    );
    expect(css).toMatch(
      /\.care-form-flow \.checkbox-line > input\[type="checkbox"\][\s\S]*?\.care-form-flow \.checkbox-line > input\[type="radio"\]\s*{[\s\S]*?width:\s*18px/,
    );
    expect(css).toMatch(
      /\.care-form-flow \.checkbox-line\s*{[\s\S]*?align-items:\s*center/,
    );
    expect(css).toMatch(/\.care-form-columns\s*{[\s\S]*?align-items:\s*start/);
    expect(css).toMatch(
      /\.care-form-columns > \.document-field\s*{[\s\S]*?align-self:\s*start/,
    );
    expect(css).toMatch(
      /\.care-choice-field > \.choice-stack\s*{[\s\S]*?gap:\s*6px/,
    );
    expect(css).toMatch(
      /\.document-field > \.field-label\s*{[\s\S]*?font-size:\s*13px/,
    );
    expect(css).toMatch(
      /\.document-field > \.field-label\s*{[\s\S]*?line-height:\s*1\.35/,
    );
    expect(css).toMatch(
      /\.document-field > \.field-description\s*{[\s\S]*?font-size:\s*13px/,
    );
    expect(css).toMatch(
      /\.document-field > \.field-description\s*{[\s\S]*?line-height:\s*1\.35/,
    );
    expect(css).toMatch(
      /\.care-choice-field > \.choice-stack\s*{[\s\S]*?margin-top:\s*0/,
    );
    expect(css).not.toMatch(/\.care-choice-field > legend/);
  });

  it('renders a signature guide line and x mark behind the drawing canvas', () => {
    const css = readFileSync(
      path.resolve(process.cwd(), 'app/globals.css'),
      'utf8',
    );

    expect(css).toMatch(/\.signature-canvas-wrap::before\s*{[\s\S]*?top:\s*58%/);
    expect(css).toMatch(
      /\.signature-canvas-wrap::before\s*{[\s\S]*?border-top:\s*1px solid #6b7280/,
    );
    expect(css).toMatch(/\.signature-canvas-wrap::after\s*{[\s\S]*?content:\s*"x"/);
    expect(css).toMatch(/\.signature-canvas\s*{[\s\S]*?background:\s*transparent/);
  });

  it('renders signature mode controls as compact tabs', () => {
    const css = readFileSync(
      path.resolve(process.cwd(), 'app/globals.css'),
      'utf8',
    );
    const source = readFileSync(
      path.resolve(process.cwd(), 'app/care/care-page-client.tsx'),
      'utf8',
    );

    expect(source).toMatch(/role="tablist"/);
    expect(source).toMatch(/role="tab"/);
    expect(source).toMatch(/aria-selected=\{method === mode\}/);
    expect(source).not.toMatch(/className=\{method === mode \? 'active secondary' : 'secondary'\}/);
    expect(css).toMatch(/\.signature-mode-tabs\s*{[\s\S]*?border-bottom:\s*1px solid var\(--line\)/);
    expect(css).toMatch(/\.signature-mode-tabs button\s*{[\s\S]*?min-height:\s*30px/);
    expect(css).toMatch(/\.signature-mode-tabs button\s*{[\s\S]*?border-bottom:\s*2px solid transparent/);
    expect(css).toMatch(/\.signature-mode-tabs button\.active\s*{[\s\S]*?border-bottom-color:\s*var\(--brand\)/);
  });

  it('keeps the signature clear control compact', () => {
    const css = readFileSync(
      path.resolve(process.cwd(), 'app/globals.css'),
      'utf8',
    );

    expect(css).toMatch(/\.signature-clear\s*{[\s\S]*?min-height:\s*28px/);
    expect(css).toMatch(/\.signature-clear\s*{[\s\S]*?padding:\s*4px 8px/);
    expect(css).toMatch(/\.signature-clear\s*{[\s\S]*?font-size:\s*13px/);
  });

  it('renders submitted signature timestamp as one electronic signature line', () => {
    const source = readFileSync(
      path.resolve(process.cwd(), 'app/care/care-page-client.tsx'),
      'utf8',
    );

    expect(source).toContain(
      "signatureSignedOnAt: 'Electronically signed on {date} at {time}'",
    );
    expect(source).toMatch(/function signatureSignedLine/);
    expect(source).toMatch(/date:\s*formatClinicDate\(signedAt\)/);
    expect(source).toMatch(/time:\s*formatClinicTime\(signedAt\)/);
  });

  it('renders consents as a forms-style list with empty groups hidden', async () => {
    renderCarePage({
      initialView: 'consents',
      extraResponses: new Map([
        [
          '/care/consents',
          [
            {
              id: 'consent-signed',
              title: 'Privacy consent',
              status: 'SIGNED',
              requestedAt: '2026-08-08T09:24:00',
            },
            {
              id: 'consent-cancelled',
              title: 'Cancelled consent',
              status: 'CANCELLED',
              requestedAt: '2026-08-08T09:24:00',
            },
          ],
        ],
      ]),
    });

    expect(await screen.findByRole('heading', { name: 'Consents' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Signed or unavailable' }))
      .toBeTruthy();
    expect(screen.getByRole('button', { name: /Privacy consent/i })).toBeTruthy();
    expect(screen.getByText('Signed')).toBeTruthy();
    expect(screen.queryByText('Completed')).toBeNull();
    expect(screen.queryByRole('button', { name: /Cancelled consent/i })).toBeNull();
    expect(screen.queryByText(/Due Aug 08/i)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Needs signature' })).toBeNull();
    expect(screen.queryByText('Consent details')).toBeNull();
    expect(screen.queryByText('No items.')).toBeNull();
  });

  it('opens consent detail full page with a back button', async () => {
    renderCarePage({
      initialView: 'consents',
      extraResponses: new Map([
        [
          '/care/consents',
          [
            {
              id: 'consent-1',
              title: 'Treatment consent',
              status: 'REQUESTED',
              requestedAt: '2026-08-08T09:24:00',
            },
          ],
        ],
        [
          '/care/consents/consent-1',
          {
            open: true,
            title: 'Treatment consent',
            documentSchema: consentDocumentSchema(),
            requiredAcknowledgements: [],
          },
        ],
      ]),
    });

    fireEvent.click(await screen.findByRole('button', { name: /Treatment consent/i }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith(
        '/care?view=consents&resourceId=consent-1',
      );
    });
    expect(await screen.findByRole('heading', { name: 'Treatment consent' }))
      .toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to consents' })).toBeTruthy();
    expect(screen.queryByText('Consent details')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Back to consents' }));

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/care?view=consents');
    });
  });

  it('signs consent without a separate final confirmation checkbox', async () => {
    renderCarePage({
      initialView: 'consents',
      extraResponses: new Map([
        [
          '/care/consents',
          [
            {
              id: 'consent-1',
              title: 'Treatment consent',
              status: 'REQUESTED',
              requestedAt: '2026-08-08T09:24:00',
            },
          ],
        ],
        [
          '/care/consents/consent-1',
          {
            open: true,
            title: 'Treatment consent',
            documentSchema: consentDocumentSchema(),
            requiredAcknowledgements: [],
          },
        ],
      ]),
    });

    fireEvent.click(await screen.findByRole('button', { name: /Treatment consent/i }));

    expect(await screen.findByRole('heading', { name: 'Treatment consent' }))
      .toBeTruthy();
    expect(
      screen.queryByText(/I confirm that I am signing this consent electronically/i),
    ).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Type' }));
    fireEvent.change(screen.getByLabelText(/Full name/), {
      target: { value: 'Karim Gouba' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign consent' }));

    await waitFor(() => {
      expect(mockCorePublic).toHaveBeenCalledWith(
        '/care/consents/consent-1/sign',
        expect.any(Object),
      );
    });
    const signCall = mockCorePublic.mock.calls.find(
      ([pathName]) => pathName === '/care/consents/consent-1/sign',
    );
    const request = signCall?.[1] as { body?: unknown };
    const body = JSON.parse(String(request.body));
    expect(body).toEqual({
      acknowledgements: {},
      signatures: {
        'consent-signature': { method: 'TYPED', typedName: 'Karim Gouba' },
      },
    });
    expect(body).not.toHaveProperty('finalConfirmation');
  });

  it('shows missing consent signature validation under the signature box', async () => {
    renderCarePage({
      initialView: 'consents',
      extraResponses: new Map([
        [
          '/care/consents',
          [
            {
              id: 'consent-1',
              title: 'Treatment consent',
              status: 'REQUESTED',
              requestedAt: '2026-08-08T09:24:00',
            },
          ],
        ],
        [
          '/care/consents/consent-1',
          {
            open: true,
            title: 'Treatment consent',
            documentSchema: consentDocumentSchema(),
            requiredAcknowledgements: [],
          },
        ],
      ]),
    });

    fireEvent.click(await screen.findByRole('button', { name: /Treatment consent/i }));
    expect(await screen.findByRole('heading', { name: 'Treatment consent' }))
      .toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Sign consent' }));

    const signatureField = document.querySelector(
      '[data-field-id="consent-signature"]',
    );
    expect(signatureField?.textContent).toContain(
      'Please complete the signing details.',
    );
    expect(signatureField?.getAttribute('data-invalid')).toBe('true');
    const css = readFileSync(
      path.resolve(process.cwd(), 'app/globals.css'),
      'utf8',
    );
    expect(css).toMatch(
      /\.signature-field\[data-invalid="true"\] \.signature-canvas-wrap\s*{[\s\S]*?border-color:\s*#d92d20/,
    );
    expect(screen.getByRole('heading', { name: 'Treatment consent' }))
      .toBeTruthy();
    expect(document.querySelector('.notice.danger')).toBeNull();
    expect(mockCorePublic).not.toHaveBeenCalledWith(
      '/care/consents/consent-1/sign',
      expect.any(Object),
    );
  });

  it('shows consent signature and acknowledgement validation together', async () => {
    renderCarePage({
      initialView: 'consents',
      extraResponses: new Map([
        [
          '/care/consents',
          [
            {
              id: 'consent-1',
              title: 'Treatment consent',
              status: 'REQUESTED',
              requestedAt: '2026-08-08T09:24:00',
            },
          ],
        ],
        [
          '/care/consents/consent-1',
          {
            open: true,
            title: 'Treatment consent',
            documentSchema: {
              sections: [
                {
                  id: 'section-1',
                  title: 'Consent section',
                  blocks: [
                    {
                      id: 'consent-body',
                      type: 'PARAGRAPH',
                      label: 'Consent text',
                      content: 'Consent body',
                    },
                    {
                      id: 'ack-1',
                      type: 'ACKNOWLEDGEMENT',
                      label: 'Acknowledgement',
                      content:
                        'I acknowledge that I have read and understood this consent.',
                      required: true,
                    },
                    {
                      id: 'consent-signature',
                      type: 'SIGNATURE',
                      label: 'Signature',
                    },
                  ],
                },
              ],
            },
            requiredAcknowledgements: [],
          },
        ],
      ]),
    });

    fireEvent.click(await screen.findByRole('button', { name: /Treatment consent/i }));
    expect(await screen.findByRole('heading', { name: 'Treatment consent' }))
      .toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign consent' }));

    expect(screen.getByText('Please complete the signing details.'))
      .toBeTruthy();
    expect(screen.getByText('Please complete the required acknowledgement.'))
      .toBeTruthy();
    expect(mockCorePublic).not.toHaveBeenCalledWith(
      '/care/consents/consent-1/sign',
      expect.any(Object),
    );
  });

  it('renders consent acknowledgements at their document block position', async () => {
    const css = readFileSync(
      path.resolve(process.cwd(), 'app/globals.css'),
      'utf8',
    );

    renderCarePage({
      initialView: 'consents',
      extraResponses: new Map([
        [
          '/care/consents',
          [
            {
              id: 'consent-1',
              title: 'Treatment consent',
              status: 'REQUESTED',
              requestedAt: '2026-08-08T09:24:00',
            },
          ],
        ],
        [
          '/care/consents/consent-1',
          {
            open: true,
            title: 'Treatment consent',
            documentSchema: {
              sections: [
                {
                  id: 'section-1',
                  title: 'Consent section',
                  blocks: [
                    {
                      id: 'consent-body',
                      type: 'PARAGRAPH',
                      label: 'Consent text',
                      content: 'Consent body',
                    },
                    {
                      id: 'ack-1',
                      type: 'ACKNOWLEDGEMENT',
                      label: 'Acknowledgement',
                      content:
                        'I acknowledge that I have read and understood this consent.',
                      required: true,
                    },
                    {
                      id: 'consent-signature',
                      type: 'SIGNATURE',
                      label: 'Signature',
                    },
                  ],
                },
              ],
            },
            requiredAcknowledgements: [
              {
                id: 'legacy-ack',
                label: 'Legacy bottom acknowledgement',
              },
            ],
          },
        ],
      ]),
    });

    fireEvent.click(await screen.findByRole('button', { name: /Treatment consent/i }));
    expect(
      await screen.findByText(
        /I acknowledge that I have read and understood this consent\./,
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Legacy bottom acknowledgement')).toBeNull();
    expect(css).toMatch(
      /\.consent-acknowledgement-block\s*{[\s\S]*?grid-template-columns:\s*18px minmax\(0, 1fr\)[\s\S]*?align-items:\s*center/,
    );
    expect(css).toMatch(
      /\.consent-acknowledgement-block input\[type="checkbox"\]\s*{[\s\S]*?height:\s*18px[\s\S]*?margin:\s*0/,
    );
  });

  it('renders consent body content with form section heading styles', async () => {
    const source = readFileSync(
      path.resolve(process.cwd(), 'app/care/care-page-client.tsx'),
      'utf8',
    );
    const css = readFileSync(
      path.resolve(process.cwd(), 'app/globals.css'),
      'utf8',
    );

    renderCarePage({
      initialView: 'consents',
      extraResponses: new Map([
        [
          '/care/consents',
          [
            {
              id: 'consent-1',
              title: 'Treatment consent',
              status: 'REQUESTED',
              requestedAt: '2026-08-08T09:24:00',
            },
          ],
        ],
        [
          '/care/consents/consent-1',
          {
            open: true,
            title: 'Treatment consent',
            documentSchema: {
              sections: [
                {
                  id: 'section-1',
                  title: 'Consent section',
                  blocks: [
                    {
                      id: 'consent-body',
                      type: 'PARAGRAPH',
                      label: 'Consent text',
                      content: 'Consent body',
                    },
                    {
                      id: 'consent-divider',
                      type: 'DIVIDER',
                      label: 'Divider',
                    },
                  ],
                },
              ],
            },
            requiredAcknowledgements: [],
          },
        ],
      ]),
    });

    fireEvent.click(await screen.findByRole('button', { name: /Treatment consent/i }));

    const sectionHeading = await screen.findByRole('heading', {
      level: 3,
      name: 'Consent section',
    });
    expect(sectionHeading.closest('.document-section-heading')).toBeTruthy();
    expect(screen.getByText('Consent body')).toBeTruthy();
    expect(document.querySelector('hr.consent-document-divider')).toBeTruthy();
    expect(source).toMatch(/function ConsentDocumentSections/);
    expect(source).toMatch(/function normalizeConsentDocument/);
    expect(source).not.toMatch(
      new RegExp(['function consentBody', 'Sections'].join('')),
    );
    expect(source).toMatch(/<h3>\{section\.title\}<\/h3>/);
    expect(css).toMatch(/\.document-section h3\s*{[\s\S]*?font-weight:\s*700/);
    expect(css).toMatch(
      /\.document-section-heading\s*{[\s\S]*?align-items:\s*baseline/,
    );
    expect(css).toMatch(
      /\.consent-document-section \.safe-rich-text h2\s*{[\s\S]*?font-size:\s*20px[\s\S]*?line-height:\s*1\.2/,
    );
    expect(css).toMatch(
      /\.consent-document-section \.safe-rich-text h3\s*{[\s\S]*?font-size:\s*16px[\s\S]*?line-height:\s*1\.3/,
    );
    expect(css).toMatch(
      /\.consent-document-divider\s*{[\s\S]*?width:\s*100%[\s\S]*?border-top:\s*1px solid var\(--line-strong\)/,
    );
  });

  it('renders italic rich text inside consent documents', async () => {
    const css = readFileSync(
      path.resolve(process.cwd(), 'app/globals.css'),
      'utf8',
    );

    renderCarePage({
      initialView: 'consents',
      extraResponses: new Map([
        [
          '/care/consents',
          [
            {
              id: 'consent-1',
              title: 'Treatment consent',
              status: 'REQUESTED',
              requestedAt: '2026-08-08T09:24:00',
            },
          ],
        ],
        [
          '/care/consents/consent-1',
          {
            open: true,
            title: 'Treatment consent',
            documentSchema: {
              sections: [
                {
                  id: 'section-1',
                  title: 'Consent section',
                  blocks: [
                    {
                      id: 'rich-1',
                      type: 'RICH_TEXT',
                      label: 'Rich text',
                      content:
                        '<p>Please read the <em>important</em> consent terms.</p>',
                    },
                  ],
                },
              ],
            },
            requiredAcknowledgements: [],
          },
        ],
      ]),
    });

    fireEvent.click(await screen.findByRole('button', { name: /Treatment consent/i }));

    const italicText = await screen.findByText('important');
    expect(italicText.tagName).toBe('EM');
    expect(
      italicText.closest('.consent-document-section .safe-rich-text'),
    ).toBeTruthy();
    expect(css).toMatch(
      /\.safe-rich-text em,\s*\.safe-rich-text em \*,[\s\S]*?\.safe-rich-text \[style\*="font-style" i\]\[style\*="italic" i\],[\s\S]*?font-synthesis:\s*style[\s\S]*?font-style:\s*italic !important/,
    );
    expect(css).toMatch(/\.safe-rich-text p\s*{[\s\S]*?margin:\s*0 0 0px/);
  });

  it('renders quote rich text inside consent documents with a left border', async () => {
    const css = readFileSync(
      path.resolve(process.cwd(), 'app/globals.css'),
      'utf8',
    );

    renderCarePage({
      initialView: 'consents',
      extraResponses: new Map([
        [
          '/care/consents',
          [
            {
              id: 'consent-1',
              title: 'Treatment consent',
              status: 'REQUESTED',
              requestedAt: '2026-08-08T09:24:00',
            },
          ],
        ],
        [
          '/care/consents/consent-1',
          {
            open: true,
            title: 'Treatment consent',
            documentSchema: {
              sections: [
                {
                  id: 'section-1',
                  title: 'Consent section',
                  blocks: [
                    {
                      id: 'rich-quote',
                      type: 'RICH_TEXT',
                      label: 'Rich text',
                      content:
                        '<p>Before quote</p><blockquote><p>Quoted consent text</p></blockquote>',
                    },
                  ],
                },
              ],
            },
            requiredAcknowledgements: [],
          },
        ],
      ]),
    });

    fireEvent.click(await screen.findByRole('button', { name: /Treatment consent/i }));

    const quote = await screen.findByText('Quoted consent text');
    expect(quote.closest('blockquote')).toBeTruthy();
    expect(quote.closest('.consent-document-section .safe-rich-text'))
      .toBeTruthy();
    const blockquoteRule =
      css.match(/\.safe-rich-text blockquote\s*{[^}]*}/)?.[0] ?? '';
    expect(css).toMatch(
      /\.safe-rich-text blockquote\s*{[\s\S]*?margin:\s*10px 0 12px 12px[\s\S]*?border-left:\s*3px solid var\(--line-strong\)[\s\S]*?padding:\s*8px 12px 8px 14px/,
    );
    expect(blockquoteRule).not.toContain('background:');
  });

  it('renders signed consent signatures with the same electronic signature line', async () => {
    renderCarePage({
      initialView: 'consents',
      initialResourceId: 'consent-signed',
      extraResponses: new Map([
        [
          '/care/consents',
          [
            {
              id: 'consent-signed',
              title: 'Treatment consent',
              status: 'SIGNED',
              requestedAt: '2026-08-08T09:00:00',
            },
          ],
        ],
        [
          '/care/consents/consent-signed',
          {
            open: false,
            title: 'Treatment consent',
            documentSchema: consentDocumentSchema(),
            signature: {
              signedAt: '2026-08-08T09:24:00',
              signature: {
                method: 'TYPED',
                typedName: 'Karim Gouba',
              },
            },
          },
        ],
      ]),
    });

    expect(await screen.findByRole('heading', { name: 'Treatment consent' }))
      .toBeTruthy();
    const signedNotice = screen.getByText('Signed');
    const consentTitle = screen.getByRole('heading', {
      level: 2,
      name: 'Treatment consent',
    });
    expect(
      signedNotice.compareDocumentPosition(consentTitle) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText('Completed')).toBeNull();
    expect(screen.getByText('Karim Gouba')).toBeTruthy();
    expect(
      screen.getByText(/Electronically signed on Aug 08 at 09:24/),
    ).toBeTruthy();
    expect(screen.queryByText(/Electronically signed -/)).toBeNull();
  });

  it('does not send trusted submitter metadata from patient-facing consent signatures', () => {
    const source = readFileSync(
      path.resolve(process.cwd(), 'app/care/care-page-client.tsx'),
      'utf8',
    );

    expect(source).not.toMatch(/submitterType:\s*["']PATIENT["']/);
    expect(source).not.toMatch(/submitterRelationshipToPatient/);
  });

  it('marks the active route with active state and aria-current', async () => {
    renderCarePage({ initialView: 'documents' });

    const documents = await screen.findByRole('link', { name: 'Documents' });
    expect(documents.getAttribute('aria-current')).toBe('page');
    expect(documents.className).toContain('active');
  });

  it('calculates overflow fades with scroll thresholds', () => {
    expect(
      careNavScrollAvailability({
        scrollLeft: 0,
        clientWidth: 320,
        scrollWidth: 700,
      }),
    ).toEqual({
      canScrollLeft: false,
      canScrollRight: true,
    });
    expect(
      careNavScrollAvailability({
        scrollLeft: 90,
        clientWidth: 320,
        scrollWidth: 700,
      }),
    ).toEqual({
      canScrollLeft: true,
      canScrollRight: true,
    });
    expect(
      careNavScrollAvailability({
        scrollLeft: 380,
        clientWidth: 320,
        scrollWidth: 700,
      }),
    ).toEqual({
      canScrollLeft: true,
      canScrollRight: false,
    });
    expect(
      careNavScrollAvailability({
        scrollLeft: 0,
        clientWidth: 700,
        scrollWidth: 700,
      }),
    ).toEqual({
      canScrollLeft: false,
      canScrollRight: false,
    });
  });

  it('calculates active-tab centering without vertical page scrolling', () => {
    expect(
      careNavRevealScrollLeft(
        { left: 0, right: 320 },
        { left: 370, right: 470 },
        0,
        420,
      ),
    ).toBe(260);
    expect(
      careNavRevealScrollLeft(
        { left: 0, right: 320 },
        { left: -30, right: 70 },
        160,
        420,
      ),
    ).toBe(20);
    expect(
      careNavRevealScrollLeft(
        { left: 0, right: 320 },
        { left: 30, right: 180 },
        100,
        420,
      ),
    ).toBe(45);
    expect(
      careNavRevealScrollLeft(
        { left: 0, right: 320 },
        { left: 30, right: 180 },
        0,
        0,
      ),
    ).toBe(0);
  });

  it('uses reduced-motion safe scroll behavior', () => {
    expect(careNavScrollBehavior(true)).toBe('auto');
    expect(careNavScrollBehavior(false)).toBe('smooth');
  });

  it('renders fades from measured horizontal overflow and recalculates after scroll and resize', async () => {
    const layout = mockCareNavLayout();
    try {
      renderCarePage();
      const nav = await screen.findByRole('navigation', {
        name: 'Care page sections',
      });

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
        expect(layout.scrollToSpy).toHaveBeenCalledWith(
          expect.objectContaining({ behavior: 'smooth' }),
        );
      });
      expect(
        (
          layout.scrollToSpy.mock.calls.at(-1)?.[0] as
            ScrollToOptions | undefined
        )?.left,
      ).toBe(380);
      expect(
        await screen.findByRole('link', { name: 'Documents' }),
      ).toBeTruthy();

      layout.scrollToSpy.mockClear();
      layout.setScrollLeft(0);
      fireEvent.click(screen.getByRole('link', { name: 'Overview' }));
      fireEvent.click(screen.getByRole('link', { name: 'Documents' }));

      await waitFor(() => {
        expect(router.replace).toHaveBeenCalledWith('/care?view=documents');
        expect(layout.scrollToSpy).toHaveBeenCalledWith(
          expect.objectContaining({ behavior: 'smooth' }),
        );
      });
      expect(
        (
          layout.scrollToSpy.mock.calls.at(-1)?.[0] as
            ScrollToOptions | undefined
        )?.left,
      ).toBe(380);
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

  it('groups Care forms with patient-facing labels and hides empty groups and raw statuses', async () => {
    renderCarePage({
      initialView: 'forms',
      extraResponses: new Map<string, unknown>([
        [
          '/care/forms',
          [
            {
              id: 'new-form',
              templateTitle: 'Patient intake',
              status: 'SENT',
              dueAt: '2026-07-30',
            },
            {
              id: 'draft-form',
              title: 'Medical history',
              status: 'IN_PROGRESS',
            },
            {
              id: 'done-form',
              title: 'Consent history',
              status: 'SUBMITTED',
              submittedAt: '2026-07-24T10:00:00',
            },
            { id: 'expired-form', title: 'Old intake', status: 'EXPIRED' },
            { id: 'hidden-form', title: 'Internal form', status: 'FAILED' },
          ],
        ],
      ]),
    });

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Forms' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'To complete' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'In progress' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Completed' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Patient intake/i }).textContent,
    ).toContain('Complete form');
    expect(
      screen.getByRole('button', { name: /Medical history/i }).textContent,
    ).toContain('Continue form');
    expect(
      screen.getByRole('button', { name: /Consent history/i }).textContent,
    ).toContain('Completed Jul 24');
    expect(
      screen.getByRole('button', { name: /Old intake/i }).textContent,
    ).toContain('Expired');
    expect(screen.queryByText('Completed or unavailable')).toBeNull();
    expect(screen.queryByText('No items.')).toBeNull();
    expect(screen.queryByText('SENT')).toBeNull();
    expect(screen.queryByText('Item')).toBeNull();
    expect(screen.queryByText('Internal form')).toBeNull();
  });

  it('shows a neutral no-forms state', async () => {
    renderCarePage({ initialView: 'forms' });

    expect(
      await screen.findByText('You do not have any forms right now.'),
    ).toBeTruthy();
    expect(screen.queryByText('No items.')).toBeNull();
  });

  it('uses specific loading labels for form list and focused form routes', async () => {
    const pending = new Promise<never>(() => undefined);
    const { unmount } = renderCarePage({
      initialView: 'forms',
      extraResponses: new Map<string, unknown>([['/care/forms', pending]]),
    });

    expect(await screen.findByText('Loading form list...')).toBeTruthy();
    expect(screen.queryByText('Loading...')).toBeNull();

    unmount();
    renderCarePage({
      initialView: 'forms',
      initialResourceId: 'form-1',
      extraResponses: new Map<string, unknown>([['/care/forms', pending]]),
    });

    expect(await screen.findByText('Loading form...')).toBeTruthy();
  });

  it('opens an actionable form in a focused URL-driven view and returns to the list', async () => {
    renderCarePage({
      initialView: 'forms',
      extraResponses: new Map<string, unknown>([
        [
          '/care/forms',
          [{ id: 'form-1', title: 'Patient intake', status: 'SENT' }],
        ],
        [
          '/care/forms/form-1',
          publicForm({
            schema: {
              sections: [
                {
                  ...publicForm().schema.sections[0],
                  description: 'Before the appointment',
                },
                publicForm().schema.sections[1],
              ],
            },
          }),
        ],
      ]),
    });

    fireEvent.click(
      await screen.findByRole('button', { name: /Patient intake/i }),
    );

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith(
        '/care?view=forms&resourceId=form-1',
      );
    });
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Patient intake' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to forms' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'To complete' })).toBeNull();
    expect(screen.queryByText('Form details')).toBeNull();
    expect(screen.getByText('1 of 2 sections')).toBeTruthy();
    const sectionHeading = screen.getByRole('heading', {
      level: 3,
      name: 'Section 1',
    });
    expect(sectionHeading).toBeTruthy();
    const sectionDescription = screen.getByText('Before the appointment');
    expect(sectionDescription.className).toContain(
      'document-section-description',
    );
    expect(sectionDescription.closest('.document-section-heading')).toBe(
      sectionHeading.closest('.document-section-heading'),
    );
    expect(screen.queryByText('Section 1 of 2')).toBeNull();
    expect(screen.getByLabelText(/Patient informations/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back to forms' }));

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/care?view=forms');
    });
    expect(
      await screen.findByRole('heading', { name: 'To complete' }),
    ).toBeTruthy();
  });

  it('renders form-template layout nodes and validates fields inside columns', async () => {
    const { container } = renderCarePage({
      initialView: 'forms',
      initialResourceId: 'form-1',
      extraResponses: new Map<string, unknown>([
        [
          '/care/forms',
          [{ id: 'form-1', title: 'Patient intake', status: 'SENT' }],
        ],
        [
          '/care/forms/form-1',
          publicForm({
            schema: {
              schemaVersion: 2,
              sections: [
                {
                  id: 'section-1',
                  title: 'Section 1',
                  fields: [
                    {
                      id: 'columns-1',
                      type: 'COLUMNS',
                      ratios: [1, 2],
                      children: [
                        {
                          id: 'first-name',
                          type: 'SHORT_TEXT',
                          label: 'First name',
                          required: true,
                        },
                        {
                          id: 'visit-reason',
                          type: 'DROPDOWN',
                          label: 'Visit reason',
                          required: true,
                          options: [
                            { id: 'checkup', label: 'Checkup' },
                            { id: 'follow-up', label: 'Follow up' },
                          ],
                        },
                      ],
                    },
                    {
                      id: 'gender',
                      type: 'SINGLE_CHOICE',
                      label: 'Gender',
                      options: [
                        { id: 'male', label: 'Male' },
                        { id: 'female', label: 'Female' },
                        { id: 'other', label: 'Other', isOther: true },
                      ],
                    },
                    { id: 'details', type: 'LONG_TEXT', label: 'Details' },
                  ],
                },
              ],
            },
          }),
        ],
      ]),
    });

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Section 1' }),
    ).toBeTruthy();
    const columns = container.querySelector<HTMLElement>('.care-form-columns');
    expect(columns).toBeTruthy();
    expect(
      columns?.style.getPropertyValue('--care-form-columns-template'),
    ).toContain('1fr');
    expect(
      columns?.style.getPropertyValue('--care-form-columns-template'),
    ).toContain('2fr');
    expect(screen.getByLabelText(/First name/)).toBeTruthy();
    expect(screen.getByLabelText(/Visit reason/)).toBeTruthy();
    fireEvent.click(screen.getByText('Female'));
    expect((screen.getByLabelText('Female') as HTMLInputElement).checked).toBe(
      true,
    );
    const otherTextInput = container.querySelector<HTMLInputElement>(
      '.other-choice-input',
    );
    expect(otherTextInput).toBeTruthy();
    expect(otherTextInput?.tabIndex).toBe(-1);
    fireEvent.pointerDown(otherTextInput!);
    otherTextInput!.focus();
    expect((screen.getByLabelText('Other') as HTMLInputElement).checked).toBe(
      true,
    );
    expect(document.activeElement).toBe(otherTextInput);
    fireEvent.change(otherTextInput!, { target: { value: 'Nonbinary' } });
    expect(otherTextInput!.value).toBe('Nonbinary');
    expect(screen.getByLabelText(/Details/).tagName).toBe('TEXTAREA');

    fireEvent.click(screen.getByRole('button', { name: 'Submit form' }));

    expect(await screen.findAllByText('Required field.')).toHaveLength(2);
    expect(document.activeElement).toBe(screen.getByLabelText(/First name/));

    fireEvent.change(screen.getByLabelText(/First name/), {
      target: { value: 'Karim' },
    });
    fireEvent.change(screen.getByLabelText(/Visit reason/), {
      target: { value: 'checkup' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit form' }));

    expect(
      await screen.findByRole('dialog', { name: 'Submit this form?' }),
    ).toBeTruthy();
  });

  it('supports free-text Other answers for multiple choice form fields', async () => {
    const { container } = renderCarePage({
      initialView: 'forms',
      initialResourceId: 'form-1',
      extraResponses: new Map<string, unknown>([
        [
          '/care/forms',
          [{ id: 'form-1', title: 'Patient intake', status: 'SENT' }],
        ],
        [
          '/care/forms/form-1',
          publicForm({
            schema: {
              sections: [
                {
                  id: 'section-1',
                  label: 'Section 1',
                  fields: [
                    {
                      id: 'symptoms',
                      type: 'MULTIPLE_CHOICE',
                      label: 'Symptoms',
                      options: [
                        { id: 'pain', label: 'Pain' },
                        { id: 'other', label: 'Other', isOther: true },
                      ],
                    },
                  ],
                },
              ],
            },
          }),
        ],
      ]),
    });

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Patient intake' }),
    ).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Symptoms' }).className).toContain(
      'care-choice-field',
    );
    const painCheckbox = screen.getByLabelText('Pain') as HTMLInputElement;
    const otherCheckbox = screen.getByLabelText('Other') as HTMLInputElement;
    expect(painCheckbox.tabIndex).toBe(0);
    expect(otherCheckbox.tabIndex).toBe(-1);
    painCheckbox.focus();
    fireEvent.keyDown(painCheckbox, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(otherCheckbox);
    fireEvent.keyDown(otherCheckbox, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(painCheckbox);
    fireEvent.click(screen.getByLabelText('Pain'));
    const otherTextInput = container.querySelector<HTMLInputElement>(
      '.other-choice-input',
    );
    expect(otherTextInput).toBeTruthy();
    expect(otherTextInput?.tabIndex).toBe(-1);
    fireEvent.pointerDown(otherTextInput!);
    otherTextInput!.focus();
    await waitFor(() => {
      expect(otherTextInput?.tabIndex).toBe(0);
    });
    fireEvent.change(otherTextInput!, { target: { value: 'Head pressure' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));

    await waitFor(() => {
      expect(mockCorePublic).toHaveBeenCalledWith(
        '/care/forms/form-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            answers: {
              symptoms: ['pain', { optionId: 'other', text: 'Head pressure' }],
            },
          }),
        }),
      );
    });
  });

  it('treats No as a completed required Yes/No form answer', async () => {
    renderCarePage({
      initialView: 'forms',
      initialResourceId: 'form-1',
      extraResponses: new Map<string, unknown>([
        [
          '/care/forms',
          [{ id: 'form-1', title: 'Patient intake', status: 'SENT' }],
        ],
        [
          '/care/forms/form-1',
          publicForm({
            schema: {
              sections: [
                {
                  id: 'section-1',
                  label: 'Section 1',
                  fields: [
                    {
                      id: 'has-allergies',
                      type: 'BOOLEAN',
                      label: 'Do you have allergies?',
                      required: true,
                    },
                  ],
                },
              ],
            },
          }),
        ],
      ]),
    });

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Patient intake' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByLabelText('No'));
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));

    await waitFor(() => {
      expect(mockCorePublic).toHaveBeenCalledWith(
        '/care/forms/form-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            answers: {
              'has-allergies': false,
            },
          }),
        }),
      );
    });
    expect(screen.queryByText('Required field.')).toBeNull();
  });

  it('restores an active form route on refresh and safely removes invalid selections', async () => {
    renderCarePage({
      initialView: 'forms',
      initialResourceId: 'form-1',
      extraResponses: new Map<string, unknown>([
        [
          '/care/forms',
          [{ id: 'form-1', title: 'Patient intake', status: 'SENT' }],
        ],
        [
          '/care/forms/form-1',
          publicForm({
            schema: { sections: [publicForm().schema.sections[0]] },
          }),
        ],
      ]),
    });

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Patient intake' }),
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'To complete' })).toBeNull();

    renderCarePage({
      initialView: 'forms',
      initialResourceId: 'missing',
      extraResponses: new Map<string, unknown>([
        [
          '/care/forms',
          [{ id: 'form-1', title: 'Patient intake', status: 'SENT' }],
        ],
      ]),
    });

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/care?view=forms');
    });
    expect(
      await screen.findByText('This form is no longer available.'),
    ).toBeTruthy();
  });

  it('keeps form actions together and saves progress through the draft API', async () => {
    let resolveSave: (() => void) | undefined;
    const pendingSave = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    renderCarePage({
      initialView: 'forms',
      initialResourceId: 'form-1',
      extraResponses: new Map<string, unknown>([
        [
          '/care/forms',
          [{ id: 'form-1', title: 'Patient intake', status: 'SENT' }],
        ],
        [
          '/care/forms/form-1',
          publicForm({
            schema: { sections: [publicForm().schema.sections[0]] },
          }),
        ],
      ]),
    });

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Patient intake' }),
    ).toBeTruthy();
    const save = screen.getByRole('button', { name: 'Save progress' });
    const submit = screen.getByRole('button', { name: 'Submit form' });
    expect(save.closest('.care-form-action-footer')).toBe(
      submit.closest('.care-form-action-footer'),
    );
    expect(screen.queryByRole('button', { name: /^Back$/ })).toBeNull();

    mockCorePublic.mockImplementation((path: string, options?: RequestInit) => {
      if (path === '/care/forms/form-1' && options?.method === 'PATCH')
        return pendingSave;
      if (path === '/care/bootstrap') return Promise.resolve(bootstrap());
      if (path === '/care/forms')
        return Promise.resolve([
          { id: 'form-1', title: 'Patient intake', status: 'DRAFT' },
        ]);
      return Promise.resolve({});
    });

    fireEvent.change(screen.getByLabelText(/Patient informations/), {
      target: { value: 'Karim' },
    });
    fireEvent.click(save);
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeTruthy();
    expect(screen.getByLabelText(/Patient informations/)).toBeTruthy();
    expect(screen.queryByText('Loading form...')).toBeNull();

    await waitFor(() => {
      expect(mockCorePublic).toHaveBeenCalledWith(
        '/care/forms/form-1',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
    resolveSave?.();
    expect(await screen.findByText('Progress saved')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss form message' }),
    );
    expect(screen.queryByText('Progress saved')).toBeNull();
    expect(screen.getByLabelText(/Patient informations/)).toBeTruthy();
  });

  it('validates before opening the submit dialog and submits after confirmation', async () => {
    renderCarePage({
      initialView: 'forms',
      initialResourceId: 'form-1',
      extraResponses: new Map<string, unknown>([
        [
          '/care/forms',
          [{ id: 'form-1', title: 'Patient intake', status: 'SENT' }],
        ],
        [
          '/care/forms/form-1',
          publicForm({
            schema: { sections: [publicForm().schema.sections[0]] },
          }),
        ],
      ]),
    });

    const field = await screen.findByLabelText(/Patient informations/);
    fireEvent.click(screen.getByRole('button', { name: 'Submit form' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText('Required field.')).toBeTruthy();
    expect(document.activeElement).toBe(field);

    fireEvent.change(field, { target: { value: 'Karim' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit form' }));

    expect(
      await screen.findByRole('dialog', { name: 'Submit this form?' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Review form' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Submit form' }));
    expect(
      await screen.findByRole('dialog', { name: 'Submit this form?' }),
    ).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Submit form',
      }),
    );

    await waitFor(() => {
      expect(mockCorePublic).toHaveBeenCalledWith(
        '/care/forms/form-1/submit',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(router.replace).toHaveBeenCalledWith('/care?view=forms');
    });
    expect(
      await screen.findByText('Your form has been submitted'),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss form message' }),
    );
    expect(screen.queryByText('Your form has been submitted')).toBeNull();
  });

  it('does not render editable actions for completed forms', async () => {
    renderCarePage({
      initialView: 'forms',
      initialResourceId: 'done-form',
      extraResponses: new Map<string, unknown>([
        [
          '/care/forms',
          [
            {
              id: 'done-form',
              title: 'Consent history',
              status: 'SUBMITTED',
              submittedAt: '2026-07-24T10:00:00',
            },
          ],
        ],
        [
          '/care/forms/done-form',
          publicForm({
            open: false,
            status: 'SUBMITTED',
            title: 'Consent history',
            schema: {
              sections: [
                {
                  ...publicForm().schema.sections[0],
                  fields: [
                    {
                      id: 'info',
                      type: 'INFORMATION',
                      label:
                        'I confirm that the information provided is accurate to the best of my knowledge.',
                      content: 'Information text',
                    },
                    ...publicForm().schema.sections[0].fields,
                  ],
                },
                publicForm().schema.sections[1],
              ],
            },
            draft: { 'patient-info': 'Draft value' },
            submission: {
              answers: {
                'patient-info': 'Submitted value',
                notes: 'Submitted note',
              },
            },
          }),
        ],
      ]),
    });

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Consent history' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Section 1' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Medical details' }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'I confirm that the information provided is accurate to the best of my knowledge.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Information text')).toBeNull();
    expect(
      (screen.getByLabelText(/Patient informations/) as HTMLInputElement).value,
    ).toBe('Submitted value');
    expect((screen.getByLabelText(/Notes/) as HTMLTextAreaElement).value).toBe(
      'Submitted note',
    );
    expect(screen.queryByText('1 of 2 sections')).toBeNull();
    const completedNotice = screen.getByText('Completed');
    const formTitle = screen.getByRole('heading', {
      level: 2,
      name: 'Consent history',
    });
    expect(
      completedNotice.compareDocumentPosition(formTitle) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save progress' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit form' })).toBeNull();
  });
});
