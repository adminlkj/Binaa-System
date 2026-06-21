import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { NextResponse } from 'next/server'
import { calculateVatForQuarter } from '@/lib/vat-calc'
import {
  autoEntryVATDeclaration,
  autoEntryVATPayment,
  reverseEntry,
  type PrismaTransaction,
} from '@/lib/accounting/engine'

// ============ GET: List VAT returns with optional breakdown ============
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const yearParam = searchParams.get('year')
    const quarterParam = searchParams.get('quarter')

    const where: Record<string, unknown> = {}

    if (yearParam) {
      where.year = parseInt(yearParam)
    }
    if (quarterParam) {
      where.quarter = parseInt(quarterParam)
    }

    const vatReturns = await db.vATReturn.findMany({
      where,
      orderBy: [{ year: 'desc' }, { quarter: 'desc' }, { createdAt: 'desc' }],
    })

    // If a specific year+quarter is requested, also return the breakdown data
    if (yearParam && quarterParam) {
      const year = parseInt(yearParam)
      const quarter = parseInt(quarterParam)

      // احسب الأرقام الحية من العمليات الخاضعة للضريبة
      const calc = await calculateVatForQuarter(year, quarter)

      // أوجد الإقرار النشط لهذه الفترة (إن وُجد) - الأحدث الذي ليس CANCELLED
      const activeDeclaration = vatReturns.find(v => v.status !== 'CANCELLED') || null

      return NextResponse.json(serializeDecimal({
        declaration: activeDeclaration,
        allDeclarationsForPeriod: vatReturns, // كل الإقرارات بما فيها الملغاة
        autoCalc: {
          outputVat: calc.outputVat,
          inputVat: calc.inputVat,
          netVat: calc.netVat,
          totalSales: calc.totalSales,
          totalPurchases: calc.totalPurchases,
          glOutputVat: calc.glOutputVat,
          glInputVat: calc.glInputVat,
          glMatch: calc.glMatch,
          glDiffOutput: calc.glDiffOutput,
          glDiffInput: calc.glDiffInput,
        },
        categories: calc.categories,
        breakdown: {
          salesInvoices: calc.salesInvoices,
          progressClaims: calc.progressClaims,
          purchaseInvoices: calc.purchaseInvoices,
          subcontractorInvoices: calc.subcontractorInvoices,
          expenses: calc.expenses,
        },
      }))
    }

    return NextResponse.json(serializeDecimal(vatReturns))
  } catch (error) {
    console.error('Error fetching VAT returns:', error)
    return NextResponse.json({ error: 'فشل في تحميل إقرارات الضريبة' }, { status: 500 })
  }
}

