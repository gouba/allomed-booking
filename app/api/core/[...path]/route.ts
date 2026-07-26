import { NextRequest, NextResponse } from 'next/server';
import { ResponseError } from '@allomed-api/core-service-public-api';
import {
  allomedApiBasePaths,
  createBookingApi,
} from '@/lib/server/allomed-api';

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function forwardedHeaders(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cookie = request.headers.get('cookie');

  return {
    ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}),
    ...(realIp ? { 'X-Real-IP': realIp } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
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

async function proxyCore(request: NextRequest, path: string) {
  const target = new URL(path, allomedApiBasePaths.corePublic);
  return proxy(request, target);
}

async function proxyChart(request: NextRequest, path: string) {
  const target = new URL(path, allomedApiBasePaths.chartPublic);
  return proxy(request, target);
}

async function proxy(request: NextRequest, target: URL) {
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value);
  });

  const method = request.method.toUpperCase();
  const response = await fetch(target, {
    method,
    headers: {
      ...forwardedHeaders(request),
      ...(method === 'GET' || method === 'HEAD' ? {} : { 'Content-Type': request.headers.get('content-type') ?? 'application/json' }),
    },
    body: method === 'GET' || method === 'HEAD' ? undefined : await request.text(),
    cache: 'no-store',
  });

  const headers = new Headers();
  headers.set('Cache-Control', 'no-store');
  const contentType = response.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);

  const setCookies = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.();
  if (setCookies?.length) {
    setCookies.forEach((cookie) => headers.append('Set-Cookie', cookie));
  } else {
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) headers.append('Set-Cookie', setCookie);
  }

  if (response.status === 204) {
    return new NextResponse(null, { status: response.status, headers });
  }

  return new NextResponse(await response.text(), {
    status: response.status,
    headers,
  });
}

function isChartCarePath(path: string[]) {
  return path[0] === 'care' && ['forms', 'consents', 'documents'].includes(path[1] ?? '');
}

export async function GET(request: NextRequest, context: RouteContext) {
  const api = createBookingApi(forwardedHeaders(request));
  const path = await segmentsOf(context);

  try {
    if (path[0] === 'care') {
      if (isChartCarePath(path)) {
        return proxyChart(request, `/${path.map(encodeURIComponent).join('/')}`);
      }
      return proxyCore(request, `/${path.map(encodeURIComponent).join('/')}`);
    }

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

    return notFound();
  } catch (error) {
    return jsonApiError(error, 'Core public request failed.');
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const path = await segmentsOf(context);

  try {
    if (path[0] === 'care') {
      if (isChartCarePath(path)) {
        return proxyChart(request, `/${path.map(encodeURIComponent).join('/')}`);
      }
      return proxyCore(request, `/${path.map(encodeURIComponent).join('/')}`);
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
    if (path[0] === 'care') {
      if (isChartCarePath(path)) {
        return proxyChart(request, `/${path.map(encodeURIComponent).join('/')}`);
      }
      return proxyCore(request, `/${path.map(encodeURIComponent).join('/')}`);
    }

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
        return proxyCore(request, `/clinics/${encodeURIComponent(clinicSlug)}/checkin/lookup`);
      }

      if (resource === 'checkin' && !path[3]) {
        return proxyCore(request, `/clinics/${encodeURIComponent(clinicSlug)}/checkin`);
      }
    }

    if (path[0] === 'checkin' && path[1] && !path[2]) {
      return proxyCore(request, `/checkin/${encodeURIComponent(path[1])}`);
    }

    return notFound();
  } catch (error) {
    return jsonApiError(error, 'Core public request failed.');
  }
}
