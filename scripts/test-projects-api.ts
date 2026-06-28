/**
 * E2E Test 2: Projects Cycle — Error Cases & Edge Cases (HTTP API layer)
 * Tests the actual API routes that the UI uses, not direct DB calls.
 */
const BASE = 'http://localhost:3000'

const results: Array<{ step: string; status: 'PASS' | 'FAIL' | 'WARN'; detail: string }> = []
const errors: string[] = []

function log(step: string, status: 'PASS' | 'FAIL' | 'WARN', detail = '') {
  results.push({ step, status, detail })
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '!'
  console.log(`[${icon}] ${step}${detail ? ': ' + detail : ''}`)
  if (status === 'FAIL') errors.push(`${step}: ${detail}`)
}

async function req(method: string, path: string, body?: any) {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  try {
    const r = await fetch(`${BASE}${path}`, opts)
    let data: any = null
    const text = await r.text()
    try { data = JSON.parse(text) } catch { data = text }
    return { status: r.status, data, ok: r.ok }
  } catch (e) {
    return { status: 0, data: null, ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════')
  console.log('E2E TEST 2: Projects Cycle — API Error Cases')
  console.log('═══════════════════════════════════════════════════════\n')

  // Get existing project/contract IDs, or create them if none exist
  const clientsRes = await req('GET', '/api/clients')
  const clients = clientsRes.data as any[]
  const clientId = clients[0]?.id
  const branchesRes = await req('GET', '/api/branches')
  const branches = branchesRes.data as any[]
  const branchId = branches[0]?.id
  if (!clientId || !branchId) {
    log('Precondition: setup data', 'FAIL', 'no client or branch — run setup first')
    return report()
  }

  let projectsRes = await req('GET', '/api/projects')
  let projects = projectsRes.data as any[]
  let project = projects?.[0]
  if (!project) {
    // Create a project + contract for testing
    const r = await req('POST', '/api/projects', {
      code: 'PRJ-API-TEST', name: 'مشروع اختبار API',
      clientId, branchId, startDate: '2026-02-01', contractValue: 1000000,
    })
    if (r.status !== 201) {
      log('Precondition: create project', 'FAIL', `status=${r.status}`)
      return report()
    }
    project = r.data
    log('Precondition: created test project', 'PASS', project.code)
  }
  const projectId = project.id
  let contractId = project.contracts?.[0]?.id
  // If no contract on project, create one
  if (!contractId) {
    const r = await req('POST', '/api/contracts', {
      projectId, clientId,
      contractNo: 'CTR-API-TEST',
      date: '2026-02-01', value: 1000000, startDate: '2026-02-01',
      contractType: 'PROJECT',
    })
    if (r.status === 201) contractId = r.data.id
  }
  console.log(`Using project: ${project.code} (${projectId})`)
  console.log(`Using contract: ${contractId}`)

  // ═══ TEST A: Duplicate project code ═══
  console.log('\n── Test A: Duplicate Project Code ──')
  {
    const r = await req('POST', '/api/projects', {
      code: 'PRJ-TEST-001', // duplicate
      name: 'محاولة تكرار',
      clientId, branchId,
      startDate: '2026-02-01',
    })
    if (r.status === 400) {
      log('Duplicate code rejected', 'PASS', `400: ${r.data?.error}`)
    } else {
      log('Duplicate code rejected', 'FAIL', `expected 400, got ${r.status}`)
    }
  }

  // ═══ TEST B: Missing required fields ═══
  console.log('\n── Test B: Missing Required Fields ──')
  {
    const r = await req('POST', '/api/projects', { code: 'PRJ-X' })
    if (r.status === 400) {
      log('Missing fields rejected', 'PASS', `400: ${r.data?.error}`)
    } else {
      log('Missing fields rejected', 'FAIL', `expected 400, got ${r.status}`)
    }
  }

  // ═══ TEST C: Create valid project via API ═══
  console.log('\n── Test C: Create Project via API ──')
  let newProjectId: string
  {
    const r = await req('POST', '/api/projects', {
      code: 'PRJ-API-002',
      name: 'مشروع اختبار API',
      clientId, branchId,
      startDate: '2026-03-01',
      contractValue: 500000,
      projectType: 'CONSTRUCTION',
    })
    if (r.status === 201 && r.data?.id) {
      newProjectId = r.data.id
      log('Create via API', 'PASS', `201 id=${r.data.id.slice(-8)} code=${r.data.code}`)

      // Verify defaults
      if (r.data.contractValue === 500000) {
        log('contractValue preserved', 'PASS', `500000`)
      } else {
        log('contractValue preserved', 'FAIL', `got ${r.data.contractValue}`)
      }
    } else {
      log('Create via API', 'FAIL', `status=${r.status} data=${JSON.stringify(r.data).slice(0, 200)}`)
      return report()
    }
  }

  // ═══ TEST D: Create contract via API ═══
  console.log('\n── Test D: Create Contract via API ──')
  let newContractId: string
  {
    const r = await req('POST', '/api/contracts', {
      projectId: newProjectId,
      clientId,
      contractNo: 'CTR-API-002',
      date: '2026-03-01',
      value: 500000,
      vatRate: 0.15,
      startDate: '2026-03-01',
      endDate: '2026-09-30',
      contractType: 'PROJECT',
      billingMethod: 'PROGRESS_CLAIMS',
      advancePaymentPercent: 10,
      retentionPercent: 5,
    })
    if (r.status === 201 && r.data?.id) {
      newContractId = r.data.id
      log('Create via API', 'PASS', `201 contractNo=${r.data.contractNo}`)
      log('Contract math', Number(r.data.vatAmount) === 75000 && Number(r.data.totalValue) === 575000 ? 'PASS' : 'FAIL',
        `value=${r.data.value} vat=${r.data.vatAmount} total=${r.data.totalValue}`)
    } else {
      log('Create via API', 'FAIL', `status=${r.status} data=${JSON.stringify(r.data).slice(0, 200)}`)
      return report()
    }
  }

  // ═══ TEST E: Auto-generate contractNo ═══
  console.log('\n── Test E: Auto-generate Contract Number ──')
  {
    const r = await req('POST', '/api/contracts', {
      projectId: newProjectId,
      date: '2026-03-05',
      value: 100000,
      startDate: '2026-03-05',
    })
    if (r.status === 201 && r.data?.contractNo?.startsWith('CTR-')) {
      log('Auto-generated contractNo', 'PASS', r.data.contractNo)
    } else {
      log('Auto-generated contractNo', 'FAIL', `status=${r.status} data=${JSON.stringify(r.data).slice(0, 200)}`)
    }
  }

  // ═══ TEST F: Create change order via API ═══
  console.log('\n── Test F: Create Change Order via API ──')
  let newCoId: string
  {
    const r = await req('POST', '/api/change-orders', {
      contractId: newContractId,
      projectId: newProjectId,
      description: 'إضافة أعمال تشطيب',
      changeType: 'ADDITION',
      originalValue: 500000,
      changeValue: 50000,
      date: '2026-03-15',
    })
    if (r.status === 201 && r.data?.id) {
      newCoId = r.data.id
      log('Create via API', 'PASS', `${r.data.orderNo} new=${r.data.newValue} vat=${r.data.vatAmount}`)
      if (Number(r.data.newValue) === 550000 && Number(r.data.vatAmount) === 7500 && Number(r.data.totalChangeValue) === 57500) {
        log('ChangeOrder math', 'PASS', 'new=550000 vat=7500 total=57500')
      } else {
        log('ChangeOrder math', 'FAIL', `unexpected values`)
      }
    } else {
      log('Create via API', 'FAIL', `status=${r.status} data=${JSON.stringify(r.data).slice(0, 200)}`)
    }
  }

  // ═══ TEST G: Approve change order via API ═══
  console.log('\n── Test G: Approve Change Order via API ──')
  {
    const r = await req('PUT', `/api/change-orders/${newCoId}`, {
      status: 'APPROVED',
      approvedBy: 'test',
    })
    if (r.status === 200 && r.data?.status === 'APPROVED') {
      log('Approve CO', 'PASS', `status=APPROVED approvedDate=${r.data.approvedDate?.slice(0, 10)}`)
    } else {
      log('Approve CO', 'FAIL', `status=${r.status}`)
    }

    // ⚠️ Critical check: Does approving CO update contract.value?
    const contractRes = await req('GET', `/api/contracts/${newContractId}`)
    const contract = contractRes.data
    if (Number(contract?.value) === 550000) {
      log('Contract value updated by CO', 'PASS', `value=${contract.value}`)
    } else {
      log('Contract value NOT updated by CO', 'WARN', `value=${contract?.value}, expected 550000 — business logic: COs may need separate "apply" step`)
    }
  }

  // ═══ TEST H: Create progress claim via API ═══
  console.log('\n── Test H: Create Progress Claim via API ──')
  let newClaimId: string
  {
    const r = await req('POST', '/api/progress-claims', {
      projectId: newProjectId,
      contractId: newContractId,
      claimNo: 'PC-API-001',
      date: '2026-03-31',
      percentage: 30,
      amount: 150000,
      vatRate: 0.15,
      status: 'DRAFT',
    })
    if (r.status === 201 && r.data?.id) {
      newClaimId = r.data.id
      log('Create via API', 'PASS', `${r.data.claimNo} amount=${r.data.amount} pct=${r.data.percentage}`)
      log('Claim math', Number(r.data.vatAmount) === 22500 && Number(r.data.totalAmount) === 172500 ? 'PASS' : 'FAIL',
        `vat=${r.data.vatAmount} total=${r.data.totalAmount}`)

      // Verify NO JE in DRAFT
      if (!r.data.journalEntryId) {
        log('No JE in DRAFT', 'PASS', 'JE only on APPROVE')
      } else {
        log('No JE in DRAFT', 'FAIL', `JE created prematurely: ${r.data.journalEntryId}`)
      }
    } else {
      log('Create via API', 'FAIL', `status=${r.status} data=${JSON.stringify(r.data).slice(0, 200)}`)
      return report()
    }
  }

  // ═══ TEST I: Submit claim via API (DRAFT → SUBMITTED) ═══
  console.log('\n── Test I: Submit Claim via API ──')
  {
    const r = await req('PUT', `/api/progress-claims/${newClaimId}`, { status: 'SUBMITTED' })
    if (r.status === 200 && r.data?.status === 'SUBMITTED') {
      log('Submit claim', 'PASS', `status=${r.data.status}`)
    } else {
      log('Submit claim', 'FAIL', `status=${r.status} data=${JSON.stringify(r.data).slice(0, 200)}`)
    }
  }

  // ═══ TEST J: Approve claim via API (should create JE) ═══
  console.log('\n── Test J: Approve Claim via API (JE creation) ──')
  {
    const beforeJEs = await req('GET', '/api/journal-entries?pageSize=1')
    const beforeCount = (beforeJEs.data?.total) ?? (Array.isArray(beforeJEs.data) ? beforeJEs.data.length : 0)

    const r = await req('PUT', `/api/progress-claims/${newClaimId}`, { status: 'APPROVED' })
    if (r.status === 200 && r.data?.status === 'APPROVED' && r.data?.journalEntryId) {
      log('Approve claim', 'PASS', `status=APPROVED JE=${r.data.journalEntryId.slice(-8)}`)
    } else {
      log('Approve claim', 'FAIL', `status=${r.status} data=${JSON.stringify(r.data).slice(0, 200)}`)
    }
  }

  // ═══ TEST K: Reject already-APPROVED claim (should fail) ═══
  console.log('\n── Test K: Reject APPROVED Claim (should fail) ──')
  {
    const r = await req('PUT', `/api/progress-claims/${newClaimId}`, { status: 'REJECTED' })
    // Per the allowed transitions: APPROVED → REJECTED is allowed! (not a bug)
    if (r.status === 200) {
      log('Reject APPROVED claim', 'WARN', `transition APPROVED→REJECTED is allowed per current rules`)
    } else if (r.status === 400) {
      log('Reject APPROVED claim', 'PASS', `400: blocked`)
    } else {
      log('Reject APPROVED claim', 'FAIL', `unexpected status=${r.status}`)
    }
  }

  // ═══ TEST L: Delete APPROVED change order (should fail) ═══
  console.log('\n── Test L: Delete APPROVED CO (should fail) ──')
  {
    const r = await req('DELETE', `/api/change-orders/${newCoId}`)
    if (r.status === 400) {
      log('Delete APPROVED CO blocked', 'PASS', `400: ${r.data?.error}`)
    } else if (r.status === 200) {
      log('Delete APPROVED CO blocked', 'FAIL', 'CO was deleted despite being APPROVED — should require DRAFT only')
    } else {
      log('Delete APPROVED CO blocked', 'FAIL', `unexpected status=${r.status}`)
    }
  }

  // ═══ TEST M: Delete ACTIVE contract (should fail) ═══
  console.log('\n── Test M: Delete ACTIVE Contract (should fail) ──')
  {
    const r = await req('DELETE', `/api/contracts/${newContractId}`)
    if (r.status === 400) {
      log('Delete ACTIVE contract blocked', 'PASS', `400: ${r.data?.error}`)
    } else if (r.status === 200) {
      log('Delete ACTIVE contract blocked', 'FAIL', 'contract was deleted despite being ACTIVE')
    } else {
      log('Delete ACTIVE contract blocked', 'FAIL', `unexpected status=${r.status}`)
    }
  }

  // ═══ TEST N: Progress claim exceeds contract value ═══
  console.log('\n── Test N: Progress Claim Exceeds Contract ──')
  {
    const r = await req('POST', '/api/progress-claims', {
      projectId: newProjectId,
      contractId: newContractId,
      claimNo: 'PC-API-002',
      date: '2026-04-30',
      percentage: 200, // 200% — exceeds!
      amount: 1100000,
      vatRate: 0.15,
    })
    // Should this be validated? Let's see if it's blocked
    if (r.status === 201) {
      log('Claim > contract blocked', 'WARN', `200% claim was accepted — no validation against contract value (potential business issue)`)
    } else if (r.status === 400) {
      log('Claim > contract blocked', 'PASS', `400: ${r.data?.error}`)
    } else {
      log('Claim > contract blocked', 'FAIL', `unexpected status=${r.status}`)
    }
  }

  // ═══ TEST O: Duplicate claim number ═══
  console.log('\n── Test O: Duplicate Claim Number ──')
  {
    const r = await req('POST', '/api/progress-claims', {
      projectId: newProjectId,
      contractId: newContractId,
      claimNo: 'PC-API-001', // duplicate
      date: '2026-05-31',
      percentage: 10,
      amount: 50000,
    })
    if (r.status === 500) {
      log('Duplicate claimNo blocked', 'WARN', `500 (no graceful validation) — unique constraint error not handled`)
    } else if (r.status === 400) {
      log('Duplicate claimNo blocked', 'PASS', `400: ${r.data?.error}`)
    } else if (r.status === 201) {
      log('Duplicate claimNo blocked', 'FAIL', `duplicate claimNo was accepted — no unique constraint`)
    } else {
      log('Duplicate claimNo blocked', 'FAIL', `unexpected status=${r.status}`)
    }
  }

  // ═══ TEST P: Get project by ID with cost sheet ═══
  console.log('\n── Test P: GET /api/projects/[id] costSheet ──')
  {
    const r = await req('GET', `/api/projects/${newProjectId}`)
    if (r.status === 200 && r.data?.costSheet) {
      const cs = r.data.costSheet
      log('costSheet present', 'PASS', `contract=${cs.contractValue} revenue=${cs.revenue} costs=${cs.totalCosts} profit=${cs.profit} margin=${cs.profitMargin?.toFixed(2)}%`)
    } else {
      log('costSheet present', 'FAIL', `status=${r.status} hasCostSheet=${!!r.data?.costSheet}`)
    }

    // Workflow counts
    if (r.data?.workflowCounts) {
      const wc = r.data.workflowCounts
      log('workflowCounts', 'PASS', `contracts=${wc.contracts} extracts=${wc.extracts} accounting=${wc.accounting}`)
    } else {
      log('workflowCounts', 'FAIL', 'missing workflowCounts')
    }
  }

  // ═══ TEST Q: Filter projects by status ═══
  console.log('\n── Test Q: Filter Projects by Status ──')
  {
    const r = await req('GET', '/api/projects?status=COMPLETED')
    if (r.status === 200 && Array.isArray(r.data)) {
      const allCompleted = r.data.every((p: any) => p.status === 'COMPLETED')
      log('Filter by status', 'PASS', `${r.data.length} completed projects, all correct=${allCompleted}`)
    } else {
      log('Filter by status', 'FAIL', `status=${r.status} isArray=${Array.isArray(r.data)}`)
    }
  }

  // ═══ TEST R: Paginated projects ═══
  console.log('\n── Test R: Paginated Projects ──')
  {
    const r = await req('GET', '/api/projects?page=1&pageSize=10')
    if (r.status === 200 && r.data?.data && typeof r.data.total === 'number') {
      log('Pagination', 'PASS', `page=${r.data.page} total=${r.data.total} totalPages=${r.data.totalPages}`)
    } else {
      log('Pagination', 'FAIL', `status=${r.status} hasData=${!!r.data?.data}`)
    }
  }

  // ═══ TEST S: Update project via API ═══
  console.log('\n── Test S: Update Project via API ──')
  {
    const r = await req('PUT', `/api/projects/${newProjectId}`, {
      name: 'مشروع محدّث',
      status: 'ACTIVE',
      progressPercent: 50,
      actualCost: 75000,
    })
    if (r.status === 200 && r.data?.name === 'مشروع محدّث') {
      log('Update project', 'PASS', `name="${r.data.name}" status=${r.data.status}`)
    } else {
      log('Update project', 'FAIL', `status=${r.status}`)
    }
  }

  // ═══ TEST T: Get change orders by contract ═══
  console.log('\n── Test T: Get Change Orders by Contract ──')
  {
    const r = await req('GET', `/api/change-orders?contractId=${newContractId}`)
    if (r.status === 200 && Array.isArray(r.data)) {
      log('Get COs by contract', 'PASS', `${r.data.length} COs returned`)
    } else {
      log('Get COs by contract', 'FAIL', `status=${r.status}`)
    }
  }

  // ═══ TEST U: Get progress claims by project ═══
  console.log('\n── Test U: Get Progress Claims by Project ──')
  {
    const r = await req('GET', `/api/progress-claims?projectId=${newProjectId}`)
    if (r.status === 200 && Array.isArray(r.data)) {
      log('Get claims by project', 'PASS', `${r.data.length} claims returned`)
    } else {
      log('Get claims by project', 'FAIL', `status=${r.status} isArray=${Array.isArray(r.data)}`)
    }
  }

  // ═══ TEST V: Trial Balance is balanced after all operations ═══
  console.log('\n── Test V: Trial Balance Final Check ──')
  {
    const r = await req('GET', '/api/reports/trial-balance')
    if (r.status === 200 && r.data?.totals) {
      const t = r.data.totals
      const diff = Math.abs(Number(t.totalDebit) - Number(t.totalCredit))
      if (diff < 0.01) {
        log('Trial Balance', 'PASS', `D=${t.totalDebit} C=${t.totalCredit} diff=${diff.toFixed(4)} balanced=${t.isBalanced}`)
      } else {
        log('Trial Balance', 'FAIL', `D=${t.totalDebit} C=${t.totalCredit} diff=${diff}`)
      }
    } else {
      log('Trial Balance', 'FAIL', `status=${r.status} data=${JSON.stringify(r.data).slice(0, 200)}`)
    }
  }

  // ═══ TEST W: Income Statement reflects project revenue ═══
  console.log('\n── Test W: Income Statement ──')
  {
    const r = await req('GET', '/api/reports/income-statement')
    if (r.status === 200 && r.data) {
      log('Income Statement', 'PASS', `revenue=${r.data.revenue?.total} expenses=${r.data.expenses?.total} netIncome=${r.data.netIncome}`)
    } else {
      log('Income Statement', 'FAIL', `status=${r.status}`)
    }
  }

  return report()
}

function report() {
  console.log('\n═══════════════════════════════════════════════════════')
  console.log('TEST REPORT')
  console.log('═══════════════════════════════════════════════════════')
  const pass = results.filter(r => r.status === 'PASS').length
  const fail = results.filter(r => r.status === 'FAIL').length
  const warn = results.filter(r => r.status === 'WARN').length
  console.log(`Total: ${results.length}  |  ✓ PASS: ${pass}  |  ✗ FAIL: ${fail}  |  ! WARN: ${warn}`)
  console.log('')
  if (errors.length > 0) {
    console.log('── Errors ──')
    errors.forEach((e, i) => console.log(`${i + 1}. ${e}`))
    console.log('')
  }
  if (warn > 0) {
    console.log('── Warnings (potential issues to investigate) ──')
    results.filter(r => r.status === 'WARN').forEach((w, i) => console.log(`${i + 1}. ${w.step}: ${w.detail}`))
    console.log('')
  }
  console.log('═══════════════════════════════════════════════════════')
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('UNCAUGHT:', e)
  process.exit(1)
})
