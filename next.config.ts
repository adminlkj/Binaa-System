import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  allowedDevOrigins: ['localhost', '127.0.0.1', '21.0.15.103', '.space-z.ai', 'c-6a30e9a7-14a687f1-2227b9417671'],

  // P2.3: Security Headers — CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
  // These protect against XSS, clickjacking, MIME sniffing, and protocol downgrade attacks.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Content-Security-Policy: يمنع تحميل السكربتات من مصادر غير موثوقة
          // يسمح بـ: self (نفس المصدر)، unsafe-inline (للـ shadcn/ui styles)، unsafe-eval (للتطوير)
          // في الإنتاج: أضف nonce-based CSP بدلاً من unsafe-inline
          {
            key: 'Content-Security-Policy',
            value: process.env.NODE_ENV === 'production'
              ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self'; frame-ancestors 'none';"
              : "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; frame-ancestors 'none';"
          },
          // HSTS: إجبار HTTPS لمدة سنة مع تضمين المجالات الفرعية
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload'
          },
          // X-Frame-Options: منع التضمين في iframe (clickjacking)
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          // X-Content-Type-Options: منع MIME sniffing
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          // Referrer-Policy: التحكم في معلومات الـ Referrer
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          // X-DNS-Prefetch-Control: منع prefetching DNS (تسريب المعلومات)
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'off'
          },
          // Permissions-Policy: تعطيل الميزات غير الضرورية
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
          },
        ],
      },
    ]
  },
};

export default nextConfig;
