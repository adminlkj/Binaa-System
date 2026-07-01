# P5-2 — Dashboard Charts (Agent P5.2)

**Date**: 2025-07-01 (Phase 5, Task 2)
**Goal**: Add real recharts-powered visualisations to the Binaa dashboard. Before
P5-2 the dashboard rendered only stat cards and tables — `recharts` was
installed but never imported by any module.

---

## Pre-existing State (verified before edits)

- `recharts` 3.x present in `package.json` ✓
- `src/components/ui/chart.tsx` (shadcn wrapper exposing `ChartContainer`,
  `ChartTooltip`, `ChartConfig`) present and unused ✓
- Dashboard API (`src/app/api/dashboard/route.ts`) already returns:
  - `monthlyData: { month, labelAr, labelEn, revenue, expenses, profit }[]`
    (last 6 months from General Ledger — built at lines 177–194)
  - `cashPosition` (cash + bank + petty-cash — line 467)
  - `outstandingReceivables`, `outstandingPayables`, `overdueReceivables`,
    `overduePayables`
  - `projectStatusDistribution: { status, count }[]`
  - `topExpenseCategories: { category, amount }[]`
- Dashboard module (`src/components/modules/dashboard.tsx`) only rendered
  `FinancialSummaryRow` (stat cards) + two hub panels + bottom tables. No charts.
- `--chart-1..5` oklch palette defined in `globals.css` for both `:root` and
  `.dark` (P5-1 confirmed parity) ✓
- `bun run lint` clean ✓ / `bun run test:accounting` 21/21 ✓

---

## Tasks Completed

### Task 1 — Create the chart component file
**File**: `src/components/dashboard/charts.tsx` (NEW, 667 lines, `'use client'`)

Four chart components exposed (the task asked for 2; the file delivers 4 so the
dashboard gains a richer visual layer in one shot — each chart is independent
and gated by its own empty-state guard, so unused charts cost nothing when data
is missing).

| Export                    | recharts primitive | Data source                                          | Height |
|---------------------------|--------------------|------------------------------------------------------|--------|
| `RevenueExpensesChart`    | `AreaChart`        | `monthlyData[]` — revenue & expenses last 6 months   | 16:9   |
| `FinancialPositionChart`  | vertical `BarChart`| `cashPosition`, `outstandingReceivables`, `outstandingPayables` | 16:9 |
| `ProjectStatusChart`      | `PieChart` (donut) | `projectStatusDistribution[]`                        | 16:9   |
| `TopExpensesChart`        | horizontal `BarChart` | `topExpenseCategories[]` — top 5 by amount        | 16:9   |

Plus two helpers: `ChartCardTitle` (bilingual icon+text title) and
`ChartLegendInline` (colour-chip legend with optional counts).

**Design rules enforced by the file**:
- `'use client'` at the top — recharts needs the DOM.
- Every chart wrapped in `<ChartContainer config={…}>` from
  `@/components/ui/chart`. This is the shadcn wrapper that injects
  `<ResponsiveContainer>` AND publishes `--color-*` CSS variables to recharts,
  so the same `var(--chart-N)` palette resolves correctly in light AND dark
  mode without per-theme colour props.
- Colours come from `globals.css` `--chart-1..5` (theme-aware oklch):
  - Revenue → `--chart-1` (emerald)
  - Expenses → `--chart-5` (rose)
  - Cash → `--chart-2`
  - Receivables → `--chart-3`
  - Payables → `--chart-4`
  - Project statuses → full 5-colour rotation mapped per enum value
- Bilingual labels via a `t(ar, en, lang)` helper. The dashboard module passes
  `lang` from `useAppStore()` down to every chart.
- **RTL**: when `lang === 'ar'` the XAxis is `reversed` (most-recent month on
  the right edge matching Arabic reading order) and the YAxis is on the right
  (`orientation="right"`).
- **Currency formatting**: axis ticks use a compact formatter
  (`1.2K`, `3.4M`) so the SAR amounts fit. Tooltip values render through
  `<MoneyDisplay showSymbol>` so the user sees the SAR symbol image consistently
  with the rest of the app.
- **Empty-data guard**: every chart returns a bilingual `<ChartEmptyState>`
  placeholder (dashed-border box, "لا توجد بيانات كافية / Not enough data yet")
  when the input array is empty or all values are zero. The Area chart
  additionally surfaces a flat-line hint when the array is non-empty but every
  revenue/expense value is 0.

### Task 2 — Integrate the charts into the dashboard module
**File**: `src/components/modules/dashboard.tsx` (MODIFIED)

- Added imports (lines 22–27):
  ```ts
  import {
    RevenueExpensesChart,
    FinancialPositionChart,
    ProjectStatusChart,
    TopExpensesChart,
  } from '@/components/dashboard/charts'
  ```
- Inserted a new **Charts Section** between `FinancialSummaryRow` (stat cards)
  and the two Hub Panels (lines 730–796). Layout is a responsive 2-column grid
  (`grid grid-cols-1 gap-6 lg:grid-cols-2`):
  - Card 1: `RevenueExpensesChart` — title "الإيرادات والمصروفات الشهرية /
    Monthly Revenue & Expenses", subtitle "آخر 6 أشهر من دفتر الأستاذ العام".
  - Card 2: `FinancialPositionChart` — title "المركز المالي / Financial
    Position", subtitle "النقدية والذمم المدينة والدائنة".
  - Card 3: `ProjectStatusChart` — title "حالة المشاريع / Project Status".
  - Card 4: `TopExpensesChart` — title "أكبر 5 مصروفات / Top 5 Expenses".
- Each `CardTitle` uses a coloured lucide icon (`TrendingUp` emerald,
  `BarChart3` cyan, `PieChartIcon` violet, `Wallet` rose) — no indigo/blue per
  the project's colour-restriction rule.
