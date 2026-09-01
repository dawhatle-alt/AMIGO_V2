/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `reference/` is read-only source material (CLAUDE.md) — never compiled or bundled.
  outputFileTracingExcludes: { '*': ['./reference/**', './fixtures/**'] },
};

export default nextConfig;
