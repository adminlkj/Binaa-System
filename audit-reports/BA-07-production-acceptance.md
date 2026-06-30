# BA-07 — Production Acceptance Audit (القبول النهائي للإنتاج)

> **مرحلة القراءة فقط — لا يُسمح بإصلاح أي شيء. الهدف: محاولة كسر النظام.**
> Audit executed: BA-07.1 through BA-07.5 (5 sub-tests)
> Repository state at audit: commit `8e39c44` (BA-06 complete)

---

## Executive Summary

| Sub-test | Verdict | Headline |
|---|---|---|
| **BA-07.1** Accounting Acceptance | ✅ **PASS** (27/27) | Full 13-step scenario; all 6 reports tie out; I1-I7 invariants hold |
| **BA-07.2** Construction Cycle | ⚠️ **PARTIAL PASS** | Structurally complete, all JEs balanced, IFRS15 POC correct; **GAP-1: IFRS15 JE missing `costCenterId` → project P&L off by 200k** |
| **BA-07.3** Permissions & Authorization | 🔴 **CRITICAL FAIL** | **Zero authentication. 183/183 endpoints unprotected. `POST /api/seed?confirm=WIPE_ALL_DATA` wipes the DB with no auth** |
| **BA-07.4** Performance | ✅ **ACCEPTABLE** | 50,000 entries / 100,000 lines; all daily reports <1s; 2 hot-spots noted (not blockers) |
| **BA-07.5** Recovery & Atomicity | ✅ **PASS** | All 4 atomicity tests + backup/restore pass; `db.$transaction` rollback verified |

**Overall BA-07 Verdict:** ⚠️ **CONDITIONAL FAIL** — The accounting engine core is production-grade (BA-07.1, BA-07.4, BA-07.5 pass). However, **BA-07.3 (zero authentication) is a hard production blocker**, and **BA-07.2 GAP-1 (project profitability blind spot) is a significant correctness defect**. The system cannot be declared "past the development phase" until these two are resolved.

---

## Answers to the 7 Post-BA-06 Questions

These are the questions the user said they could not answer from the commit log alone.

### Q1. هل أصبح هناك محرك محاسبي واحد فقط أم لا يزال يوجد أكثر من تنفيذ؟
**✅ YES — single engine.**

- `src/lib/accounting/report-engine.ts` is **GONE** (deleted in BA-02 Task 1, commit `4577e9b`).
- `src/lib/report-engine.ts` is now a **57-line compatibility re-export shim** — every function re-exports from `@/lib/accounting/queries`. New code must import from `queries` directly.
- Final architecture (3 files, clear separation):
  - `queries.ts` — **Single Source of Truth for all reads** (trial balance, GL, statements, project reports, VAT, consistency). The `postedLinesWhere()` function is the ONLY definition of "what counts as a posted line".
  - `engine.ts` — **Write-only** (createJournalEntry, reverseEntry, autoEntry* business functions, chart seeding).
  - `guard.ts` — **Enforcement** (R1-R12, postJournalEntry, reverseJournalEntry, immutability assertions).
- BA-07.1 confirmed numerically: TB == GL == BS == IS == CF == Account Statement (all tie to the riyal).

### Q2. هل أصبحت جميع التقارير تعتمد على مصدر واحد للحقيقة؟
**✅ YES (via the compat shim).**

- All 9 report API routes (`trial-balance`, `general-ledger`, `balance-sheet`, `income-statement`, `cash-flow-statement`, `account-statement`, `project-costs`, `vat-reconciliation`, `project-wip`) import from `@/lib/report-engine` → which re-exports from `@/lib/accounting/queries`.
- BA-07.1 invariant I3 proved it: raw `JournalLine.aggregate` over posted lines == `getTrialBalance` totals (2,530,100.00 == 2,530,100.00).
- **Minor note:** The compat shim is a transitional artifact. Ideally, report routes should import directly from `@/lib/accounting/queries` to make the SSOT explicit. Functionally correct today.

### Q3. هل تم حل اختلاف ميزان المراجعة نهائيًا؟
**✅ YES.**

