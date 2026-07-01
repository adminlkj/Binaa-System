// ============================================================================
// نظام بِنَاء ERP - أداة تنظيف HTML (XSS Prevention)
// Binaa ERP - HTML Escaping Utility for XSS Prevention
// ============================================================================
//
// كل مدخلات المستخدم التي تُدمج في HTML MUST تمر عبر escapeHtml() أولاً.
// هذا يمنع هجمات XSS (Cross-Site Scripting) حيث يمكن لمستخدم ضار إدخال
// <script> أو <img onerror=...> في حقول مثل الملاحظات، الوصف، إلخ.
//
// القاعدة: لا يُسمح بأي ${data.field} في HTML بدون escapeHtml() إلا إذا كان
// الحقل موثوقاً 100% (مثل الأرقام المحسوبة برمجياً أو التواريخ المنسَّقة).
// ============================================================================

/**
 * تنظيف نص HTML من الأحرف الخطرة (XSS prevention).
 * يحوّل: & < > " ' إلى كيانات HTML آمنة.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

/**
 * تنظيف نص HTML مع الحفاظ على بعض الوسوم الآمنة (للوصف المنسَّق).
 * حالياً يزيل كل الوسوم — استخدم escapeHtml للنص العادي.
 */
export function stripHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/<[^>]*>/g, '')
}

/**
 * التحقق من أن نصاً لا يحتوي على وسوم HTML خطرة.
 */
export function containsHtml(value: unknown): boolean {
  if (value === null || value === undefined) return false
  return /<[a-zA-Z][^>]*>|on\w+\s*=|javascript:/i.test(String(value))
}
