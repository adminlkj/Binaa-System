// ============================================================================
// نظام بِنَاء ERP - ربط أدوار الحسابات بخصائص الاستخدام
// Binaa ERP - Account Role → Usage Properties Mapping
// ============================================================================
//
// This module is the SINGLE SOURCE OF TRUTH for which usage properties an
// account should have based on its functional `accountRole`.
//
// The flow is:
//   AccountRole (e.g. "CASH", "ADMIN_EXPENSE")  ──►  getUsagePropertiesForRole()
//                                                          │
//                                                          ▼
//                                              {
//                                                usableInExpenses: true,
//                                                allowsProject: true,
//                                                ...
//                                              }
//
// These properties are persisted on the Account row itself (Prisma schema
// already has 22 boolean columns + documentType). They drive:
//   - Which accounts appear in each screen (via /api/accounts/by-role
//     with property-based filtering).
//   - Which optional/required dimensions each account allows when used
//     in a journal entry (project, cost center, employee, equipment, …).
//
// By persisting the properties at account-creation time (rather than
// inferring them on the fly), we let accountants override individual
// flags for edge-case accounts (e.g. a "petty cash for project X" that
// should also appear in projects) without touching the role mapping.
//
// ============================================================================

/**
 * The 20 supported usage/selection/behavior properties on Account.
 * Returned shape of `getUsagePropertiesForRole`.
 *
 * NOTE: `showInCash` / `showInBank` are also supported by the AccountSelector
 * and the by-role API, but they are NOT set here — they default to false and
 * are toggled manually for "satellite" cash/bank accounts that should appear
 * in the cash/bank screens without being a primary CASH/BANK role.
 */
export interface AccountUsageProperties {
  // ── Usage (where the account appears as selectable) ──
  usableInExpenses?: boolean
  usableInProjects?: boolean
  usableInRental?: boolean
  usableInPayroll?: boolean
  usableInAdvances?: boolean
  usableInMaintenance?: boolean
  usableInFuel?: boolean
  usableInPurchases?: boolean
  usableInRevenue?: boolean
  // ── Selection (optional dimensions when used) ──
  allowsProject?: boolean
  allowsCostCenter?: boolean
  allowsEmployee?: boolean
  allowsEquipment?: boolean
  allowsSupplier?: boolean
  allowsClient?: boolean
  // ── Behavior (mandatory dimensions when used) ──
  requiresEmployee?: boolean
  requiresProject?: boolean
  requiresEquipment?: boolean
  requiresContract?: boolean
  allowsVat?: boolean
}

// ---------------------------------------------------------------------------
// Internal helper: build a partial-boolean record from a list of keys.
// ---------------------------------------------------------------------------

const TRUE = true as const

function pick(
  keys: Array<keyof AccountUsageProperties>
): AccountUsageProperties {
  const out: AccountUsageProperties = {}
  for (const k of keys) out[k] = TRUE
  return out
}

// ---------------------------------------------------------------------------
// The master role → properties table.
//
// Design principles:
//   1. NEVER mark a non-cash-equivalent as `usableInAdvances/usableInFuel/
//      usableInMaintenance/usableInPurchases` — these properties drive the
//      "pay from" account selector in each of those screens, and only liquid
//      asset accounts belong there.
//   2. Expense accounts that are tied to a project flow (PROJECT_COST,
//      LABOR_COST, SUBCONTRACTOR_COST) get `allowsProject` + `allowsCostCenter`.
//      Pure admin expenses get `allowsCostCenter` only.
//   3. Revenue accounts always get `usableInRevenue`. Project-tied revenue
//      also gets `allowsProject` + `allowsClient` (client is required to bill).
//   4. VAT accounts are tagged with `allowsVat` so the VAT-eligible
//      transaction screens can mark them as the VAT line account.
//   5. Employee-related payables (SALARIES_PAYABLE, EOS_PROVISION) get
//      `usableInPayroll` + `allowsEmployee`.
// ---------------------------------------------------------------------------

