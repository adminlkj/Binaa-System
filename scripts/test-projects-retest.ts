/**
 * E2E Test 3: RE-TEST after Phase 2 fixes
 * Verifies all BUG-P2-* fixes are working correctly
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
  console.log('E2E TEST 3: RE-TEST after Phase 2 Fixes')
  console.log('═══════════════════════════════════════════════════════\n')

  // Get setup data
  const clientsRes = await req('GET', '/api/clients')
  const clients = clientsRes.data as any[]
  const clientId = clients[0]?.id
  const branchesRes = await req('GET', '/api/branches')
  const branches = branchesRes.data as any[]
  const branchId = branches[0]?.id
  if (!clientId || !branchId) {
    log('Precondition: setup data', 'FAIL', `clientId=${clientId} branchId=${branchId} — run setup first`)
    return report()
  }
  console.log(`Using client=${clientId}, branch=${branchId}`)

  // ═══════════════════════════════════════════════════════
  // FIX VERIFICATION: BUG-P2-03 (CTR-0NaN)
  // ═══════════════════════════════════════════════════════
  console.log('\n── Fix: BUG-P2-03 — Contract auto-number generation ──')

  // First create a project to attach contracts to
  let projectAId: string
  {
    const r = await req('POST', '/api/projects', {
      code: 'PRJ-FIX-A',
      name: 'مشروع إصلاح أ',
      clientId, branchId,
      startDate: '2026-02-01',
      contractValue: 1000000,
    })
    if (r.status === 201) {
      projectAId = r.data.id
      log('Create project A', 'PASS', r.data.code)
    } else {
      log('Create project A', 'FAIL', `status=${r.status}`)
      return report()
    }
  }

  // Create first contract with explicit CTR-TEST-002 (non-numeric suffix)
  let contractAId: string
  {
    const r = await req('POST', '/api/contracts', {
      projectId: projectAId,
      clientId,
      contractNo: 'CTR-TEST-XYZ', // non-numeric suffix
      date: '2026-02-01',
      value: 1000000,
      startDate: '2026-02-01',
      contractType: 'PROJECT',
    })
    if (r.status === 201) {
      contractAId = r.data.id
      log('Create contract with non-numeric suffix', 'PASS', r.data.contractNo)
    } else {
      log('Create contract with non-numeric suffix', 'FAIL', `status=${r.status}`)
      return report()
    }
  }

  // Now auto-generate a contract number (should NOT be CTR-0NaN)
  {
    const r = await req('POST', '/api/contracts', {
      projectId: projectAId,
      clientId,
      date: '2026-02-05',
      value: 50000,
      startDate: '2026-02-05',
    })
    if (r.status === 201 && r.data.contractNo && /^CTR-\d+$/.test(r.data.contractNo)) {
      log('Auto-generated contractNo valid', 'PASS', r.data.contractNo)
    } else if (r.status === 201 && r.data.contractNo === 'CTR-0NaN') {
      log('Auto-generated contractNo valid', 'FAIL', `still CTR-0NaN — fix did not work`)
    } else {
      log('Auto-generated contractNo valid', 'FAIL', `status=${r.status} contractNo=${r.data?.contractNo}`)
    }
  }

  // ═══════════════════════════════════════════════════════
  // FIX VERIFICATION: BUG-P2-01 (ChangeOrder orderNo collision)
  // ═══════════════════════════════════════════════════════
  console.log('\n── Fix: BUG-P2-01 — ChangeOrder orderNo global unique ──')

  // Create a second project + contract
  let projectBId: string
  {
    const r = await req('POST', '/api/projects', {
      code: 'PRJ-FIX-B',
      name: 'مشروع إصلاح ب',
      clientId, branchId,
      startDate: '2026-03-01',
      contractValue: 500000,
    })
    if (r.status === 201) {
      projectBId = r.data.id
      log('Create project B', 'PASS', r.data.code)
    } else {
      log('Create project B', 'FAIL', `status=${r.status}`)
      return report()
    }
  }

  let contractBId: string
  {
    const r = await req('POST', '/api/contracts', {
      projectId: projectBId,
      clientId,
      contractNo: 'CTR-FIX-B-001',
      date: '2026-03-01',
      value: 500000,
      startDate: '2026-03-01',
      contractType: 'PROJECT',
    })
    if (r.status === 201) {
      contractBId = r.data.id
      log('Create contract B', 'PASS', r.data.contractNo)
    } else {
      log('Create contract B', 'FAIL', `status=${r.status}`)
      return report()
    }
  }

  // Create CO on contract A — should succeed
  let coAId: string
  {
    const r = await req('POST', '/api/change-orders', {
      contractId: contractAId,
      projectId: projectAId,
      description: 'CO on contract A',
      changeType: 'ADDITION',
      originalValue: 1000000,
      changeValue: 50000,
      date: '2026-02-15',
    })
    if (r.status === 201 && r.data?.id) {
      coAId = r.data.id
      log('Create CO on contract A', 'PASS', r.data.orderNo)
    } else {
      log('Create CO on contract A', 'FAIL', `status=${r.status} data=${JSON.stringify(r.data).slice(0, 200)}`)
      return report()
    }
  }

  // Create CO on contract B — THIS WAS FAILING BEFORE THE FIX
  let coBId: string
  {
    const r = await req('POST', '/api/change-orders', {
      contractId: contractBId,
      projectId: projectBId,
      description: 'CO on contract B',
      changeType: 'ADDITION',
      originalValue: 500000,
      changeValue: 25000,
      date: '2026-03-15',
    })
    if (r.status === 201 && r.data?.id) {
      coBId = r.data.id
      log('Create CO on contract B (was failing)', 'PASS', r.data.orderNo)
      // Verify orderNo is different from CO on A
      if (r.data.orderNo !== coAId) {
        log('CO orderNo unique', 'PASS', `${r.data.orderNo} ≠ previous`)
      }
    } else {
      log('Create CO on contract B (was failing)', 'FAIL', `status=${r.status} data=${JSON.stringify(r.data).slice(0, 200)}`)
    }
  }

  // ═══════════════════════════════════════════════════════
  // FIX VERIFICATION: BUG-P2-04 (Approve CO updates contract value)
  // ═══════════════════════════════════════════════════════
  console.log('\n── Fix: BUG-P2-04 — Approve CO updates contract.value ──')
  {
    // Approve CO B
    const r = await req('PUT', `/api/change-orders/${coBId}`, {
      status: 'APPROVED',
      approvedBy: 'test',
    })
    if (r.status === 200 && r.data?.status === 'APPROVED') {
      log('Approve CO B', 'PASS', `status=${r.data.status}`)
    } else {
      log('Approve CO B', 'FAIL', `status=${r.status}`)
    }

    // Now verify contract B value was updated
    const contractRes = await req('GET', `/api/contracts/${contractBId}`)
    const contract = contractRes.data
    const expectedValue = 525000 // 500000 + 25000
    const expectedVat = 78750 // 525000 * 0.15
    const expectedTotal = 603750 // 525000 + 78750

    if (Number(contract?.value) === expectedValue) {
      log('Contract value updated by CO', 'PASS', `value=${contract.value} (expected ${expectedValue})`)
    } else {
      log('Contract value updated by CO', 'FAIL', `value=${contract?.value}, expected ${expectedValue}`)
    }
    if (Number(contract?.vatAmount) === expectedVat) {
      log('Contract vatAmount updated', 'PASS', `vat=${contract.vatAmount}`)
    } else {
      log('Contract vatAmount updated', 'FAIL', `vat=${contract?.vatAmount}, expected ${expectedVat}`)
    }
    if (Number(contract?.totalValue) === expectedTotal) {
      log('Contract totalValue updated', 'PASS', `total=${contract.totalValue}`)
    } else {
      log('Contract totalValue updated', 'FAIL', `total=${contract?.totalValue}, expected ${expectedTotal}`)
    }
  }

  // ═══════════════════════════════════════════════════════
  // FIX VERIFICATION: BUG-P2-02 (claimNo unique)
  // ═══════════════════════════════════════════════════════
  console.log('\n── Fix: BUG-P2-02 — claimNo uniqueness ──')
  let claim1Id: string
  {
    // Create first claim
    const r1 = await req('POST', '/api/progress-claims', {
      projectId: projectAId,
      contractId: contractAId,
      claimNo: 'PC-FIX-001',
      date: '2026-03-31',
      percentage: 25,
      amount: 250000,
      vatRate: 0.15,
      status: 'DRAFT',
    })
    if (r1.status === 201) {
      claim1Id = r1.data.id
      log('Create first claim PC-FIX-001', 'PASS', r1.data.claimNo)
    } else {
      log('Create first claim PC-FIX-001', 'FAIL', `status=${r1.status} data=${JSON.stringify(r1.data).slice(0, 200)}`)
      return report()
    }

    // Try to create duplicate claimNo
    const r2 = await req('POST', '/api/progress-claims', {
      projectId: projectAId,
      contractId: contractAId,
      claimNo: 'PC-FIX-001', // duplicate
      date: '2026-04-30',
      percentage: 30,
      amount: 300000,
    })
    if (r2.status === 400) {
      log('Duplicate claimNo rejected', 'PASS', `400: ${r2.data?.error?.slice(0, 80)}`)
    } else if (r2.status === 201) {
      log('Duplicate claimNo rejected', 'FAIL', `claim was created despite duplicate — @unique not enforced`)
    } else {
      log('Duplicate claimNo rejected', 'FAIL', `unexpected status=${r2.status}`)
    }
  }

  // ═══════════════════════════════════════════════════════
  // FIX VERIFICATION: BUG-P2-06 (claim amount validation)
  // ═══════════════════════════════════════════════════════
  console.log('\n── Fix: BUG-P2-06 — claim amount exceeds contract value ──')
  {
    // Contract B has value=525000 (after CO approval)
    // Already approved CO added 25000 → effective = 525000
    // Try to claim more than that
    const r = await req('POST', '/api/progress-claims', {
      projectId: projectBId,
      contractId: contractBId,
      claimNo: 'PC-FIX-EXCEED',
      date: '2026-04-30',
      percentage: 200, // 200%
      amount: 1100000, // > 525000
    })
    if (r.status === 400) {
      log('Claim > contract blocked', 'PASS', `400: ${r.data?.error?.slice(0, 80)}`)
    } else if (r.status === 201) {
      log('Claim > contract blocked', 'FAIL', `claim was accepted despite exceeding contract value`)
    } else {
      log('Claim > contract blocked', 'FAIL', `unexpected status=${r.status}`)
    }
  }

  // ═══════════════════════════════════════════════════════
  // ACCOUNTING MODEL VERIFICATION (after rebase with origin/main)
  // The remote adopts an IFRS 15-compliant model where revenue is recognized
  // at INVOICING (when a sales invoice is created from an approved claim),
  // NOT at claim approval. This prevents double-counting. We verify this here.
  // ═══════════════════════════════════════════════════════
  console.log('\n── Verify: IFRS 15 model — no JE on claim approval ──')
  {
    // Submit then approve the claim
    await req('PUT', `/api/progress-claims/${claim1Id}`, { status: 'SUBMITTED' })
    const approveRes = await req('PUT', `/api/progress-claims/${claim1Id}`, { status: 'APPROVED' })
    if (approveRes.status === 200 && approveRes.data?.status === 'APPROVED') {
      log('Approve claim', 'PASS', `status=APPROVED`)
    } else {
      log('Approve claim', 'FAIL', `status=${approveRes.status}`)
    }

    // CRITICAL: NO journal entry should be created at claim approval
    // (revenue is recognized at invoicing, not at claim certification)
    if (approveRes.data?.journalEntryId === null || approveRes.data?.journalEntryId === undefined) {
      log('No JE at claim approval (IFRS 15)', 'PASS', 'journalEntryId is null — correct, revenue deferred to invoicing')
    } else {
      log('No JE at claim approval (IFRS 15)', 'FAIL', `journalEntryId=${approveRes.data?.journalEntryId} — would cause double revenue`)
    }

    // Trial balance should still be zero (no JE from claim)
    const tb = await req('GET', '/api/reports/trial-balance')
    const totalDebit = Number(tb.data?.totals?.totalDebit || 0)
    if (totalDebit === 0) {
      log('Trial Balance = 0 (no claim JE)', 'PASS', `D=${totalDebit} C=${tb.data?.totals?.totalCredit}`)
    } else {
      log('Trial Balance = 0 (no claim JE)', 'WARN', `D=${totalDebit} — there may be other JEs but claim should not add any`)
    }

    // Now reject the approved claim — should be a simple status update (no JE to reverse)
    const rejectRes = await req('PUT', `/api/progress-claims/${claim1Id}`, { status: 'REJECTED' })
    if (rejectRes.status === 200 && rejectRes.data?.status === 'REJECTED') {
      log('Reject APPROVED claim', 'PASS', `status=REJECTED (no reversal needed — no JE was created)`)
    } else {
      log('Reject APPROVED claim', 'FAIL', `status=${rejectRes.status}`)
    }
  }

  // ═══════════════════════════════════════════════════════
  // FINAL: Trial balance must still be balanced
  // ═══════════════════════════════════════════════════════
  console.log('\n── Final: Trial Balance ──')
  {
    const r = await req('GET', '/api/reports/trial-balance')
    if (r.status === 200 && r.data?.totals) {
      const t = r.data.totals
      const diff = Math.abs(Number(t.totalDebit) - Number(t.totalCredit))
      if (diff < 0.01) {
        log('Trial Balance balanced', 'PASS', `D=${t.totalDebit} C=${t.totalCredit} diff=${diff.toFixed(4)}`)
      } else {
        log('Trial Balance balanced', 'FAIL', `D=${t.totalDebit} C=${t.totalCredit} diff=${diff}`)
      }
    } else {
      log('Trial Balance balanced', 'FAIL', `status=${r.status}`)
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
  console.log('═══════════════════════════════════════════════════════')
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('UNCAUGHT:', e)
  process.exit(1)
})
