// ============================================================================
// نظام بِنَاء ERP - محرك IFRS 15 (Percentage of Completion)
// Binaa ERP - IFRS 15 Revenue Recognition Engine (Phase 2-A)
// ============================================================================
// يطبّق طريقة Cost-to-Cost للاعتراف بالإيراد وفق IFRS 15:
//   POC = Total Actual Cost / Total Estimated Cost
//   Revenue To Date = POC × Contract Value
//   Period Revenue = Revenue To Date - Previously Recognized Revenue
// ============================================================================

import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

type TxClient = Prisma.TransactionClient | typeof db

/**
 * يحسب نسبة الإنجاز الفعلية بطريقة Cost-to-Cost
 */
export async function calculatePOC(
  projectId: string,
  asOfDate: Date = new Date(),
  tx?: TxClient
): Promise<{
  totalActualCost: number
  totalEstimatedCost: number
  estimatedCostToComplete: number
  percentComplete: number
  contractValue: number
  revenueToDate: number
  grossProfitToDate: number
  grossProfitPercent: number
}> {
  const client = tx ?? db

  // 1) احصل على بيانات المشروع والعقد
  const project = await client.project.findUnique({
    where: { id: projectId },
    include: { contracts: { take: 1, orderBy: { date: 'desc' } } },
  })
  if (!project) throw new Error(`Project ${projectId} not found`)

  const contractValue = Number(project.contractValue || 0)
  // Try estimatedTotalCost first, then contract value, then sum of BOQ
  let totalEstimatedCost = Number(project.estimatedTotalCost || 0) ||
    Number(project.contracts?.[0]?.value || 0)

  // If still zero, try BOQ total
  if (totalEstimatedCost <= 0) {
    try {
      const boqAgg = await client.bOQItem.aggregate({
        where: { projectId },
        _sum: { totalPrice: true },
      })
      totalEstimatedCost = Number(boqAgg._sum.totalPrice || 0)
    } catch { /* ignore */ }
  }

  // Final fallback: assume 80% of contract value (typical profit margin)
  if (totalEstimatedCost <= 0 && contractValue > 0) {
    totalEstimatedCost = contractValue * 0.8
  }

  if (totalEstimatedCost <= 0) {
    // Return zeros instead of throwing — for projects without budget
    return {
      totalActualCost: 0,
      totalEstimatedCost: 0,
      estimatedCostToComplete: 0,
      percentComplete: 0,
      contractValue,
      revenueToDate: 0,
      grossProfitToDate: 0,
      grossProfitPercent: 0,
    }
  }

  // 2) احسب AC (Actual Cost) من CostEntry (غير committed)
  let totalActualCost = 0
  try {
    const actualCosts = await client.costEntry.aggregate({
      where: {
        projectId,
        date: { lte: asOfDate },
        isCommitted: false,
      },
      _sum: { amount: true },
    })
    totalActualCost = Number(actualCosts._sum.amount || 0)
  } catch {
    // CostEntry table might be empty — fallback to legacy sources
  }

  // Fallback: aggregate from legacy sources
  if (totalActualCost === 0) {
    const [expenses, laborCosts, subInvoices, equipmentCosts] = await Promise.all([
      client.expense.aggregate({
        where: { projectId, date: { lte: asOfDate } },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: 0 } })),
      client.laborCost.aggregate({
        where: { projectId, date: { lte: asOfDate } },
        _sum: { totalAmount: true },
      }).catch(() => ({ _sum: { totalAmount: 0 } })),
      client.subcontractorInvoice.aggregate({
        where: { projectId, date: { lte: asOfDate } },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: 0 } })),
      client.equipmentCost.aggregate({
        where: { projectId, date: { lte: asOfDate } },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: 0 } })),
    ])
    totalActualCost =
      Number(expenses._sum.amount || 0) +
      Number(laborCosts._sum.totalAmount || 0) +
      Number(subInvoices._sum.amount || 0) +
      Number(equipmentCosts._sum.amount || 0)
  }

  // 3) POC clamped to [0, 1]
  const percentComplete = Math.max(0, Math.min(1, totalActualCost / totalEstimatedCost))

  // 4) Revenue recognition
  const revenueToDate = percentComplete * contractValue
  const grossProfitToDate = revenueToDate - totalActualCost
  const grossProfitPercent = revenueToDate > 0 ? (grossProfitToDate / revenueToDate) * 100 : 0
  const estimatedCostToComplete = totalEstimatedCost - totalActualCost

  return {
    totalActualCost,
    totalEstimatedCost,
    estimatedCostToComplete,
    percentComplete,
    contractValue,
    revenueToDate,
    grossProfitToDate,
    grossProfitPercent,
  }
}

