import {
  BASE_PATH as CORE_PUBLIC_BASE_PATH,
  Configuration as CorePublicConfiguration,
  BookingApi,
  type ConfigurationParameters as CorePublicConfigurationParameters,
} from '@allomed-api/core-service-public-api';

export const allomedApiBasePaths = {
  corePublic:
    process.env.ALLOMED_CORE_SERVICE_PUBLIC_URL ??
    process.env.ALLOMED_CORE_SERVICE_URL ??
    (process.env.NODE_ENV === 'development'
      ? 'http://127.0.0.1:8091'
      : CORE_PUBLIC_BASE_PATH),
};

export function createBookingApi(headers?: Record<string, string>) {
  const params: CorePublicConfigurationParameters = {
    basePath: allomedApiBasePaths.corePublic,
    headers,
  };

  return new BookingApi(new CorePublicConfiguration(params));
}
