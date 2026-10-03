import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

/** Build de un Preview en Vercel (hostname con -git-). Queda fijado en el bundle del despliegue. */
const portalPreviewSandboxBuild =
  (process.env.VERCEL_URL ?? "").includes("-git-") && (process.env.VERCEL_URL ?? "").includes(".vercel.app");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  env: {
    PORTAL_PREVIEW_SANDBOX_BUILD: portalPreviewSandboxBuild ? "true" : "false",
  },
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
  },
  serverExternalPackages: ["exceljs"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