const ROLE_USAGE_MAP: Record<string, AccountUsageProperties> = {
  // ── Liquid assets (payment sources) ─────────────────────────────────
  CASH: pick([
    'usableInExpenses', 'usableInAdvances', 'usableInPayroll',
    'usableInFuel', 'usableInMaintenance', 'usableInPurchases',
  ]),
  BANK: pick([
    'usableInExpenses', 'usableInAdvances', 'usableInPayroll',
    'usableInFuel', 'usableInMaintenance', 'usableInPurchases',
  ]),
  PETTY_CASH: pick([
    'usableInExpenses', 'usableInAdvances',
    'usableInFuel', 'usableInMaintenance',
  ]),

  // ── Customer-side receivables ───────────────────────────────────────
  CUSTOMER_AR: pick(['allowsClient', 'usableInRevenue']),
  RETENTION_RECEIVABLE: pick(['allowsClient']),
  CUSTOMER_ADVANCE: pick(['allowsClient']),
  CONTRACT_ASSET: pick(['allowsProject', 'allowsClient']),
  CONTRACT_LIABILITY: pick(['allowsClient']),

  // ── Supplier/subcontractor-side payables ────────────────────────────
  SUPPLIER_AP: pick(['allowsSupplier', 'usableInPurchases']),
  SUBCONTRACTOR_AP: pick(['allowsSupplier', 'usableInPurchases']),
  SUBCONTRACTOR_RETENTION_PAYABLE: pick(['allowsSupplier']),
  SUBCONTRACTOR_ADVANCE: pick(['allowsSupplier']),
  GRNI: pick(['allowsSupplier', 'usableInPurchases']),

  // ── Employee-related ────────────────────────────────────────────────
  EMPLOYEE_ADVANCE: pick(['usableInAdvances', 'allowsEmployee', 'requiresEmployee']),
  SALARIES_PAYABLE: pick(['usableInPayroll', 'allowsEmployee']),
  GOSI_PAYABLE: pick(['usableInPayroll']),
  EOS_PROVISION: pick(['usableInPayroll', 'allowsEmployee']),

  // ── Revenue accounts ────────────────────────────────────────────────
  RENTAL_REVENUE: pick(['usableInRevenue', 'usableInRental', 'allowsClient']),
  PROJECT_REVENUE: pick(['usableInRevenue', 'usableInProjects', 'allowsProject', 'allowsClient']),
  SERVICE_REVENUE: pick(['usableInRevenue', 'allowsClient']),
  UNBILLED_REVENUE: pick(['usableInRevenue', 'allowsProject']),
  DELAY_PENALTY_REVENUE: pick(['usableInRevenue', 'allowsSupplier']),
  FX_GAIN: pick(['usableInRevenue']),
  ASSET_DISPOSAL_GAIN: pick(['usableInRevenue']),

  // ── Project costs (direct construction costs) ───────────────────────
  PROJECT_COST: pick(['usableInExpenses', 'usableInProjects', 'allowsProject', 'allowsCostCenter']),
  LABOR_COST: pick(['usableInExpenses', 'usableInProjects', 'allowsProject', 'allowsCostCenter']),
  SUBCONTRACTOR_COST: pick(['usableInExpenses', 'usableInProjects', 'allowsProject', 'allowsSupplier']),
  PROJECT_WIP: pick(['usableInProjects', 'allowsProject']),

  // ── Rental operation costs ──────────────────────────────────────────
  FUEL_EXPENSE: pick(['usableInFuel', 'usableInRental', 'allowsEquipment', 'allowsCostCenter']),
  MAINTENANCE_EXPENSE: pick(['usableInMaintenance', 'usableInRental', 'allowsEquipment', 'allowsCostCenter']),
  DRIVER_EXPENSE: pick(['usableInRental', 'allowsEquipment', 'allowsCostCenter']),
  TRANSPORT_EXPENSE: pick(['usableInRental', 'allowsEquipment', 'allowsCostCenter']),
  RENTAL_DEPRECIATION: pick(['usableInRental', 'allowsEquipment']),

  // ── G&A expenses (indirect costs) ───────────────────────────────────
  PAYROLL_EXPENSE: pick(['usableInPayroll', 'allowsCostCenter', 'allowsEmployee']),
  GOSI_EXPENSE: pick(['usableInPayroll', 'allowsEmployee']),
  ADMIN_EXPENSE: pick(['usableInExpenses', 'allowsCostCenter', 'allowsProject']),
  DEPRECIATION_EXPENSE: pick(['usableInExpenses', 'allowsCostCenter']),
  ZAKAT_EXPENSE: pick(['usableInExpenses']),
  ASSET_DISPOSAL_LOSS: pick(['usableInExpenses']),
  FX_LOSS: pick(['usableInExpenses']),

  // ── VAT accounts ────────────────────────────────────────────────────
  VAT_INPUT: pick(['allowsVat', 'usableInPurchases', 'usableInExpenses']),
  VAT_OUTPUT: pick(['allowsVat', 'usableInRevenue']),
  VAT_DUE: pick(['allowsVat']),
  VAT_REFUND_RECEIVABLE: pick(['allowsVat']),
  VAT_SETTLEMENT: pick(['allowsVat']),
  ZAKAT_PAYABLE: pick(['allowsVat']),

  // ── Fixed assets & inventory ────────────────────────────────────────
  // Asset accounts are NOT marked usableIn* — they're not used as
  // selectable accounts in operational screens. They're posted to by
  // specific engine functions (autoEntry*).
  FIXED_ASSET: pick(['allowsEquipment']),
  ACCUM_DEPRECIATION: pick(['allowsEquipment']),
  INVENTORY: pick(['usableInPurchases']),

  // ── Equity / closing accounts ───────────────────────────────────────
  // RETAINED_EARNINGS is posted to only by the closing engine. It should
  // NOT appear in any operational selector — return empty properties.
  RETAINED_EARNINGS: {},
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

/**
 * Compute the usage properties for an account based on its `accountRole`.
 *
 * Returns an empty object for:
 *   - `null` / `undefined` roles (parent / non-posting accounts)
 *   - Unknown roles (defensive — falls back to no properties)
 *   - Roles that intentionally have no usage properties (e.g. RETAINED_EARNINGS)
 *
 * @example
 *   getUsagePropertiesForRole('ADMIN_EXPENSE')
 *   // → { usableInExpenses: true, allowsCostCenter: true, allowsProject: true }
 *
 *   getUsagePropertiesForRole(null)
 *   // → {}  (no properties)
 */
export function getUsagePropertiesForRole(
  role: string | null | undefined
): AccountUsageProperties {
  if (!role) return {}
  return ROLE_USAGE_MAP[role] ? { ...ROLE_USAGE_MAP[role] } : {}
}

/**
 * List every role that has at least one usage property defined.
 * Used by the backfill script to report coverage.
 */
export function getRolesWithUsageProperties(): string[] {
  return Object.keys(ROLE_USAGE_MAP).filter(
    (k) => Object.keys(ROLE_USAGE_MAP[k]).length > 0
  )
}

/**
 * Returns true if the given role has a known usage-property mapping
 * (even if the mapping is intentionally empty, like RETAINED_EARNINGS).
 */
export function isRoleKnown(role: string | null | undefined): boolean {
  if (!role) return false
  return role in ROLE_USAGE_MAP
}
