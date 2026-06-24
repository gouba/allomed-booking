# Allomed Booking

Lightweight public patient-facing booking and appointment management app for Allomed.

This app is intentionally separate from the authenticated admin webapp. It is designed for `book.allomed.com` and runs locally on port `3002`.

## Responsibilities

- Public clinic booking page at `/{clinicSlug}`.
- Appointment management at `/a/{token}`.
- Appointment rescheduling at `/a/{token}/reschedule`.
- First-delivery self check-in at `/checkin`.
- Future placeholder routes for intake forms and payments.
- No login and no admin sidebar/layout.
- Public clinic branding from Core: primary color and clinic logo URL.

## Routes

```text
/                         Generic landing page
/{clinicSlug}             Public booking flow
/a/{token}                Manage/view/cancel appointment
/a/{token}/reschedule     Reschedule appointment
/checkin                  Self check-in lookup and check-in
/f/{token}                Future intake forms placeholder
/p/{token}                Future payment placeholder
```

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
10. Confirm booking and show the manage appointment link.

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
GET  /appointments/{token}
POST /appointments/{token}/cancel
POST /appointments/{token}/reschedule
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
- Real payment collection, full intake form rendering, and full patient portal expansion are intentionally deferred.