// ============ POST: Create a new VAT return ============
// ينشئ الإقرار كلقط مجمّد، مع تصنيف الأرقام حسب معايير هيئة الزكاة والضريبة،
// والتحقق من المطابقة مع دفتر اليومية. يسمح بإنشاء إقرار جديد للفترة إذا كان
// الإقرار السابق ملغياً.
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const year = parseInt(body.year)
    const quarter = parseInt(body.quarter)

    if (!year || !quarter || quarter < 1 || quarter > 4) {
      return NextResponse.json(
        { error: 'يرجى تحديد السنة والربع بشكل صحيح' },
        { status: 400 }
      )
    }

    const period = `${year}-Q${quarter}`

    // تحقق من عدم وجود إقرار نشط (غير ملغى) لهذه الفترة
    const existingActive = await db.vATReturn.findFirst({
      where: {
        period,
        status: { not: 'CANCELLED' },
      },
    })
    if (existingActive) {
      return NextResponse.json(
        {
          error: 'يوجد إقرار نشط لهذه الفترة بالفعل. يجب إلغاؤه أولاً قبل إنشاء إقرار جديد.',
          existingId: existingActive.id,
          existingStatus: existingActive.status,
        },
        { status: 409 }
      )
    }

    // احسب الأرقام من العمليات الخاضعة للضريبة
    const calc = await calculateVatForQuarter(year, quarter)

    // هل يوجد إقرار ملغى لنفس الفترة؟ (لتعليم الجديد كتعديل)
    const cancelledForPeriod = await db.vATReturn.findFirst({
      where: { period, status: 'CANCELLED' },
      orderBy: { createdAt: 'desc' },
    })

    // أنشئ الإقرار كلقطط مجمّد
    const vatReturn = await db.vATReturn.create({
      data: {
        period,
        year,
        quarter,
        // الإجماليات
        totalSales: calc.totalSales,
        outputVat: calc.outputVat,
        totalPurchases: calc.totalPurchases,
        inputVat: calc.inputVat,
        netVat: calc.netVat,
        // تصنيف المبيعات
        standardRatedSales: calc.categories.standardRatedSales,
        zeroRatedSales: calc.categories.zeroRatedSales,
        exemptSales: calc.categories.exemptSales,
        standardRatedSalesVat: calc.categories.standardRatedSalesVat,
        // تصنيف المشتريات
        standardRatedPurchases: calc.categories.standardRatedPurchases,
        zeroRatedPurchases: calc.categories.zeroRatedPurchases,
        exemptPurchases: calc.categories.exemptPurchases,
        importsSubjectToVAT: calc.categories.importsSubjectToVAT,
        standardRatedPurchasesVat: calc.categories.standardRatedPurchasesVat,
        // التحقق من دفتر اليومية
        glOutputVat: calc.glOutputVat,
        glInputVat: calc.glInputVat,
        glMatch: calc.glMatch,
        // قوائم المعرفات
        salesInvoiceIds: JSON.stringify(calc.salesInvoiceIds),
        purchaseInvoiceIds: JSON.stringify(calc.purchaseInvoiceIds),
        expenseIds: JSON.stringify(calc.expenseIds),
        subcontractorInvoiceIds: JSON.stringify(calc.subcontractorInvoiceIds),
        progressClaimIds: JSON.stringify(calc.progressClaimIds),
        // الحالة والمتابعة
        status: 'DRAFT',
        isAmendment: !!cancelledForPeriod,
        amendedFromId: cancelledForPeriod?.id || null,
      },
    })

    return NextResponse.json(serializeDecimal({
      ...vatReturn,
      _meta: {
        message: 'تم إنشاء الإقرار الضريبي كلقطط مجمّد. الأرقام مجمّدة ولن تتغير.',
        salesInvoiceCount: calc.salesInvoices.length,
        progressClaimCount: calc.progressClaims.length,
        purchaseInvoiceCount: calc.purchaseInvoices.length,
        subcontractorInvoiceCount: calc.subcontractorInvoices.length,
        expenseCount: calc.expenses.length,
        glMatch: calc.glMatch,
        isAmendment: !!cancelledForPeriod,
      }
    }), { status: 201 })
  } catch (error) {
    console.error('Error creating VAT return:', error)
    return NextResponse.json(
      { error: 'فشل في إنشاء إقرار الضريبة' },
      { status: 500 }
    )
  }
}

