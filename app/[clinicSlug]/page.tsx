import type { Metadata } from 'next';
import { allomedApiBasePaths } from '@/lib/server/allomed-api';
import type { ClinicPublicResponseDTO, LocationResponseDTO, ServiceResponseDTO } from '@allomed-api/core-service-public-api';
import BookingFlow, { type BookingClinic, type BookingLocation, type BookingService } from './booking-flow';

type ClinicBookingPageProps = {
  params: Promise<{ clinicSlug: string }>;
};

export async function generateMetadata({
  params,
}: ClinicBookingPageProps): Promise<Metadata> {
  const { clinicSlug } = await params;

  try {
    const clinic = await corePublicJson<ClinicPublicResponseDTO>(`/clinics/${encodeURIComponent(clinicSlug)}`);
    return {
      title: clinic.name ? `Allomed | ${clinic.name}` : 'Allomed booking',
      description:
        clinic.description || 'Book and manage your clinic appointment.',
    };
  } catch {
    return {
      title: 'Allomed booking',
      description: 'Book and manage your clinic appointment.',
    };
  }
}

export default async function ClinicBookingPage({ params }: ClinicBookingPageProps) {
  const { clinicSlug } = await params;
  const initialData = await loadInitialBookingData(clinicSlug);

  return (
    <BookingFlow
      clinicSlug={clinicSlug}
      initialClinic={initialData.clinic}
      initialServices={initialData.services}
    />
  );
}

async function loadInitialBookingData(clinicSlug: string): Promise<{
  clinic: BookingClinic | null;
  services: BookingService[];
}> {
  try {
    const [clinic, services] = await Promise.all([
      corePublicJson<ClinicPublicResponseDTO>(`/clinics/${encodeURIComponent(clinicSlug)}`),
      corePublicJson<ServiceResponseDTO[]>(`/clinics/${encodeURIComponent(clinicSlug)}/services`).catch(() => []),
    ]);

    return {
      clinic: normalizeClinic(clinic),
      services: services.map(normalizeService).filter((service) => service.id),
    };
  } catch {
    return { clinic: null, services: [] };
  }
}

async function corePublicJson<T>(path: string): Promise<T> {
  const response = await fetch(new URL(path, allomedApiBasePaths.corePublic), {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Core public request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

function normalizeClinic(clinic: ClinicPublicResponseDTO) {
  return {
    name: clinic.name || 'Clinic',
    onlineBookingEnabled: Boolean(clinic.onlineBookingEnabled),
    maxBookingDaysAhead: clinic.maxBookingDaysAhead,
    description: clinic.description,
    phone: clinic.phone,
    email: clinic.email,
    requirePhoneVerification: clinic.requirePhoneVerification,
    allowAnyPractitioner: clinic.allowAnyPractitioner,
    bookByServiceEnabled: clinic.bookByServiceEnabled,
    defaultOnlineBookingServiceId: clinic.defaultOnlineBookingServiceId,
    bookByPractitionerEnabled: clinic.bookByPractitionerEnabled,
    additionalBookingQuestionEnabled: clinic.additionalBookingQuestionEnabled,
    additionalBookingQuestionPrompt: clinic.additionalBookingQuestionPrompt,
    marketingEmailOptInPrompt: clinic.marketingEmailOptInPrompt,
    timezone: clinic.timezone,
    timeFormat: clinic.timeFormat,
    dateFormat: clinic.dateFormat,
    logo: clinic.logo,
    primaryColor: clinic.primaryColor,
    locations: (clinic.locations ?? []).map(normalizeLocation).filter((location) => location.id),
  };
}

function normalizeLocation(location: LocationResponseDTO): BookingLocation {
  const extendedLocation = location as LocationResponseDTO & {
    type?: BookingLocation['type'];
    onlineBookingEnabled?: boolean;
  };
  return {
    id: location.id || '',
    name: location.name,
    type: extendedLocation.type ?? 'PHYSICAL',
    publicDisplayName: location.publicDisplayName,
    notes: location.notes,
    phone: location.phone,
    email: location.email,
    isDefault: location.isDefault,
    onlineBookingEnabled: extendedLocation.onlineBookingEnabled !== false,
    timezone: location.timezone,
    address: location.address,
  };
}

function normalizeService(service: ServiceResponseDTO) {
  const extendedService = service as ServiceResponseDTO & {
    deliveryModes?: BookingService['deliveryModes'];
  };
  const deliveryModes: NonNullable<BookingService['deliveryModes']> =
    Array.isArray(extendedService.deliveryModes) && extendedService.deliveryModes.length > 0
      ? extendedService.deliveryModes
      : ['IN_PERSON'];

  return {
    id: service.id || '',
    name: service.name || 'Unnamed service',
    description: service.description,
    durationMinutes: service.durationMinutes || 0,
    deliveryModes,
  };
}
