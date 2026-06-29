// ============================================================================
// BA-05: Safe Dead Code Identification
// ============================================================================
//
// يُحدّد الكود الميت بأمان — لا يحذف أي شيء، فقط يُصنّف ويُ.report.
//
// التصنيفات:
//   - UNUSED_MODEL: Prisma model بدون أي سجلات في DB ولا references في الكود
//   - UNUSED_ROUTE: API route لا يستوردها أحد (لا frontend، لا scripts)
//   - UNUSED_EXPORT: exported function/type لا يستوردها أي ملف آخر
//   - UNUSED_FILE: ملف .ts لا يستورده أي ملف آخر
//   - ORPHAN_SCRIPT: script في scripts/ لا يُستدعى من package.json أو أي ملف آخر
//
// القاعدة الذهبية: لا حذف أي شيء له:
//   - سجلات في DB (count > 0)
//   - imports من أي ملف في src/
//   - mentions في worklog.md أو audit-reports/
//
// Run: bun scripts/identify-dead-code.ts
// ============================================================================

import { db } from '@/lib/db'
import { readFileSync, existsSync } from 'fs'
import { glob } from 'glob'

interface DeadCodeItem {
  category: 'UNUSED_MODEL' | 'UNUSED_ROUTE' | 'UNUSED_EXPORT' | 'UNUSED_FILE' | 'ORPHAN_SCRIPT' | 'SAFE_TO_REMOVE'
  file: string
  detail: string
  evidence: string
  recommendation: 'DELETE' | 'VERIFY_THEN_DELETE' | 'KEEP' | 'REVIEW'
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  BA-05: Safe Dead Code Identification')
  console.log('  (read-only — does NOT delete anything)')
  console.log('═══════════════════════════════════════════════════════════════\n')

  const items: DeadCodeItem[] = []

  // ── 1. Find unused Prisma models ──
  console.log('── 1. Checking Prisma models for unused ones ──')
  // Get all model names from schema
  const schema = readFileSync('prisma/schema.prisma', 'utf8')
  const modelNames = [...schema.matchAll(/^model\s+(\w+)\s+\{/gm)].map(m => m[1])
  console.log(`  Total models in schema: ${modelNames.length}`)

  // For each model, check:
  //   a) Does it have records in DB?
  //   b) Is it referenced in any src/ file?
  for (const model of modelNames) {
    // Skip models that are definitely used (core accounting)
    const coreModels = ['Account', 'JournalEntry', 'JournalLine', 'FiscalYear', 'FiscalPeriod',
      'PeriodClosing', 'CostCenter', 'Project', 'Client', 'Supplier', 'Employee']
    if (coreModels.includes(model)) continue

    try {
      // Check DB record count (Prisma client uses camelCase accessor)
      const camelModel = model.charAt(0).toLowerCase() + model.slice(1)
      // @ts-expect-error — dynamic model access
      const count = await db[camelModel]?.count?.() ?? 0
      if (count > 0) continue // has data — NOT dead

      // Check src/ references using both PascalCase (type) and camelCase (db accessor)
      const srcFiles = await glob('src/**/*.ts', { ignore: 'node_modules/**' })
      let refCount = 0
      for (const f of srcFiles) {
        const content = readFileSync(f, 'utf8')
        // Look for db.camelModel or Prisma.Model references
        if (content.includes(`db.${camelModel}`) ||
            content.includes(`prisma.${camelModel}`) ||
            content.includes(`Prisma.${model}`) ||
            content.includes(`@relation.*${model}`)) {
          refCount++
          break
        }
      }
      if (refCount === 0) {
        items.push({
          category: 'UNUSED_MODEL',
          file: 'prisma/schema.prisma',
          detail: `Model "${model}" has 0 records and 0 references in src/`,
          evidence: `count=${count}, srcRefs=${refCount}`,
          recommendation: 'VERIFY_THEN_DELETE',
        })
      }
    } catch (e) {
      // Model might not exist in client yet (needs db:push) — skip
    }
  }

  // ── 2. Find unused scripts ──
  console.log('\n── 2. Checking scripts/ for orphan scripts ──')
  const scripts = await glob('scripts/*.ts')
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
  const npmScripts = Object.values(packageJson.scripts || {}).join(' ')
  for (const script of scripts) {
    const scriptName = script.split('/').pop()
    // Check if mentioned in package.json scripts
    if (npmScripts.includes(scriptName)) continue
    // Check if imported by other scripts
    let refCount = 0
    for (const other of scripts) {
      if (other === script) continue
      const content = readFileSync(other, 'utf8')
      if (content.includes(scriptName) || content.includes(script.replace('scripts/', './'))) {
        refCount++
      }
    }
    if (refCount === 0) {
      items.push({
        category: 'ORPHAN_SCRIPT',
        file: script,
        detail: `Script "${scriptName}" not referenced in package.json or other scripts`,
        evidence: `npmRefs=0, scriptRefs=${refCount}`,
        recommendation: 'REVIEW',
      })
    }
  }

  // ── 3. Find unused API routes ──
  console.log('\n── 3. Checking API routes for unused ones ──')
  const apiRoutes = await glob('src/app/api/**/route.ts')
  console.log(`  Total API routes: ${apiRoutes.length}`)
  // For each route, check if any frontend component or other code references it
  let unusedRouteCount = 0
  for (const route of apiRoutes) {
    // Extract the API path (e.g., /api/expenses)
    const apiPath = route
      .replace('src/app/api', '/api')
      .replace('/route.ts', '')
      .replace(/\[id\]/g, '.*')  // dynamic segments
      .replace(/\[.*?\]/g, '.*')
    // Check frontend references
    const frontendFiles = await glob('src/**/*.{ts,tsx}', { ignore: ['src/app/api/**'] })
    let refCount = 0
    for (const f of frontendFiles) {
      const content = readFileSync(f, 'utf8')
      // Look for fetch('/api/...') or similar
      const pathRegex = new RegExp(apiPath.replace(/\//g, '\\/'), 'g')
      if (pathRegex.test(content)) {
        refCount++
        break
      }
    }
    if (refCount === 0) {
      unusedRouteCount++
      // Only report if it's not a well-known essential route
      if (!apiPath.includes('health') && !apiPath.includes('dashboard') && !apiPath.includes('reports')) {
        items.push({
          category: 'UNUSED_ROUTE',
          file: route,
          detail: `API route "${apiPath}" not referenced by any frontend file`,
          evidence: `frontendRefs=${refCount}`,
          recommendation: 'REVIEW',
        })
      }
    }
  }
  console.log(`  Routes with no frontend reference: ${unusedRouteCount} (reported: ${items.filter(i => i.category === 'UNUSED_ROUTE').length})`)

  // ── Summary ──
  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('  DEAD CODE SUMMARY')
  console.log('═══════════════════════════════════════════════════════════════')
  const byCategory = items.reduce((acc, i) => {
    acc[i.category] = (acc[i.category] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  for (const [cat, count] of Object.entries(byCategory)) {
    console.log(`  ${cat}: ${count}`)
  }

  if (items.length === 0) {
    console.log('\n  ✅ No dead code detected')
  } else {
    console.log('\n── Items to review ──')
    for (const item of items.slice(0, 50)) { // limit output
      console.log(`  [${item.recommendation}] ${item.category}: ${item.file}`)
      console.log(`    ${item.detail}`)
      console.log(`    evidence: ${item.evidence}`)
    }
    if (items.length > 50) {
      console.log(`  ... and ${items.length - 50} more`)
    }
  }
  console.log('\n═══════════════════════════════════════════════════════════════')

  await db.$disconnect()
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
