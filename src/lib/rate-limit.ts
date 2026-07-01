// ============================================================================
// نظام بِنَاء ERP - أداة تحديد المعدل (Rate Limiter)
// Binaa ERP - In-Memory Rate Limiter
// ============================================================================
//
// يمنع هجمات brute force على تسجيل الدخول و_ENDPOINTs الحساسة.
// يستخدم ذاكرة محلية (Map) — مناسب لخادم واحد. للنشر متعدد الخوادم،
// استخدم Redis-based rate limiter بدلاً من هذا.
// ============================================================================

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// تنظيف دوري للمدخلات المنتهية (كل 5 دقائق)
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) {
      store.delete(key)
    }
  }
}, 5 * 60 * 1000).unref?.()

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

/**
 * تحديد المعدل لـ IP معين على endpoint معين.
 * @param key معرّف فريد (مثل IP + endpoint path)
 * @param maxRequests الحد الأقصى للطلبات
 * @param windowMs نافذة الوقت بالمللي ثانية
 * @returns { allowed, remaining, resetAt }
 */
export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    // نافذة جديدة
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs }
  }

  entry.count++
  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt }
}

/**
 * حد المعدل لتسجيل الدخول: 10 محاولات لكل IP كل 15 دقيقة.
 */
export function checkLoginRateLimit(ip: string): RateLimitResult {
  return rateLimit(`login:${ip}`, 10, 15 * 60 * 1000)
}

/**
 * حد المعدل العام للـ API: 100 طلب لكل IP كل دقيقة.
 */
export function checkApiRateLimit(ip: string): RateLimitResult {
  return rateLimit(`api:${ip}`, 100, 60 * 1000)
}
