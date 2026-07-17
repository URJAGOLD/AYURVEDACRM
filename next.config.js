/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  basePath: "/crm",
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: { serverComponentsExternalPackages: ["exceljs", "bcryptjs"] },
};
module.exports = nextConfig;