import type { NextConfig } from 'next';
const config: NextConfig = {
  turbopack: {root: process.cwd()},
  outputFileTracingRoot: process.cwd(),
  output: 'standalone',
  poweredByHeader: false,
  // Low-memory builds run tsc as a separate required step (see npm run build).
  typescript: {ignoreBuildErrors: process.env.LOW_MEMORY_BUILD === 'true'},
  experimental: { cpus: 1, webpackMemoryOptimizations: true, webpackBuildWorker: process.env.LOW_MEMORY_BUILD !== 'true' },
  webpack(config, {dev}) {
    if ((dev && process.env.LOW_MEMORY_DEV === 'true') || process.env.LOW_MEMORY_BUILD === 'true') {
      config.cache = false;
      config.parallelism = 1;
    }
    return config;
  },
  async headers() {
    return [{source:'/sw.js',headers:[{key:'Cache-Control',value:'no-cache, no-store, must-revalidate'},{key:'Service-Worker-Allowed',value:'/'}]}, {source: '/:path*', headers: [
      {key: 'X-Content-Type-Options', value: 'nosniff'},
      {key: 'X-Frame-Options', value: 'DENY'},
      {key: 'Referrer-Policy', value: 'no-referrer'},
      {key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)'},
      {key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '') + "; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"},
    ]}];
  },
};
export default config;
