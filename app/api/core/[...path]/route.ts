import { NextRequest, NextResponse } from 'next/server';
import { ResponseError } from '@allomed-api/core-service-public-api';
import { allomedApiBasePaths, createBookingApi } from '@/lib/server/allomed-api';

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function localDateTimeForApi(value?: string | null) {
  if (!value) return undefined;
  return {
    toISOString: () => value,
  } as Date;
}

function forwardedHeaders(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');

  return {
    ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}),
    ...(realIp ? { 'X-Real-IP': realIp } : {}),
  };
}

async function readJson(request: NextRequest) {
  return request.json().catch(() => ({}));
}

async function jsonApiError(error: unknown, fallbackMessage: string) {
  if (error instanceof ResponseError) {
    const payload = await error.response
      .clone()
      .json()
      .catch(() => null);
    const message =
      payload?.message ||
      payload?.error ||
      payload?.detail ||
      payload?.title ||
      fallbackMessage;

    return NextResponse.json({ message }, { status: error.response.status });
  }

  return NextResponse.json(
    {
      message: error instanceof Error ? error.message : fallbackMessage,
    },
    { status: 500 },
  );
}

function notFound() {
  return NextResponse.json({ message: 'Not found' }, { status: 404 });
}

async function segmentsOf(context: RouteContext) {
  return (await context.params).path ?? [];
}

async function rawCoreJson(request: NextRequest, path: string) {
  const target = new URL(path, allomedApiBasePaths.corePublic);
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value);
  });
  const response = await fetch(target, {
    headers: forwardedHeaders(request),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  return NextResponse.json(payload, { status: response.status });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const api = createBookingApi(forwardedHeaders(request));
  const path = await segmentsOf(context);

  try {
    if (path[0] === 'clinics' && path[1]) {
      const clinicSlug = path[1];
      const resource = path[2];

      if (!resource) {
        return rawCoreJson(request, `/clinics/${encodeURIComponent(clinicSlug)}`);
      }

      if (resource === 'services') {
        return rawCoreJson(request, `/clinics/${encodeURIComponent(clinicSlug)}/services`);
      }

      if (resource === 'practitioners') {
        const serviceId = request.nextUrl.searchParams.get('serviceId');
        if (!serviceId) {
          return NextResponse.json(
            { message: 'serviceId is required.' },
            { status: 400 },
          );
        }

        const params: Parameters<typeof api.bookingGetPractitioners>[0] & {
          locationId?: string;
        } = {
          clinicSlug,
          serviceId,
        };
        params.locationId =
          request.nextUrl.searchParams.get('locationId') ?? undefined;

        const data = await api.bookingGetPractitioners(params);
        return NextResponse.json(data);
      }

      if (resource === 'availability') {
        const serviceId = request.nextUrl.searchParams.get('serviceId');
        if (!serviceId) {
          return NextResponse.json(
            { message: 'serviceId is required.' },
            { status: 400 },
          );
        }

        return rawCoreJson(request, `/clinics/${encodeURIComponent(clinicSlug)}/availability`);
      }
    }

    if (path[0] === 'appointments' && path[1] && !path[2]) {
      const data = await api.bookingGetAppointment({ token: path[1] });
      return NextResponse.json(data);
    }

    return notFound();
  } catch (error) {
    return jsonApiError(error, 'Core public request failed.');
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const api = createBookingApi(forwardedHeaders(request));
  const path = await segmentsOf(context);

  try {
    if (path[0] === 'clinics' && path[1]) {
      const clinicSlug = path[1];
      const resource = path[2];

      if (resource === 'phone-verifications' && !path[3]) {
        const body = await readJson(request);
        const data = await api.bookingStartPhoneVerification({
          clinicSlug,
          phoneVerificationStartRequestDTO: body,
        });
        return NextResponse.json(data);
      }

      if (resource === 'phone-verifications' && path[3] === 'confirm') {
        const body = await readJson(request);
        const data = await api.bookingConfirmPhoneVerification({
          clinicSlug,
          phoneVerificationConfirmRequestDTO: body,
        });
        return NextResponse.json(data);
      }

      if (resource === 'appointments') {
        const body = await readJson(request);
        const response = await fetch(`${allomedApiBasePaths.corePublic}/clinics/${encodeURIComponent(clinicSlug)}/appointments`, {
          method: 'POST',
          headers: {
            ...forwardedHeaders(request),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        const payload = await response.json().catch(() => ({}));
        return NextResponse.json(payload, { status: response.status });
      }

      if (resource === 'checkin' && path[3] === 'lookup') {
        const body = await readJson(request);
        const data = await api.bookingLookupCheckIn({
          clinicSlug,
          checkInLookupRequestDTO: body,
        });
        return NextResponse.json(data);
      }

      if (resource === 'checkin' && !path[3]) {
        const body = await readJson(request);
        const data = await api.bookingCheckIn({
          clinicSlug,
          checkInRequestDTO: body,
        });
        return NextResponse.json(data);
      }
    }

    if (path[0] === 'appointments' && path[1]) {
      const token = path[1];

      if (path[2] === 'cancel') {
        const data = await api.bookingCancelAppointment({ token });
        return NextResponse.json(data);
      }

      if (path[2] === 'reschedule') {
        const body = await readJson(request);
        const data = await api.bookingRescheduleAppointment({
          token,
          rescheduleRequestDTO: {
            ...body,
            newStartAt: localDateTimeForApi(body.newStartAt),
          },
        });
        return NextResponse.json(data);
      }
    }

    if (path[0] === 'checkin' && path[1] && !path[2]) {
      const data = await api.bookingCheckInByToken({ token: path[1] });
      return NextResponse.json(data);
    }

    return notFound();
  } catch (error) {
    return jsonApiError(error, 'Core public request failed.');
  }
}
