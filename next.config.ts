import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 1. Don't bundle these into the serverless function — let Vercel resolve
  //    them from node_modules at runtime so chromium's dynamic `executablePath`
  //    can find its bin folder.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core', 'puppeteer'],

  // 2. The chromium binary lives as a brotli archive in
  //    `@sparticuz/chromium/bin/*.br`. Vercel's file tracer only includes
  //    files it sees `require`d statically — it misses these. Force-include
  //    the binary directory for routes that render PDFs.
  outputFileTracingIncludes: {
    '/api/share/**': ['./node_modules/@sparticuz/chromium/bin/**'],
    '/api/proposals/**': ['./node_modules/@sparticuz/chromium/bin/**'],
    '/api/files/**': ['./node_modules/@sparticuz/chromium/bin/**'],
  },
};

export default nextConfig;