// ============ PATCH: Status transitions + journal entries ============
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, action, paymentReference, paymentDate } = body

    if (!id) {
      return NextResponse.json(
        { error: 'يرجى تحديد الإقرار' },
        { status: 400 }
      )
    }

    const existing = await db.vATReturn.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'الإقرار غير موجود' },
        { status: 404 }
      )
    }

    // ===== FILE: DRAFT → FILED + إنشاء قيد الإقرار الضريبي =====
    if (action === 'FILE') {
      if (existing.status !== 'DRAFT') {
        return NextResponse.json(
          { error: 'لا يمكن تقديم إقرار ليس في حالة مسودة' },
          { status: 400 }
        )
      }

      // استخدم معاملة لضمان atomicity بين القيد والتحديث
      const vatReturn = await db.$transaction(async (tx: PrismaTransaction) => {
        // أنشئ قيد الإقرار الضريبي تلقائياً
        let journalEntryId: string | null = null
        try {
          const je = await autoEntryVATDeclaration({
            period: existing.period,
            outputVat: toNumber(existing.outputVat),
            inputVat: toNumber(existing.inputVat),
            netVat: toNumber(existing.netVat),
            date: new Date(),
          }, tx)
          journalEntryId = je.id
        } catch (e) {
          console.error('Failed to create VAT declaration journal entry:', e)
          // استمر بدون قيد - لا نمنع التقديم بسبب مشكلة محاسبية
        }

        return tx.vATReturn.update({
          where: { id },
          data: {
            status: 'FILED',
            filedDate: new Date(),
            journalEntryId,
          },
        })
      })

      return NextResponse.json(serializeDecimal(vatReturn))
    }

    // ===== PAY: FILED → PAID + إنشاء قيد سداد الضريبة =====
    if (action === 'PAY') {
      if (existing.status !== 'FILED') {
        return NextResponse.json(
          { error: 'لا يمكن تسجيل دفع لإقرار غير مقدم' },
          { status: 400 }
        )
      }

      if (!paymentReference) {
        return NextResponse.json(
          { error: 'رقم مرجع الدفع مطلوب' },
          { status: 400 }
        )
      }

      const amount = toNumber(existing.netVat)
      const vatReturn = await db.$transaction(async (tx: PrismaTransaction) => {
        // أنشئ قيد سداد الضريبة (إذا كان هناك مبلغ مستحق)
        let paymentJournalEntryId: string | null = null
        if (amount > 0) {
          try {
            const je = await autoEntryVATPayment({
              period: existing.period,
              amount,
              date: paymentDate ? new Date(paymentDate) : new Date(),
              reference: paymentReference,
            }, tx)
            paymentJournalEntryId = je.id
          } catch (e) {
            console.error('Failed to create VAT payment journal entry:', e)
          }
        }

        return tx.vATReturn.update({
          where: { id },
          data: {
            status: 'PAID',
            paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
            paymentReference,
            paymentJournalEntryId,
          },
        })
      })

      return NextResponse.json(serializeDecimal(vatReturn))
    }

    // ===== REVERSE: FILED/PAID → CANCELLED + عكس القيد =====
    if (action === 'REVERSE') {
      if (existing.status !== 'FILED' && existing.status !== 'PAID') {
        return NextResponse.json(
          { error: 'لا يمكن إلغاء إقرار ليس في حالة مُقر أو مدفوع' },
          { status: 400 }
        )
      }

      const reason = (body.reason as string) || 'إلغاء لإعادة الإنشاء'

      const vatReturn = await db.$transaction(async (tx: PrismaTransaction) => {
        // اعكس قيد الإقرار إن وُجد
        if (existing.journalEntryId) {
          try {
            await reverseEntry(existing.journalEntryId, tx)
          } catch (e) {
            console.error('Failed to reverse VAT declaration journal entry:', e)
          }
        }
        // اعكس قيد السداد إن وُجد
        if (existing.paymentJournalEntryId) {
          try {
            await reverseEntry(existing.paymentJournalEntryId, tx)
          } catch (e) {
            console.error('Failed to reverse VAT payment journal entry:', e)
          }
        }

        return tx.vATReturn.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelledReason: reason,
          },
        })
      })

      return NextResponse.json(serializeDecimal({
        ...vatReturn,
        _meta: {
          message: 'تم إلغاء الإقرار بنجاح. يمكنك الآن إنشاء إقرار جديد للفترة لإعادة الاحتساب.',
          canCreateNew: true,
        }
      }))
    }

    return NextResponse.json(
      { error: 'إجراء غير معروف. الإجراءات المتاحة: FILE, PAY, REVERSE' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error updating VAT return:', error)
    return NextResponse.json(
      { error: 'فشل في تحديث إقرار الضريبة' },
      { status: 500 }
    )
  }
}

// ============ DELETE: Discard a DRAFT VAT return ============
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'يرجى تحديد الإقرار' },
        { status: 400 }
      )
    }

    const existing = await db.vATReturn.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'الإقرار غير موجود' },
        { status: 404 }
      )
    }

    // يمكن حذف المسودات فقط (DRAFT). الإقرارات المُقدمة يجب إلغاؤها بدلاً من حذفها.
    if (existing.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'لا يمكن حذف إقرار مُقدم أو مدفوع. استخدم "إلغاء الإقرار" بدلاً من ذلك.' },
        { status: 400 }
      )
    }

    await db.vATReturn.delete({ where: { id } })

    return NextResponse.json({
      success: true,
      message: 'تم حذف مسودة الإقرار بنجاح',
    })
  } catch (error) {
    console.error('Error deleting VAT return:', error)
    return NextResponse.json(
      { error: 'فشل في حذف الإقرار' },
      { status: 500 }
    )
  }
}
