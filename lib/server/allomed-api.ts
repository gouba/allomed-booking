import {
  BASE_PATH as CORE_PUBLIC_BASE_PATH,
  Configuration as CorePublicConfiguration,
  BookingApi,
  CareApi,
  type ConfigurationParameters as CorePublicConfigurationParameters,
} from '@allomed-api/core-service-public-api';

export const allomedApiBasePaths = {
  corePublic:
    process.env.ALLOMED_CORE_SERVICE_PUBLIC_URL ??
    process.env.ALLOMED_CORE_SERVICE_URL ??
    (process.env.NODE_ENV === 'development'
      ? 'http://127.0.0.1:8091'
      : CORE_PUBLIC_BASE_PATH),
  chartPublic:
    process.env.ALLOMED_CHART_SERVICE_PUBLIC_URL ??
    process.env.ALLOMED_CHART_SERVICE_URL ??
    (process.env.NODE_ENV === 'development'
      ? 'http://127.0.0.1:8098'
      : 'http://allomed-chart-service-public.presentation-private'),
};

export function createBookingApi(headers?: Record<string, string>) {
  const params: CorePublicConfigurationParameters = {
    basePath: allomedApiBasePaths.corePublic,
    headers,
  };

  return new BookingApi(new CorePublicConfiguration(params));
}

export function createCareApi(headers?: Record<string, string>) {
  const params: CorePublicConfigurationParameters = {
    basePath: allomedApiBasePaths.corePublic,
    headers,
  };

  return new CareApi(new CorePublicConfiguration(params));
}
