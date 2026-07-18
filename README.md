# Allomed Booking

Lightweight public patient-facing booking and Care Page app for Allomed.

This app is intentionally separate from the authenticated admin webapp. It is designed for `book.allomed.com` and runs locally on port `3002`.

## Responsibilities

- Public clinic booking page at `/{clinicSlug}`.
- Passwordless patient Care Page at `/care/{token}`.
- Session-backed Care Page application at `/care`.
- First-delivery self check-in at `/checkin`.
- Centralized patient access to appointments, forms, consents, documents, and future payments.
- No login and no admin sidebar/layout.
- Public clinic branding from Core: primary color and clinic logo URL.

## Routes

```text
/                         Generic landing page
/{clinicSlug}             Public booking flow
/care/{token}             Exchange a secure token for a Care Page session
/care                     Session-backed patient Care Page
/checkin                  Self check-in lookup and check-in
```

Care Page links support navigation query parameters only:

```text
/care/{token}
/care/{token}?view=appointments&resourceId={appointmentId}
/care/{token}?view=forms&resourceId={formAssignmentId}
/care/{token}?view=consents&resourceId={consentAssignmentId}
/care/{token}?view=documents&resourceId={documentId}
/care/{token}?view=payments&resourceId={paymentRequestId}
```

After session creation, the browser is redirected to `/care` with the same safe navigation parameters and without the raw token in the URL.

## Booking Flow

The `/{clinicSlug}` route performs the patient booking flow:

1. Load public clinic profile and branding from Core.
2. Select an online-bookable service.
3. Select a practitioner or any available practitioner.
4. Browse generated availability.
5. Select a slot.
6. Enter patient details.
7. Answer the clinic's additional booking question when enabled.
8. Complete phone verification when required.
9. Capture marketing email opt-in when configured.
10. Confirm booking and show the Care Page appointment link.

## Core API Integration

The app uses Core public APIs through `lib/api.ts`.

The public booking page `/{clinicSlug}` server-renders the initial clinic profile,
branding, and online-bookable services through `lib/server/allomed-api.ts`. After
hydration, the browser continues to call the local `/api/core/*` proxy for
interactive steps such as practitioners, availability, phone verification, and
appointment creation.

Environment variables:

```env
NEXT_PUBLIC_CORE_PUBLIC_URL=http://localhost:8091
ALLOMED_CORE_SERVICE_PUBLIC_URL=http://localhost:8091
```

`NEXT_PUBLIC_CORE_PUBLIC_URL` is preferred for browser-side requests. `ALLOMED_CORE_SERVICE_PUBLIC_URL` is accepted as a server/deployment fallback.

Main Core endpoints consumed:

```text
GET  /clinics/{clinicSlug}
GET  /clinics/{clinicSlug}/services
GET  /clinics/{clinicSlug}/practitioners
GET  /clinics/{clinicSlug}/availability
POST /clinics/{clinicSlug}/phone-verifications
POST /clinics/{clinicSlug}/phone-verifications/confirm
POST /clinics/{clinicSlug}/appointments
POST /care/sessions
DELETE /care/sessions
GET  /care/bootstrap
GET  /care/overview
GET  /care/appointments
GET  /care/appointments/{appointmentId}
POST /care/appointments/{appointmentId}/cancel
POST /care/appointments/{appointmentId}/reschedule
GET  /care/forms
GET  /care/forms/{assignmentId}
PUT  /care/forms/{assignmentId}/draft
POST /care/forms/{assignmentId}/submit
GET  /care/consents
GET  /care/consents/{assignmentId}
POST /care/consents/{assignmentId}/sign
GET  /care/documents
GET  /care/documents/{documentId}/download
POST /clinics/{clinicSlug}/checkin/lookup
POST /clinics/{clinicSlug}/checkin
```

The public clinic response includes `primaryColor` and `logo`. The booking shell applies the clinic primary color to the patient UI and shows the clinic logo when configured. The Allomed logo is not shown on clinic booking pages; without a clinic logo, the clinic name remains visible as the page title.

## Local Development

Install dependencies:

```bash
npm install
```

Run locally on port `3002`:

```bash
npm run dev
```

Open:

```text
http://localhost:3002
```

## Scripts

```bash
npm run dev       # Start Next.js on port 3002
npm run build     # Build the production app
npm run start     # Start production server on port 3002
npm run lint      # Run ESLint
```

## Verification

```bash
npm run build
```

## Notes

- The app is a standalone git repository.
- `next.config.mjs` sets `turbopack.root` to this project directory so Next does not infer a parent workspace from unrelated lockfiles.
- The current UI is intentionally lightweight and mobile-first. It should stay independent from the heavy admin webapp.
- Payment collection remains hidden until the backend module is enabled.