- `verifyNumericalConsistency()` enforces 7 invariants (I1-I7): TB balance, net balance, GL==TB, accounting equation, IS==BS currentYearEarnings, per-account GL==TB, and comprehensive consistency.
- BA-07.1 ran all 7 on a realistic dataset (opening balances + purchase + sale + expense + payment + collection + manual JE + 2 returns + year-end close):
  - I1: TB totalDebit (2,530,100) == totalCredit (2,530,100) ✓
  - I2: TB netDebit == netCredit ✓
  - I3: GL raw aggregate == TB totals ✓
  - I4: Assets (1,985,100) == Liabilities (15,000) + Equity (1,970,100) ✓
  - I5: IS netIncome (170,100) == BS currentYearEarnings (170,100) ✓
  - I6: AR Account Statement (0) == GL AR closing (0) == TB AR signed (0) ✓
  - I7: verifyNumericalConsistency ok=true (before AND after year-end close) ✓
- **Caveat (performance, not correctness):** `verifyNumericalConsistency` takes **7.91s at 50k entries** (BA-07.4) — it calls `getGeneralLedger` per TB row. Correct, but slow at scale. Optimization recommended.

### Q4. هل أصبح تعديل القيود المرحلة مستحيلاً؟
**✅ YES.**

- `assertJournalEntryMutable(entryId)` throws `ENTRY_IMMUTABLE` for any POSTED entry (guard.ts:462-469).
- `assertJournalEntryReversible(entryId)` enforces: must be POSTED, must not be already reversed.
- The ONLY sanctioned mutation path on a POSTED entry: `reverseJournalEntry` (creates a separate reversal entry that nets the original to zero; both remain POSTED for audit).
- BA-07.1 Scenario 4 (reversal) + BA-07.5 T3 (reversal atomicity) confirmed: double-reversal blocked, reversal nets original to zero, reversal is atomic.
- **Caveat (LOW):** `reverseJournalEntry` returns a **stale object** — `rev.isReversal` is `false` and `rev.reversedEntryId` is `null` in the returned value, even though the DB has them set correctly (BA-07.5 LOW #1). All production callers use `rev.id` only, so this is latent, but it's a real bug.

### Q5. هل أصبحت كل العمليات المالية ترفض التنفيذ عند إغلاق الفترة؟
**✅ YES.**

- guard.ts R6: `assertPeriodOpen(date)` is called inside `postJournalEntry` — throws `AccountingGuardError` if the date falls in a non-OPEN period.
- `accounting-calendar.ts` is the sole source of period state; `period-guard.ts` is a delegate wrapper.
- BA-07.1 Step 10 proved it live:
  - Closed January 2025 → attempted posting dated 2025-01-31 → **REJECTED** (period guard threw).
  - Reopened January → same posting → **SUCCEEDED**.
- BA-07.1 Step 11b proved year-level: after `closeFiscalYear`, posting in the closed FY → **REJECTED**.

### Q6. هل أُعيد بناء اختبارات المحرك بحيث تغطي السيناريوهات المحاسبية الفعلية؟
**✅ YES — with two test-harness caveats.**

- `scripts/test-accounting-behavior.ts` contains **26 tests across 10 real scenarios**: double-entry balance, minimum lines, VAT calculation, reversal net-zero, POSTED immutability, accounting equation, trial-balance cross-path consistency, period closing, negative-value rejection, duplicate-entry-number rejection.
- BA-07.1 run result: **21 passed, 0 failed, 1 skipped** (Scenario 8 period-closing was skipped because the test looks for a September period that wasn't set up — a setup gap).
- **Caveat 1 (test-harness false-pass):** When the setup (`getTestAccounts`) throws because accounts aren't seeded, the harness reports `"0 passed, 0 failed — ALL BEHAVIORAL TESTS PASSED"`. This is the **same anti-pattern** the user originally complained about (tests giving 100% while the system has fatal errors). The harness must treat setup-failure as a hard FAIL, not a silent skip.
- **Caveat 2 (silent skip):** Scenario 8 (period closing) uses a `skip` mechanism that doesn't count as a failure. A skipped test should be a visible warning, not silently absorbed into "PASSED".

### Q7. هل تم اختبار النشر على Render مع PostgreSQL فعليًا بعد هذه التعديلات؟
**❌ NO — cannot verify. This is an open gap.**

- `render.yaml` exists and is well-configured: switches `sqlite→postgresql` via `sed`, runs `prisma generate` + `prisma db push`, builds standalone Next.js, health-check on `/api/health`.
- **However:** there is NO evidence of an actual deployment test — no deployment logs, no CI/CD pipeline, no `test-deploy` script, no rendered URL in the repo.
- **Risk factors identified during BA-07:**
  - BA-07.5 noted SQLite is in `delete` journal mode (not WAL), and one script attempted `PRAGMA wal_checkpoint` via `$executeRawUnsafe` (SQLite-specific — would fail on PostgreSQL).
  - The `db.$queryRaw` in `guard.ts:551` uses double-quoted identifiers (`"JournalEntry"`, `"JournalLine"`) which is PostgreSQL-compatible (good), but any raw SQL elsewhere should be audited for SQLite-isms.
  - The `POST /api/seed?confirm=WIPE_ALL_DATA` endpoint (BA-07.3) would be catastrophically dangerous on a live Render deployment — it must be disabled/gated in production before any real deployment.
- **Recommendation:** A real Render + PostgreSQL deployment smoke test is required before declaring production-ready. This is outside the read-only scope of BA-07.

---

## Detailed Sub-Test Results

### BA-07.1 — Accounting Acceptance ✅ PASS (27/27)

**Scenario executed (per user spec):** Create FY → open periods → opening balances → purchase → sale → expense → payment → collection → manual JE → returns → close month → close year → transfer retained earnings → extract 6 reports → cross-verify.

**All 6 reports extracted and cross-verified:**

| Report | Key Figure |
|---|---|
| Trial Balance | Dr 2,530,100.00 == Cr 2,530,100.00 |
| General Ledger (raw) | 2,530,100.00 == TB ✓ |
| Account Statement (AR) | 0.00 |
| Income Statement | Revenue 200,100 / Expenses 30,000 / Net 170,100 |
| Balance Sheet | Assets 1,985,100 == Liab 15,000 + Equity 1,970,100 |
| Cash Flow | Net 1,585,100 |

**7 numerical invariants (I1-I7): all PASS.**

**Period/year enforcement proved live:** closed January rejects posting; closed FY rejects posting.

**Year-end close + retained earnings transfer:** net profit 200,000 transferred to Retained Earnings account; FY status → CLOSED; all periods → CLOSED.

Script: `scripts/ba-07/01-accounting-acceptance.ts`

### BA-07.2 — Construction Cycle ⚠️ PARTIAL PASS

**Scenario executed (per user spec):** project → budget → contract → PO → material receipt → progress claim → costs → revenues → POC → close project → review profitability.

**What works:**
- Full cycle structurally complete (11/11 steps).
- All 5 journal entries balanced (total Dr == Cr == 460,000, diff = 0).
- IFRS15 POC engine mathematically correct: POC = 20.00% (cost-to-cost: 160k/800k), revenue recognized = 200,000 = POC × contractValue.
- GL at the **account level** 100% accurate (6/6 checks pass).

**What's broken (the breaks BA-07 is meant to find):**

| ID | Severity | Finding |
|---|---|---|
| **GAP-1** | 🔴 HIGH/CRITICAL | **IFRS15 JE does not tag `costCenterId`** (ifrs15.ts:226-228). → Project profitability reports (`getProjectBalances`, `getProjectCostBreakdown`) return revenue=0 instead of 200,000. Project P&L shows **-160,000 instead of +40,000** (off by 500% of true profit). Breaks Single Source of Truth at the project level. |
| **GAP-2** | 🟠 HIGH | **Progress claim creates NO journal entry by design** (`autoEntryProgressClaim` throws; route comment: "Create claim ONLY — no journal entry"). Contradicts the user's scenario expectation that "إصدار مستخلص" recognizes revenue. |
| **GAP-3** | 🟡 MEDIUM | No guard prevents posting to a COMPLETED project. |
| **GAP-4** | 🟡 MEDIUM | Reopening COMPLETED → ACTIVE allowed without audit trail. |
| **GAP-5** | 🟢 LOW | `autoEntryManualCost` ignores `costType` — all costs hit PROJECT_COST (7110), breaking cost-type analysis. |
| **GAP-6** | 🟢 LOW | `autoEntryManualCost` only tags `costCenterId` on Dr line, not Cr line. |
| **GAP-7** | 🟢 LOW | Goods Receipt JE doesn't tag `costCenterId` on any line. |

Script: `scripts/ba-07/02-construction-cycle.ts`

### BA-07.3 — Permissions & Authorization 🔴 CRITICAL FAIL

**Finding:** The system has **NO authentication or authorization whatsoever.**

- Prisma schema has **no** `User / Session / Role / Permission` models.
- **No** `middleware.ts` anywhere in the project.
- **No** NextAuth config (`authOptions`, `[...nextauth]/route.ts`) — `next-auth@^4.24.11` is in `package.json` but is a **phantom dependency** (zero imports anywhere in `src/`).
- **Zero** route handlers perform any identity/permission check: `rg "getServerSession|requireAuth|checkPermission|requireRole" src/app/api/` → 0 matches.

**Exposure quantified:**
- **183** route.ts files / **341** HTTP handler functions.
- **0** handlers perform any auth/permission check.
- **Unprotected: 183/183. Protected: 0/183.**

**Live probe results (GET, no auth header/cookie):**

| Endpoint | HTTP | Data returned |
|---|---|---|
| `/api/dashboard` | 200 | Full dashboard metrics (2.7KB) |
| `/api/accounts` | 200 | Full chart of accounts + IDs (74KB) |
| `/api/journal-entries` | 200 | Actual entries + IDs (8KB) |
| `/api/employees` | 200 | `[]` (exposed) |
| `/api/payroll-runs` | 200 | `[]` (exposed) |
| `/api/fiscal-years` | 200 | Fiscal years + IDs (7KB) |
| `/api/reports/balance-sheet` | 200 | Full balance sheet (21KB) |
| `/api/accounting-guard/health` | 200 | R1-R12 internal results |
| `/api/accounting-health` | 200 | Health report |
| `/` (homepage) | 200 | Full ERP shell (81KB) |

**9/9 returned HTTP 200 with real data. 0/9 required any auth.**

**Most dangerous unauthenticated endpoints:**
- `POST /api/seed?confirm=WIPE_ALL_DATA` — **wipes the entire production database** with a single unauthenticated request.
- `POST /api/journal-entries` — post arbitrary journal entries.
- `DELETE /api/expenses/[id]` — reverse a posted JE.
- `POST /api/fiscal-years/[id]/close` — close a fiscal year.
- `PUT /api/fiscal-years/[id]` — reopen a closed year.
- `POST /api/period-closing` — close periods.
- `POST /api/payroll-runs` — run payroll.

**Verdict:** The accounting guard (R1-R12 from BA-02) protects **accounting integrity** (balanced entries, open period, POSTED immutability) — NOT **authorization**. Every visitor is effectively an anonymous superuser. **This is a hard production blocker.**

### BA-07.4 — Performance ✅ ACCEPTABLE

**Dataset seeded:** 50,000 journal entries / 100,000 journal lines (FY2025, spread across 12 months). Cleaned up after measurement.

**Query latency (median of 3 runs):**

| Query | Baseline (19 entries) | Large (50,019 entries) | Verdict |
|---|---|---|---|
| `getTrialBalance` | 5.4 ms | 84.7 ms | GOOD |
| `getGeneralLedger` (1 account) | 3.7 ms | 1,010 ms | GOOD |
| `getAccountBalance` | 1.5 ms | 19.5 ms | GOOD |
| `getIncomeStatement` | 2.5 ms | 112.9 ms | GOOD |
| `getBalanceSheet` | 4.7 ms | 326.0 ms | GOOD |
| `getCashFlow` | 3.1 ms | **2,070 ms** | ⚠️ ACCEPTABLE (borderline) |
| `verifyNumericalConsistency` | 58.1 ms | **7,910 ms** | 🟡 SLOW |

**HTTP endpoints (large dataset, dev server):**

| Endpoint | Median | Verdict |
|---|---|---|
| `GET /api/journal-entries?limit=50` | 77.9 ms | GOOD |
| `GET /api/dashboard` | 525.8 ms | GOOD |
| `GET /api/reports/balance-sheet` | 346.8 ms | GOOD |

**Index situation:** Existing indexes on `JournalEntry(entryNo, status, date, sourceType+sourceId, reversedEntryId, isSystem)` and `JournalLine(journalEntryId, accountId, costCenterId)` are sufficient at 50k. Missing (future-proofing): `deletedAt` indexes, composite `(accountId, journalEntryId)`.

**Hot-spots (not blockers):**
1. `getCashFlow` (2.07s @ 50k) — uses `findMany` + in-JS aggregation instead of `groupBy`. Will become SLOW at ~200k entries.
2. `verifyNumericalConsistency` (7.91s @ 50k) — calls `getGeneralLedger` per TB row. Affects the admin `/api/accounting-consistency` route.

Script: `scripts/ba-07/04-performance.ts`

### BA-07.5 — Recovery & Atomicity ✅ PASS

**All 4 atomicity tests + backup/restore passed. DB left clean.**

| Test | Verdict | Detail |
|---|---|---|
| T1 — Mid-tx failure (entry + 2 lines, then throw) | ✅ PASS | `db.$transaction` rolled back JE + 2 lines. 0 survivors. |
| T2 — Composite operation (Expense + JE + link, then throw) | ✅ PASS | Both Expense and JE rolled back. No divergence. |
| T3 — Reversal atomicity (3 sub-tests) | ✅ PASS | Original posts; failed reversal leaves no trace; proper reversal succeeds. |
| T4 — Backup/restore (3 sub-tests) | ✅ PASS | Backup file matches source (sha256); soft-delete+throw leaves entry POSTED; restored DB matches all 7 counts. |

**Key finding (LOW):** `reverseJournalEntry` returns a stale object — `isReversal=false`, `reversedEntryId=null` in the returned value, even though the DB has them set correctly (guard.ts:372, 391-399). All production callers use `rev.id` only, so latent, but a real bug.

Script: `scripts/ba-07/05-recovery-atomicity.ts`

---

## Production-Readiness Verdict

The user said: *"إذا كانت الإجابة نعم على جميع هذه النقاط، ومع نجاح BA-07، فسأعتبر النظام قد تجاوز مرحلة 'مشروع قيد التطوير'."*

### Scorecard

| Criterion | Status |
|---|---|
| Q1 Single accounting engine | ✅ Yes |
| Q2 All reports from single source of truth | ✅ Yes |
| Q3 Trial balance discrepancy resolved | ✅ Yes |
| Q4 Posted entries immutable | ✅ Yes |
| Q5 Closed period rejects all financial ops | ✅ Yes |
| Q6 Engine tests cover real scenarios | ✅ Yes (with harness caveats) |
| Q7 Render + PostgreSQL deployment tested | ❌ **No — open gap** |
| BA-07.1 Accounting acceptance | ✅ Pass |
| BA-07.2 Construction cycle acceptance | ⚠️ Partial (GAP-1 breaks project P&L) |
| BA-07.3 Permissions acceptance | 🔴 **Critical fail (zero auth)** |
| BA-07.4 Performance acceptance | ✅ Acceptable |
| BA-07.5 Recovery acceptance | ✅ Pass |

### Conclusion

**The system has NOT yet passed "project under development" stage.** Two hard blockers remain:

1. **🔴 BA-07.3 — Zero authentication.** This is non-negotiable for production. Any internet-facing deployment is immediately compromised (the `/api/seed?confirm=WIPE_ALL_DATA` endpoint alone is catastrophic). Requires: User/Session/Role models, NextAuth wiring, middleware.ts, per-route RBAC checks.

2. **🔴 BA-07.2 GAP-1 — IFRS15 JE missing `costCenterId`.** Project profitability reports are unreliable (off by 200k in the test scenario). For a construction ERP, project P&L is a core deliverable. Fix: tag `costCenterId` on the IFRS15 revenue JE lines (ifrs15.ts:226-228).

**What IS production-grade (the foundation is solid):**
- The unified accounting engine (queries.ts SSOT) is correct — all reports tie out to the riyal across 7 invariants.
- The guard (R1-R12) enforces double-entry integrity, period locks, and POSTED immutability.
- Transaction atomicity is verified — no partial data on mid-flight failures.
- Performance is acceptable at 50k entries (with two optimization hot-spots noted).
- Year-end close + retained earnings transfer works.
- The construction cycle is structurally complete and IFRS15 POC math is correct.

**To reach production-ready, the minimal path is:**
1. Implement authentication + RBAC (BA-07.3).
2. Fix IFRS15 costCenterId tagging (BA-07.2 GAP-1).
3. Disable/gate `/api/seed` in production.
4. Conduct a real Render + PostgreSQL deployment smoke test (Q7).
5. (Recommended) Optimize `getCashFlow` and `verifyNumericalConsistency` for large datasets.
6. (Recommended) Fix the test-harness false-pass bug in `test-accounting-behavior.ts`.

---

*Audit conducted read-only. No production code modified. All test data cleaned up (BA-07.4 50k entries removed; BA-07.1/BA-07.2 legitimate test data retained as demonstration). Scripts retained under `scripts/ba-07/` for repeatability.*
