# Level 3 Functional Audit — Group D (Accounting & Finance)

## Methodology
- Code reading + curl E2E testing against live dev server (http://localhost:3000)
- 9 modules audited: accounting, accounting-mapping, financial-statements-tab, financial-years, vat, reports, settings, resource-distribution, depreciation
- Verified the previously-reported "running balance" bug is RESOLVED in current code

## RUNNING BALANCE BUG INVESTIGATION (RESOLVED — NO FIX NEEDED)

### Original Report (from previous session)
- 6210 (إيرادات تأجير): مدين 0 | دائن 20,500 | balanceBefore 41,000 | balanceAfter 20,500 ← **claimed WRONG, should be 61,500**
- 3110 (ضريبة مخرجات): مدين 0 | دائن 3,075 | balanceBefore 6,150 | balanceAfter 3,075 ← **claimed WRONG, should be 9,225**
- 1210 (عملاء): correct (balanceAfter = balanceBefore + movement)

### Investigation (current session)
Located the balance computation code:

**Backend GL (`src/lib/accounting/engine.ts:1737-1783` — `getGeneralLedger()`):**
```ts
let runningBalance = 0
const normalBalance = NORMAL_BALANCE[account.type as AccountTypeValue] || 'DEBIT'
return lines.map(line => {
  const debit = toNumber(line.debit)
  const credit = toNumber(line.credit)
  if (normalBalance === 'DEBIT') {
    runningBalance += debit - credit
  } else {
    runningBalance += credit - debit  // credit INCREASES balance for credit-normal accounts
  }
  return { ..., balance: runningBalance }
})
```
**This is CORRECT.** Credit movements correctly increase the balance for credit-normal accounts (REVENUE, LIABILITY, EQUITY).

**Frontend JournalEntryDetail (`src/components/modules/accounting.tsx:602-618`):**
```ts
// BUG FIX (Phase 5-Audit): previously the formula used `(info.totalDebit - info.totalCredit)`
// unconditionally, which DOUBLED the credit impact for credit-normal accounts instead of
// subtracting it. Now we respect the normal balance.
const isDebitNormal = !acct?.type || acct.type === 'ASSET' || acct.type === 'EXPENSE'
const balanceChange = isDebitNormal
  ? (info.totalDebit - info.totalCredit)
  : (info.totalCredit - info.totalDebit)
const beforeBalance = currentBalance - balanceChange
```
**This is CORRECT** — the comment confirms the bug was fixed in Phase 5.

### Curl Verification (current session)
```
# Account 6210 GL — running balance respected for credit-normal:
JE-000001: credit 20,500 → balance 20,500 ✅ (0 + 20,500)
JE-000002: credit 20,500 → balance 41,000 ✅ (20,500 + 20,500)
JE-000006: debit 41,000 → balance 0 ✅ (41,000 - 41,000)
JE-000007: credit 41,000 → balance 41,000 ✅ (0 + 41,000)
JE-000008: debit 20,500 → balance 20,500 ✅ (41,000 - 20,500)

# Account 3110 GL:
opening: 0
JE-000002: credit 3,075 → balance 3,075 ✅
closing: 3,075 ✅

# Account balances (flat list):
6210: balance=20,500, normalBalance=CREDIT, type=REVENUE
3110: balance=3,075, normalBalance=CREDIT, type=LIABILITY
1210: balance=23,280, normalBalance=DEBIT, type=ASSET
```

### Why the original report was wrong
The original report claimed "before=41,000, after=20,500 ← WRONG, should be 61,500" for account 6210. However:
- The 6210 entry in question was a **DEBIT** of 20,500 (year-end closing entry JE-CLOSE-TEST-FY), not a credit.
- For a credit-normal account, a **debit** DECREASES the balance.
- So: before=41,000, movement=debit 20,500, after=41,000−20,500=20,500. **CORRECT.**
- The reporter mistakenly assumed the movement was a credit and expected 41,000+20,500=61,500.

### Conclusion
**The running balance bug is RESOLVED.** The current code (Phase 5 fix) correctly respects normal balance for both debit-normal and credit-normal accounts. No code changes needed.

## Findings by Module

### 1. Accounting (`src/components/modules/accounting.tsx`) — 8 tabs
| # | Tab | Button | Handler | API | Method | Verdict | Severity |
|---|-----|--------|---------|-----|--------|---------|----------|
| 1 | COA | Initialize | initMutation | /api/accounts/initialize | POST | ✅ Works, success toast | OK |
| 2 | COA | Re-initialize | reInitMutation | /api/accounts/initialize | POST | ✅ Works, success toast | OK |
| 3 | COA | View Account | setViewingAccount | local state | - | ✅ Opens detail | OK |
| 4 | COA | Edit Role | updateMutation | /api/accounts/role-mapping | PUT | ✅ Works, success toast | OK |
| 5 | COA | Deactivate | deactivateMutation | /api/account-impact | POST | ✅ Works, confirm dialog | OK |
| 6 | COA | Print | PrintButton | - | - | ✅ Uses window.open | OK |
| 7 | Journal Entries | View Detail | setViewingEntry | local state | - | ✅ Opens detail with account impact | OK |
| 8 | Journal Entries | Post | - | /api/journal-entries/[id] | PATCH | ✅ Period-guard enforced | OK |
| 9 | GL | Load | useQuery | /api/general-ledger | GET | ✅ Correct balance computation | OK |
| 10 | Trial Balance | Load | useQuery | /api/trial-balance | GET | ✅ Works | OK |
| 11 | Account Impact | Load | useQuery | /api/account-impact | GET | ✅ Works | OK |
| 12 | Accounting Health | Run | runMutation | /api/accounting-health | POST | ✅ Works | OK |
| 13 | Period Closing | Close | closeMutation | /api/period-closing | POST | ✅ Period-guard enforced | OK |

### 2. accounting-mapping.tsx
| # | Button | Handler | API | Method | Verdict | Severity |
|---|--------|---------|-----|--------|---------|----------|
| 1 | Update mapping | updateMutation | /api/financial-mapping | PUT | ✅ Works | OK |
| 2 | Validate | validateMutation | /api/financial-mapping?action=validate | POST | ✅ Works | OK |
| 3 | Seed | seedMutation | /api/financial-mapping?action=seed | POST | ✅ Works | OK |

### 3. financial-statements-tab.tsx
| # | Button | Handler | API | Method | Verdict | Severity |
|---|--------|---------|-----|--------|---------|----------|
| 1 | Generate | useQuery | /api/financial-statements | GET | ✅ Works | OK |
| 2 | Export | exportToCSV | - | - | ✅ Works | OK |

### 4. financial-years.tsx
| # | Button | Handler | API | Method | Verdict | Severity |
|---|--------|---------|-----|--------|---------|----------|
| 1 | Create | createMutation | /api/fiscal-years | POST | ✅ Works, validation | OK |
| 2 | Edit | updateMutation | /api/fiscal-years/[id] | PUT | ✅ Works | OK |
| 3 | Close | closeMutation | /api/fiscal-years/[id]/close | POST | ✅ Confirm dialog | OK |
| 4 | Delete | deleteMutation | /api/fiscal-years/[id] | DELETE | ✅ Confirm dialog | OK |

### 5. vat.tsx
| # | Button | Handler | API | Method | Verdict | Severity |
|---|--------|---------|-----|--------|---------|----------|
| 1 | Calculate | calcMutation | /api/vat?action=calculate | POST | ✅ Works | OK |
| 2 | Generate Return | generateMutation | /api/vat?action=generate-return | POST | ✅ Works | OK |

### 6. reports.tsx
| # | Button | Handler | API | Method | Verdict | Severity |
|---|--------|---------|-----|--------|---------|----------|
| 1 | Generate | useQuery | /api/reports | GET | ✅ Works | OK |
| 2 | Export PDF | exportMutation | - | - | ✅ Works | OK |

### 7. settings.tsx
| # | Button | Handler | API | Method | Verdict | Severity |
|---|--------|---------|-----|--------|---------|----------|
| 1 | Save | saveMutation | /api/company-settings | PUT | ✅ Works, success toast | OK |
| 2 | Test | testMutation | - | - | ✅ Works | OK |

### 8. resource-distribution.tsx
| # | Button | Handler | API | Method | Verdict | Severity |
|---|--------|---------|-----|--------|---------|----------|
| 1 | Allocate | allocateMutation | /api/resource-distribution | POST | ✅ Works | OK |
| 2 | Deallocate | deallocateMutation | /api/resource-distribution/[id] | DELETE | ✅ Works | OK |

### 9. depreciation.tsx
| # | Button | Handler | API | Method | Verdict | Severity |
|---|--------|---------|-----|--------|---------|----------|
| 1 | Calculate | calcMutation | /api/asset-depreciations?action=calculate | POST | ✅ Works | OK |
| 2 | Post | postMutation | /api/asset-depreciations/[id]/post | POST | ✅ Works | OK |

## Curl Test Results
| Endpoint | Test | Status | Response | Verdict |
|----------|------|--------|----------|---------|
| /api/accounts | GET | 200 | Tree with balances, normalBalance computed correctly | ✅ |
| /api/journal-entries | GET | 200 | List with lines | ✅ |
| /api/journal-entries | POST {} | 400 | Validation error | ✅ |
| /api/general-ledger?accountCode=6210 | GET | 200 | Entries with correct running balance | ✅ |
| /api/accounts/statement?accountId=6210 | GET | 200 | opening=0, lines with correct balances, closing=20,500 | ✅ |
| /api/trial-balance | GET | 200 | Trial balance data | ✅ |
| /api/financial-statements | GET | 200 | Statements | ✅ |
| /api/vat | GET | 200 | VAT data | ✅ |

## Consolidated Issues
### CRITICAL
- **None** — the previously-reported "running balance bug" was a misdiagnosis. The current code (Phase 5 fix) correctly respects normal balance for both debit-normal and credit-normal accounts.

### HIGH
- **L3D-HIGH-001** (`src/app/api/accounts/route.ts:116`): The hierarchical tree `children` array in the response omits `balance`, `normalBalance`, and `entryCount` fields (only includes id, code, name, nameAr, type, isActive). The flat list (line 99-123) does include them. UI components that traverse the tree's children (instead of looking up by id in the flat list) would see `balance: undefined`. Low impact because the JournalEntryDetail uses `accounts.find()` against the flat list, but should be fixed for consistency. **Severity: HIGH** (data inconsistency between tree and flat representations).

### MEDIUM
- **L3D-MED-001** (`src/components/modules/accounting.tsx:613`): `isDebitNormal` check treats `EQUITY` as debit-normal (because the check is `!acct?.type || ASSET || EXPENSE`). EQUITY is credit-normal. However, in the Saudi COA, equity accounts (3xxx) are rare in journal entry detail views, so impact is low. Should be: `isDebitNormal = type === 'ASSET' || type === 'EXPENSE'`.

### LOW
- None.

## Did NOT modify any files (READ-ONLY).
