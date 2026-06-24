import path from 'node:path';

const nextConfig = {
  turbopack: {
    root: path.resolve('.'),
    resolveAlias: {
      '@allomed-api/core-service-public-api':
        './vendor/allomed-api/core-service-public-api/src/index.ts',
    },
  },
};

export default nextConfig;
