import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    // Notes (audited 2026-10-22):
    // - connect-src includes Supabase HTTPS + WSS (Realtime) and Razorpay.
    // - script-src/frame-src allow ONLY the two payment checkouts we load
    //   (Razorpay checkout.js + its iframe, Stripe frames). Stripe checkout
    //   itself is a full-page redirect to checkout.stripe.com.
    // - 'unsafe-inline' stays ONLY in script-src/style-src: Next.js injects
    //   inline bootstrap scripts and React inline styles; removing it needs
    //   a nonce pipeline (proxy.ts) — tracked in TASKS H1. There is NO
    //   'unsafe-eval' anywhere.
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.groq.com https://api.razorpay.com https://checkout.razorpay.com",
      "frame-src https://checkout.razorpay.com https://api.razorpay.com https://js.stripe.com https://hooks.stripe.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
