/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lets a production build run beside `next dev` (which owns .next): NEXT_DIST_DIR=.next-build npm run build
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // `reference/` is read-only source material (CLAUDE.md) — never compiled or bundled.
  outputFileTracingExcludes: { '*': ['./reference/**', './fixtures/**'] },
};

export default nextConfig;