/**
 * يحسب الإيراد المعترف به للفترة
 * Period Revenue = Revenue To Date - Previously Recognized Revenue
 */
export async function calculatePeriodRevenue(
  projectId: string,
  asOfDate: Date = new Date(),
  tx?: TxClient
): Promise<{
  revenueToDate: number
  previouslyRecognizedRevenue: number
  periodRevenue: number
  periodCost: number
  periodGrossProfit: number
  percentComplete: number
}> {
  const client = tx ?? db
  const poc = await calculatePOC(projectId, asOfDate, client)
  const revenueToDate = poc.revenueToDate

  // Previously recognized revenue = sum of all UNBILLED_REVENUE credits on this project
  let previouslyRecognizedRevenue = 0
  try {
    const recognized = await client.journalLine.aggregate({
      where: {
        deletedAt: null,
        journalEntry: {
          status: 'POSTED',
          deletedAt: null,
          sourceType: 'IFRS15_REVENUE',
          sourceId: projectId,
        },
      },
      _sum: { credit: true },
    })
    previouslyRecognizedRevenue = Number(recognized._sum.credit || 0)
  } catch {
    // ignore
  }

  const periodRevenue = Math.max(0, revenueToDate - previouslyRecognizedRevenue)
  const periodCost = poc.totalActualCost // simplified
  const periodGrossProfit = periodRevenue - periodCost

  return {
    revenueToDate,
    previouslyRecognizedRevenue,
    periodRevenue,
    periodCost,
    periodGrossProfit,
    percentComplete: poc.percentComplete,
  }
}

/**
 * ينشئ قيد إيراد IFRS 15 للفترة
 * مدين: CONTRACT_ASSET (الإيراد المعترف به للفترة)
 * دائن: UNBILLED_REVENUE
 */
export async function autoEntryIFRS15Revenue(
  projectId: string,
  asOfDate: Date = new Date(),
  tx?: TxClient
): Promise<{ journalEntryId: string | null; periodRevenue: number; percentComplete: number }> {
  const client = tx ?? db
  const period = await calculatePeriodRevenue(projectId, asOfDate, client)

  if (period.periodRevenue <= 0) {
    return { journalEntryId: null, periodRevenue: 0, percentComplete: period.percentComplete }
  }

  // Lazy import to avoid circular dependency
  const { createJournalEntry } = await import('./engine')
  const { getAccountCodeByRole } = await import('../account-roles')

  const contractAssetCode = await getAccountCodeByRole('CONTRACT_ASSET', client) || '1310'
  const unbilledRevenueCode = await getAccountCodeByRole('UNBILLED_REVENUE', client) || '4210'

  const je = await createJournalEntry({
    entryNo: `IFRS15-${projectId.slice(-6)}-${asOfDate.getTime()}`,
    date: asOfDate,
    description: `اعتراف بإيراد IFRS 15 (POC ${(period.percentComplete * 100).toFixed(2)}%)`,
    descriptionAr: `اعتراف بإيراد IFRS 15 (POC ${(period.percentComplete * 100).toFixed(2)}%)`,
    sourceType: 'IFRS15_REVENUE',
    sourceId: projectId,
    lines: [
      { accountCode: contractAssetCode, debit: period.periodRevenue, credit: 0, description: 'أصل العقد — إيراد معترف به' },
      { accountCode: unbilledRevenueCode, debit: 0, credit: period.periodRevenue, description: 'إيراد غير مفوتر' },
    ],
  } as any, client as any)

  return {
    journalEntryId: je?.id || null,
    periodRevenue: period.periodRevenue,
    percentComplete: period.percentComplete,
  }
}