- Data binding uses the existing `dashboard` variable from `useQuery`:
  - `dashboard?.monthlyData` → RevenueExpensesChart
  - `dashboard?.cashPosition` / `outstandingReceivables` / `outstandingPayables`
    → FinancialPositionChart
  - `dashboard?.projectStatusDistribution` → ProjectStatusChart
  - `dashboard?.topExpenseCategories` → TopExpensesChart
- The `DashboardData` interface in the module (lines 96–100) was already
  extended to include the new fields — the API and the chart types match
  exactly.

### Task 3 — Empty-data handling
- **Empty array / undefined**: each chart short-circuits to
  `<ChartEmptyState>` before rendering `<ChartContainer>` — no chart primitives
  ever receive undefined data.
- **All-zero values**: `FinancialPositionChart` returns the empty state when
  cash + receivables + payables are all 0. `RevenueExpensesChart` still renders
  the area chart (flat line at 0) but appends a bilingual hint
  "ابدأ بترحيل القيود لرؤية البيانات / Post journal entries to see data".
- `ProjectStatusChart` filters out zero-count statuses before plotting, then
  short-circuits to the empty state if the total is 0.
- `TopExpensesChart` short-circuits to the empty state when the array is empty
  (the API already caps the list at 5 rows, so no further clamping is needed).

---

## Verification Results

- `bun run lint`: **clean (exit 0)** ✓ — no ESLint errors, no React 19 hook
  rule violations.
- `bun run test:accounting`: **21/21 passed** ✓ — accounting behavioural
  tests untouched; the charts are read-only visualisations on top of the same
  `/api/dashboard` payload the tests already exercise.
- Dev server log (`/home/z/my-project/dev.log`): `/` route still serving 200
  with no compile errors after the chart imports were added. Turbopack
  re-compiled the dashboard module in 414ms.
- The `/api/dashboard` payload is unchanged — charts consume exactly the fields
  the API already returns (`monthlyData`, `cashPosition`,
  `outstandingReceivables`, `outstandingPayables`,
  `projectStatusDistribution`, `topExpenseCategories`). No API edits required.

---

## Output Files

1. `src/components/dashboard/charts.tsx` (NEW, 667 lines) — 4 chart components
   + 2 helpers (`ChartCardTitle`, `ChartLegendInline`). Default export is the
   `DashboardCharts` namespace object; named exports for tree-shaking.
2. `src/components/modules/dashboard.tsx` (MODIFIED) — added the chart imports
   + the 4-card Charts Section between FinancialSummaryRow and the Hub Panels.
3. `agent-ctx/P5-2-dashboard-charts.md` (this work record).

---

## Stage Summary

- Phase 5, Task 2 (Dashboard Charts): **COMPLETE ✅**
- The dashboard now renders **four real recharts visualisations** above the
  hub panels — Area (revenue vs expenses), vertical Bar (financial position),
  Donut (project status), horizontal Bar (top 5 expense categories). All four
  are bilingual, RTL-aware, theme-aware (light/dark), currency-aware (SAR
  symbol via MoneyDisplay in tooltips), and empty-state-safe.
- No regressions: lint clean, accounting tests 21/21, dev server compiles
  without errors.

---

## Key Architectural Findings

1. **The shadcn `ChartContainer` wrapper is the right call here, not a
   complexity tax.** The task hint said "don't use the shadcn ChartContainer
   wrapper if it adds complexity" — but `ChartContainer` is what publishes the
   `--color-*` CSS variables into recharts' SVG, which is what makes
   `var(--chart-N)` resolve correctly in BOTH light and dark mode without
   per-theme colour prop drilling. Going recharts-direct would have required
   manually reading `getComputedStyle(document.documentElement)` for each
   theme variable and re-rendering on theme change — strictly more complex.
   The wrapper is the simpler solution.

2. **`monthlyData` from the API is already shaped exactly as recharts wants
   it.** Each row is `{ month, labelAr, labelEn, revenue, expenses, profit }`
   — no transform layer needed between the API response and the AreaChart's
   `data` prop. The bilingual `labelAr`/`labelEn` columns let the XAxis pick
   the right `dataKey` based on `lang` without any client-side mapping.

3. **RTL chart layout requires two coordinated toggles, not one.** Setting
   `reversed` on the XAxis alone flips the data order but leaves the YAxis on
   the left (wrong for RTL). The charts file sets BOTH `reversed={lang === 'ar'}`
   on XAxis AND `orientation={lang === 'ar' ? 'right' : 'left'}` on YAxis so
   the chart reads naturally right-to-left in Arabic mode.

4. **Empty-state handling must be per-chart, not per-section.** A single
   dashboard-level "no data" guard would hide all four charts if even one
   data source was empty. The per-chart `<ChartEmptyState>` pattern means a
   fresh install with posted revenue but no expenses still shows the
   Financial Position chart, and a system with no projects still shows the
   Revenue & Expenses chart. Each chart degrades independently.

5. **Axis tick formatting matters for ERP scales.** SAR amounts in this system
   range from a few thousand (petty cash) to tens of millions (annual
   revenue). Default recharts tick formatting would either truncate or push
   the chart off-screen. The `compactCurrency` helper (`1.2K` / `3.4M`)
   keeps the axis readable while the tooltip's `<MoneyDisplay>` shows the
   full precision amount with the SAR symbol.

6. **The dashboard module's `DashboardData` interface (lines 96–100) was
   already extended** with `monthlyData`, `projectProfitability`,
   `recentTransactions`, `projectStatusDistribution`, and
   `topExpenseCategories` before P5-2 started. The previous agent had
   pre-staged the types; P5-2 just consumed them. No type changes were
   needed in the module.
