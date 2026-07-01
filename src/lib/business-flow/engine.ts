// ============================================================================
// محرك سير العمل - Business Flow Engine
// نظام بِنَاء ERP - Binaa Construction ERP
//
// Enforces workflow chains and connects all modules through two hub centers:
// Construction Projects and Equipment Rental.
//
// Workflow chains are strict — no steps can be skipped.
// Every record knows which activity (EXECUTION, RENTAL, GENERAL) it belongs to.
// Cost flow engine routes costs to the correct hub automatically.
// Profitability calculator computes margin for each hub.
// ============================================================================

import { db } from '@/lib/db'

// ============ ACTIVITY TYPE DEFINITIONS ============

/**
 * ActivityType - Every record in the system must know which activity it belongs to.
 * EXECUTION: Construction Projects (مشاريع تنفيذية)
 * RENTAL: Equipment Rental (تأجير المعدات)
 * GENERAL: Both/Shared (مشترك)
 */
export const ActivityType = {
  EXECUTION: 'EXECUTION',
  RENTAL: 'RENTAL',
  GENERAL: 'GENERAL',
} as const

export type ActivityTypeValue = (typeof ActivityType)[keyof typeof ActivityType]

// ============ WORKFLOW STEP DEFINITIONS ============

export interface WorkflowStep {
  key: string
  labelEn: string
  labelAr: string
  description: string
  order: number
}

// ============ WORKFLOW CHAIN DEFINITIONS ============

/**
 * Construction Workflow (no skipping):
 * Client → Project → Contract → BOQ → Work Hours → Expenses →
 * Subcontractors → Purchases → Extract → Client Invoice → Collection → Journal Entry
 */
export const CONSTRUCTION_WORKFLOW: WorkflowStep[] = [
  { key: 'CLIENT', labelEn: 'Client', labelAr: 'العميل', description: 'Client registration', order: 1 },
  { key: 'PROJECT', labelEn: 'Project', labelAr: 'المشروع', description: 'Project creation', order: 2 },
  { key: 'CONTRACT', labelEn: 'Contract', labelAr: 'العقد', description: 'Contract setup', order: 3 },
  { key: 'BOQ', labelEn: 'BOQ', labelAr: 'جدول الكميات', description: 'Bill of Quantities', order: 4 },
  { key: 'WORK_HOURS', labelEn: 'Work Hours', labelAr: 'ساعات العمل', description: 'Labor & work hours tracking', order: 5 },
  { key: 'EXPENSES', labelEn: 'Expenses', labelAr: 'المصروفات', description: 'Project expenses', order: 6 },
  { key: 'SUBCONTRACTORS', labelEn: 'Subcontractors', labelAr: 'مقاولو الباطن', description: 'Subcontractor invoices', order: 7 },
  { key: 'PURCHASES', labelEn: 'Purchases', labelAr: 'المشتريات', description: 'Purchase workflow (PR→PO→GR→Invoice)', order: 8 },
  { key: 'EXTRACT', labelEn: 'Extract', labelAr: 'المستخلص', description: 'Progress claim / extract', order: 9 },
  { key: 'CLIENT_INVOICE', labelEn: 'Client Invoice', labelAr: 'فاتورة العميل', description: 'Sales invoice to client', order: 10 },
  { key: 'COLLECTION', labelEn: 'Collection', labelAr: 'التحصيل', description: 'Client payment collection', order: 11 },
  { key: 'JOURNAL_ENTRY', labelEn: 'Journal Entry', labelAr: 'قيد يومية', description: 'Auto journal entry', order: 12 },
]

/**
 * Rental Workflow (no skipping):
 * Client → Rental Contract → Sales Order → Delivery Order →
 * Time Sheet → Rental Invoice → Collection → Journal Entry
 */
export const RENTAL_WORKFLOW: WorkflowStep[] = [
  { key: 'CLIENT', labelEn: 'Client', labelAr: 'العميل', description: 'Client registration', order: 1 },
  { key: 'RENTAL_CONTRACT', labelEn: 'Rental Contract', labelAr: 'عقد التأجير', description: 'Rental contract setup', order: 2 },
  { key: 'SALES_ORDER', labelEn: 'Sales Order', labelAr: 'أمر البيع', description: 'Sales order creation', order: 3 },
  { key: 'DELIVERY_ORDER', labelEn: 'Delivery Order', labelAr: 'أمر التوريد', description: 'Equipment delivery order', order: 4 },
  { key: 'TIME_SHEET', labelEn: 'Time Sheet', labelAr: 'تايم شيت', description: 'Equipment timesheet', order: 5 },
  { key: 'RENTAL_INVOICE', labelEn: 'Rental Invoice', labelAr: 'فاتورة التأجير', description: 'Rental invoice to client', order: 6 },
  { key: 'COLLECTION', labelEn: 'Collection', labelAr: 'التحصيل', description: 'Client payment collection', order: 7 },
  { key: 'JOURNAL_ENTRY', labelEn: 'Journal Entry', labelAr: 'قيد يومية', description: 'Auto journal entry', order: 8 },
]

/**
 * Purchase Workflow (no skipping):
 * Purchase Request → Purchase Order → Goods Receipt →
 * Supplier Invoice → Payment → Journal Entry
 */
export const PURCHASE_WORKFLOW: WorkflowStep[] = [
  { key: 'PURCHASE_REQUEST', labelEn: 'Purchase Request', labelAr: 'طلب الشراء', description: 'Purchase request creation', order: 1 },
  { key: 'PURCHASE_ORDER', labelEn: 'Purchase Order', labelAr: 'أمر الشراء', description: 'Purchase order approval', order: 2 },
  { key: 'GOODS_RECEIPT', labelEn: 'Goods Receipt', labelAr: 'إيصال الاستلام', description: 'Goods receipt verification', order: 3 },
  { key: 'SUPPLIER_INVOICE', labelEn: 'Supplier Invoice', labelAr: 'فاتورة المورد', description: 'Supplier invoice', order: 4 },
  { key: 'PAYMENT', labelEn: 'Payment', labelAr: 'الدفعة', description: 'Supplier payment', order: 5 },
  { key: 'JOURNAL_ENTRY', labelEn: 'Journal Entry', labelAr: 'قيد يومية', description: 'Auto journal entry', order: 6 },
]

// ============ VALIDATION RESULT TYPES ============

export interface ValidationResult {
  valid: boolean
  message: string
  messageAr: string
  missing: string[]
  currentStep?: string
  requiredStep?: string
}

// ============ PROFITABILITY TYPES ============

export interface CostBreakdown {
  materials: number
  labor: number
  subcontractors: number
  equipment: number
  fuel: number
  maintenance: number
  expenses: number
  purchases: number
  other: number
}

export interface ProfitabilityResult {
  revenue: number
  costs: CostBreakdown
  totalCosts: number
  profit: number
  margin: number  // percentage: (profit / revenue) * 100
  currency: string
}

export interface EquipmentProfitabilityResult {
  revenue: number
  costs: {
    fuel: number
    maintenance: number
    operations: number
    depreciation: number
    other: number
  }
  totalCosts: number
  profit: number
  margin: number
  currency: string
  totalOperatingHours: number
  hourlyProfit: number
}

// ============ COST FLOW DESTINATION TYPES ============

export const CostDestination = {
  PROJECT_COST: 'PROJECT_COST',
  EQUIPMENT_COST: 'EQUIPMENT_COST',
  OPERATING_COST: 'OPERATING_COST',
} as const

export type CostDestinationValue = (typeof CostDestination)[keyof typeof CostDestination]

export interface CostRoutingResult {
  destination: CostDestinationValue
  activityType: ActivityTypeValue
  targetId: string    // projectId or equipmentId
  targetName: string
  accountCode: string
  description: string
  descriptionAr: string
}

// ============ WORKFLOW VALIDATION FUNCTIONS ============

/**
 * canCreateExtract - Validates project has contract and BOQ
 * Required steps before creating an extract (progress claim):
 * - Project must exist
 * - Contract must exist (ACTIVE or DRAFT)
 * - BOQ must have at least one item
 */
export async function canCreateExtract(projectId: string): Promise<ValidationResult> {
  const missing: string[] = []

  // Check project exists
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      contracts: true,
      boqItems: true,
    },
  })

  if (!project) {
    return {
      valid: false,
      message: 'Project not found',
      messageAr: 'المشروع غير موجود',
      missing: ['PROJECT'],
    }
  }

  // Check client exists
  const client = await db.client.findUnique({ where: { id: project.clientId } })
  if (!client) {
    missing.push('CLIENT')
  }

  // Check contract exists
  const activeContract = project.contracts.find(
    (c) => c.status === 'ACTIVE' || c.status === 'DRAFT'
  )
  if (!activeContract) {
    missing.push('CONTRACT')
  }

  // Check BOQ items exist
  if (project.boqItems.length === 0) {
    missing.push('BOQ')
  }

  if (missing.length > 0) {
    const missingLabels = missing.map((key) => {
      const step = CONSTRUCTION_WORKFLOW.find((s) => s.key === key)
      return step ? `${step.labelEn} (${step.labelAr})` : key
    })

    return {
      valid: false,
      message: `Missing prerequisites: ${missingLabels.join(', ')}`,
      messageAr: `متطلبات مفقودة: ${missingLabels.join('، ')}`,
      missing,
      requiredStep: 'EXTRACT',
    }
  }

  return {
    valid: true,
    message: 'Project has all prerequisites for creating an extract',
    messageAr: 'المشروع يمتلك جميع المتطلبات لإنشاء مستخلص',
    missing: [],
    currentStep: 'EXTRACT',
  }
}

/**
 * canCreateInvoice - Validates extract/timesheet exists before invoice
 * sourceType: 'EXTRACT' or 'TIMESHEET'
 * sourceId: progressClaimId or timesheetId
 */
export async function canCreateInvoice(
  sourceType: string,
  sourceId: string
): Promise<ValidationResult> {
  const missing: string[] = []

  if (sourceType === 'EXTRACT') {
    // Verify progress claim exists and is approved
    const claim = await db.progressClaim.findUnique({
      where: { id: sourceId },
      include: { project: true, contract: true },
    })

    if (!claim) {
      return {
        valid: false,
        message: 'Progress claim not found',
        messageAr: 'المستخلص غير موجود',
        missing: ['EXTRACT'],
        requiredStep: 'CLIENT_INVOICE',
      }
    }

    if (claim.status !== 'APPROVED') {
      missing.push('EXTRACT_APPROVAL')
      return {
        valid: false,
        message: `Progress claim status is ${claim.status}, must be APPROVED`,
        messageAr: `حالة المستخلص ${claim.status}، يجب أن تكون معتمدة`,
        missing,
        currentStep: 'EXTRACT',
        requiredStep: 'CLIENT_INVOICE',
      }
    }

    if (claim.invoiced) {
      return {
        valid: false,
        message: 'This progress claim has already been invoiced',
        messageAr: 'هذا المستخلص تم إصدار فاتورة له مسبقاً',
        missing: [],
      }
    }

    return {
      valid: true,
      message: 'Progress claim is approved and ready for invoicing',
      messageAr: 'المستخلص معتمد وجاهز لإصدار الفاتورة',
      missing: [],
      currentStep: 'CLIENT_INVOICE',
    }
  }

  if (sourceType === 'TIMESHEET') {
    // Verify timesheet exists and is approved
    const timesheet = await db.timesheet.findUnique({
      where: { id: sourceId },
      include: {
        rental: { include: { contract: true } },
        project: true,
        equipment: true,
      },
    })

    if (!timesheet) {
      return {
        valid: false,
        message: 'Timesheet not found',
        messageAr: 'تايم شيت غير موجود',
        missing: ['TIME_SHEET'],
        requiredStep: 'RENTAL_INVOICE',
      }
    }

    if (timesheet.status !== 'APPROVED') {
      missing.push('TIMESHEET_APPROVAL')
      return {
        valid: false,
        message: `Timesheet status is ${timesheet.status}, must be APPROVED`,
        messageAr: `حالة التايم شيت ${timesheet.status}، يجب أن تكون معتمدة`,
        missing,
        currentStep: 'TIME_SHEET',
        requiredStep: 'RENTAL_INVOICE',
      }
    }

    // Check if already invoiced
    const existingInvoice = await db.salesInvoice.findFirst({
      where: { timesheetId: sourceId },
    })
    if (existingInvoice) {
      return {
        valid: false,
        message: 'This timesheet has already been invoiced',
        messageAr: 'هذا التايم شيت تم إصدار فاتورة له مسبقاً',
        missing: [],
      }
    }

    return {
      valid: true,
      message: 'Timesheet is approved and ready for invoicing',
      messageAr: 'التايم شيت معتمد وجاهز لإصدار الفاتورة',
      missing: [],
      currentStep: 'RENTAL_INVOICE',
    }
  }

  return {
    valid: false,
    message: `Unknown source type: ${sourceType}`,
    messageAr: `نوع مصدر غير معروف: ${sourceType}`,
    missing: [],
  }
}

/**
 * canCreateTimesheet - Validates rental contract has delivery order
 */
export async function canCreateTimesheet(rentalId: string): Promise<ValidationResult> {
  const rental = await db.equipmentRental.findUnique({
    where: { id: rentalId },
    include: {
      contract: true,
      deliveryOrders: true,
      equipment: true,
      client: true,
    },
  })

  if (!rental) {
    return {
      valid: false,
      message: 'Rental contract not found',
      messageAr: 'عقد التأجير غير موجود',
      missing: ['RENTAL_CONTRACT'],
      requiredStep: 'TIME_SHEET',
    }
  }

  const missing: string[] = []

  // Check client
  if (!rental.clientId) {
    missing.push('CLIENT')
  }

  // Check delivery order exists
  const deliveredOrders = rental.deliveryOrders.filter(
    (d) => d.status === 'DELIVERED' || d.status === 'PENDING'
  )
  if (deliveredOrders.length === 0) {
    missing.push('DELIVERY_ORDER')
  }

  if (missing.length > 0) {
    const missingLabels = missing.map((key) => {
      const step = RENTAL_WORKFLOW.find((s) => s.key === key)
      return step ? `${step.labelEn} (${step.labelAr})` : key
    })

    return {
      valid: false,
      message: `Missing prerequisites: ${missingLabels.join(', ')}`,
      messageAr: `متطلبات مفقودة: ${missingLabels.join('، ')}`,
      missing,
      requiredStep: 'TIME_SHEET',
    }
  }

  return {
    valid: true,
    message: 'Rental contract has delivery order, timesheet can be created',
    messageAr: 'عقد التأجير يمتلك أمر توريد، يمكن إنشاء تايم شيت',
    missing: [],
    currentStep: 'TIME_SHEET',
  }
}

/**
 * canCreateDeliveryOrder - Validates rental contract exists
 */
export async function canCreateDeliveryOrder(rentalId: string): Promise<ValidationResult> {
  const rental = await db.equipmentRental.findUnique({
    where: { id: rentalId },
    include: {
      contract: true,
      equipment: true,
      client: true,
    },
  })

  if (!rental) {
    return {
      valid: false,
      message: 'Rental contract not found',
      messageAr: 'عقد التأجير غير موجود',
      missing: ['RENTAL_CONTRACT'],
      requiredStep: 'DELIVERY_ORDER',
    }
  }

  const missing: string[] = []

  // Check client exists
  if (!rental.clientId) {
    missing.push('CLIENT')
  }

  // Check equipment exists
  if (!rental.equipmentId) {
    missing.push('EQUIPMENT')
  }

  // Check contract is active
  if (rental.contract.status !== 'ACTIVE' && rental.contract.status !== 'DRAFT') {
    missing.push('CONTRACT_ACTIVE')
  }

  // Check sales order (rental.salesOrderNo)
  if (!rental.salesOrderNo) {
    missing.push('SALES_ORDER')
  }

  if (missing.length > 0) {
    const missingLabels = missing.map((key) => {
      const step = RENTAL_WORKFLOW.find((s) => s.key === key)
      return step ? `${step.labelEn} (${step.labelAr})` : key
    })

    return {
      valid: false,
      message: `Missing prerequisites: ${missingLabels.join(', ')}`,
      messageAr: `متطلبات مفقودة: ${missingLabels.join('، ')}`,
      missing,
      requiredStep: 'DELIVERY_ORDER',
    }
  }

  return {
    valid: true,
    message: 'Rental contract exists with all prerequisites, delivery order can be created',
    messageAr: 'عقد التأجير موجود بجميع المتطلبات، يمكن إنشاء أمر التوريد',
    missing: [],
    currentStep: 'DELIVERY_ORDER',
  }
}

/**
 * canApprovePurchaseOrder - Validates purchase request is approved
 */
export async function canApprovePurchaseOrder(prId: string): Promise<ValidationResult> {
  const pr = await db.purchaseRequest.findUnique({
    where: { id: prId },
    include: { purchaseOrders: true },
  })

  if (!pr) {
    return {
      valid: false,
      message: 'Purchase request not found',
      messageAr: 'طلب الشراء غير موجود',
      missing: ['PURCHASE_REQUEST'],
      requiredStep: 'PURCHASE_ORDER',
    }
  }

  if (pr.status !== 'APPROVED') {
    return {
      valid: false,
      message: `Purchase request status is ${pr.status}, must be APPROVED before creating PO`,
      messageAr: `حالة طلب الشراء ${pr.status}، يجب أن تكون معتمدة قبل إنشاء أمر الشراء`,
      missing: ['PURCHASE_REQUEST_APPROVAL'],
      currentStep: 'PURCHASE_REQUEST',
      requiredStep: 'PURCHASE_ORDER',
    }
  }

  return {
    valid: true,
    message: 'Purchase request is approved, PO can be created',
    messageAr: 'طلب الشراء معتمد، يمكن إنشاء أمر الشراء',
    missing: [],
    currentStep: 'PURCHASE_ORDER',
  }
}

/**
 * canCreateGoodsReceipt - Validates PO is approved
 */
export async function canCreateGoodsReceipt(poId: string): Promise<ValidationResult> {
  const po = await db.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      purchaseRequest: true,
      supplier: true,
      goodsReceipts: true,
    },
  })

  if (!po) {
    return {
      valid: false,
      message: 'Purchase order not found',
      messageAr: 'أمر الشراء غير موجود',
      missing: ['PURCHASE_ORDER'],
      requiredStep: 'GOODS_RECEIPT',
    }
  }

  if (po.status !== 'APPROVED' && po.status !== 'PARTIALLY_RECEIVED') {
    return {
      valid: false,
      message: `Purchase order status is ${po.status}, must be APPROVED before goods receipt`,
      messageAr: `حالة أمر الشراء ${po.status}، يجب أن تكون معتمدة قبل إيصال الاستلام`,
      missing: ['PURCHASE_ORDER_APPROVAL'],
      currentStep: 'PURCHASE_ORDER',
      requiredStep: 'GOODS_RECEIPT',
    }
  }

  return {
    valid: true,
    message: 'Purchase order is approved, goods receipt can be created',
    messageAr: 'أمر الشراء معتمد، يمكن إنشاء إيصال الاستلام',
    missing: [],
    currentStep: 'GOODS_RECEIPT',
  }
}

/**
 * canCreateSupplierInvoice - Validates goods receipt exists
 */
export async function canCreateSupplierInvoice(grId: string): Promise<ValidationResult> {
  const gr = await db.goodsReceipt.findUnique({
    where: { id: grId },
    include: {
      purchaseOrder: { include: { supplier: true } },
      supplier: true,
      items: true,
    },
  })

  if (!gr) {
    return {
      valid: false,
      message: 'Goods receipt not found',
      messageAr: 'إيصال الاستلام غير موجود',
      missing: ['GOODS_RECEIPT'],
      requiredStep: 'SUPPLIER_INVOICE',
    }
  }

  if (gr.status === 'CANCELLED') {
    return {
      valid: false,
      message: 'Goods receipt is cancelled',
      messageAr: 'إيصال الاستلام ملغى',
      missing: ['GOODS_RECEIPT_VALID'],
      currentStep: 'GOODS_RECEIPT',
      requiredStep: 'SUPPLIER_INVOICE',
    }
  }

  // Check if already has a supplier invoice
  const existingInvoice = await db.purchaseInvoice.findFirst({
    where: { goodsReceiptId: grId },
  })
  if (existingInvoice) {
    return {
      valid: false,
      message: 'A supplier invoice already exists for this goods receipt',
      messageAr: 'توجد فاتورة مورد بالفعل لهذا الإيصال',
      missing: [],
    }
  }

  return {
    valid: true,
    message: 'Goods receipt exists, supplier invoice can be created',
    messageAr: 'إيصال الاستلام موجود، يمكن إنشاء فاتورة المورد',
    missing: [],
    currentStep: 'SUPPLIER_INVOICE',
  }
}

/**
 * canMakeSupplierPayment - Validates supplier invoice exists
 */
export async function canMakeSupplierPayment(invoiceId: string): Promise<ValidationResult> {
  const invoice = await db.purchaseInvoice.findUnique({
    where: { id: invoiceId },
    include: { supplier: true },
  })

  if (!invoice) {
    return {
      valid: false,
      message: 'Supplier invoice not found',
      messageAr: 'فاتورة المورد غير موجودة',
      missing: ['SUPPLIER_INVOICE'],
      requiredStep: 'PAYMENT',
    }
  }

  if (invoice.status === 'CANCELLED') {
    return {
      valid: false,
      message: 'Invoice is cancelled',
      messageAr: 'الفاتورة ملغاة',
      missing: ['SUPPLIER_INVOICE_VALID'],
    }
  }

  if (invoice.status === 'PAID') {
    return {
      valid: false,
      message: 'Invoice is already fully paid',
      messageAr: 'الفاتورة مدفوعة بالكامل',
      missing: [],
    }
  }

  const remaining = parseFloat(invoice.totalAmount.toFixed(2)) - parseFloat(invoice.paidAmount.toFixed(2))
  if (remaining <= 0) {
    return {
      valid: false,
      message: 'Invoice is already fully paid',
      messageAr: 'الفاتورة مدفوعة بالكامل',
      missing: [],
    }
  }

  return {
    valid: true,
    message: `Supplier invoice exists, payment can be made (remaining: ${remaining.toFixed(2)})`,
    messageAr: `فاتورة المورد موجودة، يمكن إجراء الدفعة (المتبقي: ${remaining.toFixed(2)})`,
    missing: [],
    currentStep: 'PAYMENT',
  }
}

/**
 * canMakeClientPayment - Validates client invoice exists
 */
export async function canMakeClientPayment(invoiceId: string): Promise<ValidationResult> {
  const invoice = await db.salesInvoice.findUnique({
    where: { id: invoiceId },
    include: { client: true },
  })

  if (!invoice) {
    return {
      valid: false,
      message: 'Client invoice not found',
      messageAr: 'فاتورة العميل غير موجودة',
      missing: ['CLIENT_INVOICE'],
      requiredStep: 'COLLECTION',
    }
  }

  if (invoice.status === 'CANCELLED') {
    return {
      valid: false,
      message: 'Invoice is cancelled',
      messageAr: 'الفاتورة ملغاة',
      missing: ['CLIENT_INVOICE_VALID'],
    }
  }

  if (invoice.status === 'PAID') {
    return {
      valid: false,
      message: 'Invoice is already fully paid',
      messageAr: 'الفاتورة مدفوعة بالكامل',
      missing: [],
    }
  }

  const remaining = parseFloat(invoice.totalAmount.toFixed(2)) - parseFloat(invoice.paidAmount.toFixed(2))
  if (remaining <= 0) {
    return {
      valid: false,
      message: 'Invoice is already fully paid',
      messageAr: 'الفاتورة مدفوعة بالكامل',
      missing: [],
    }
  }

  return {
    valid: true,
    message: `Client invoice exists, payment can be collected (remaining: ${remaining.toFixed(2)})`,
    messageAr: `فاتورة العميل موجودة، يمكن تحصيل الدفعة (المتبقي: ${remaining.toFixed(2)})`,
    missing: [],
    currentStep: 'COLLECTION',
  }
}

// ============ ACTIVITY TYPE ASSIGNMENT ============

/**
 * Determines the activity type for a given entity based on its context.
 * Maps records to EXECUTION, RENTAL, or GENERAL activity types.
 */
export function getProjectActivityType(projectType: string): ActivityTypeValue {
  if (projectType === 'CONSTRUCTION') return ActivityType.EXECUTION
  if (projectType === 'EQUIPMENT_RENTAL') return ActivityType.RENTAL
  return ActivityType.GENERAL
}

/**
 * Determines the activity type for a cost/transaction based on which
 * entity it is associated with.
 */
export async function getActivityTypeForEntity(
  entityType: 'PROJECT' | 'EQUIPMENT' | 'EXPENSE' | 'PURCHASE' | 'SALARY',
  entityId: string
): Promise<ActivityTypeValue> {
  switch (entityType) {
    case 'PROJECT': {
      const project = await db.project.findUnique({ where: { id: entityId } })
      if (!project) return ActivityType.GENERAL
      return getProjectActivityType(project.projectType)
    }

    case 'EQUIPMENT': {
      // Equipment could be used in either activity
      // Check if equipment has active rentals (RENTAL) or project assignments (EXECUTION)
      const activeRental = await db.equipmentRental.findFirst({
        where: { equipmentId: entityId, status: 'ACTIVE' },
      })
      if (activeRental) return ActivityType.RENTAL

      const projectUsage = await db.equipmentUsage.findFirst({
        where: { equipmentId: entityId },
      })
      if (projectUsage) return ActivityType.EXECUTION

      // Default: check equipment status
      const equipment = await db.equipment.findUnique({ where: { id: entityId } })
      if (equipment?.status === 'RENTED') return ActivityType.RENTAL
      if (equipment?.status === 'IN_USE') return ActivityType.EXECUTION

      return ActivityType.GENERAL
    }

    case 'EXPENSE': {
      const expense = await db.expense.findUnique({
        where: { id: entityId },
        include: { project: true },
      })
      if (!expense) return ActivityType.GENERAL
      if (expense.expenseType === 'INTERNAL') return ActivityType.GENERAL
      if (expense.project) return getProjectActivityType(expense.project.projectType)
      return ActivityType.GENERAL
    }

    case 'PURCHASE': {
      // Try as purchase invoice
      const pi = await db.purchaseInvoice.findUnique({
        where: { id: entityId },
        include: { project: true },
      })
      if (pi?.project) return getProjectActivityType(pi.project.projectType)

      // Try as purchase order
      const po = await db.purchaseOrder.findUnique({
        where: { id: entityId },
        include: { project: true },
      })
      if (po?.project) return getProjectActivityType(po.project.projectType)

      // Try as purchase request
      const pr = await db.purchaseRequest.findUnique({
        where: { id: entityId },
        include: { project: true },
      })
      if (pr?.project) return getProjectActivityType(pr.project.projectType)

      return ActivityType.GENERAL
    }

    case 'SALARY': {
      // Salary → check resource distribution (which project the employee is allocated to)
      const salary = await db.salary.findUnique({
        where: { id: entityId },
        include: { employee: true },
      })
      if (!salary) return ActivityType.GENERAL

      // Check if employee has resource allocation
      const allocation = await db.resourceAllocation.findFirst({
        where: {
          resourceId: salary.employeeId,
          resourceType: 'EMPLOYEE',
        },
        include: { project: true },
      })

      if (allocation?.project) {
        return getProjectActivityType(allocation.project.projectType)
      }

      return ActivityType.GENERAL
    }

    default:
      return ActivityType.GENERAL
  }
}

// ============ COST FLOW ENGINE ============

/**
 * Routes an employee salary cost to the correct hub.
 * Employee salary → Project cost (via resource distribution) or Operating cost
 */
export async function routeSalaryCost(salaryId: string): Promise<CostRoutingResult> {
  const salary = await db.salary.findUnique({
    where: { id: salaryId },
    include: { employee: true },
  })

  if (!salary) {
    return {
      destination: CostDestination.OPERATING_COST,
      activityType: ActivityType.GENERAL,
      targetId: '',
      targetName: 'Operating',
      accountCode: '8110',
      description: 'Salary cost - unallocated employee',
      descriptionAr: 'تكلفة راتب - موظف غير مخصص',
    }
  }

  // Check resource distribution
  const allocation = await db.resourceAllocation.findFirst({
    where: {
      resourceId: salary.employeeId,
      resourceType: 'EMPLOYEE',
    },
    include: { project: true },
  })

  if (allocation?.project) {
    const activityType = getProjectActivityType(allocation.project.projectType)
    return {
      destination: CostDestination.PROJECT_COST,
      activityType,
      targetId: allocation.project.id,
      targetName: allocation.project.name,
      accountCode: activityType === ActivityType.RENTAL ? '7300' : '7120',
      description: `Salary cost allocated to project: ${allocation.project.name}`,
      descriptionAr: `تكلفة راتب مخصصة للمشروع: ${allocation.project.name}`,
    }
  }

  return {
    destination: CostDestination.OPERATING_COST,
    activityType: ActivityType.GENERAL,
    targetId: '',
    targetName: 'Operating',
    accountCode: '8110',
    description: `Salary cost - ${salary.employee.name} (unallocated)`,
    descriptionAr: `تكلفة راتب - ${salary.employee.name} (غير مخصص)`,
  }
}

/**
 * Routes fuel cost to Equipment cost or Project cost.
 * Fuel → Equipment cost (if linked to equipment only) or Project cost (if projectId provided)
 */
export async function routeFuelCost(fuelLogId: string): Promise<CostRoutingResult> {
  const fuelLog = await db.equipmentFuelLog.findUnique({
    where: { id: fuelLogId },
    include: { equipment: true, project: true },
  })

  if (!fuelLog) {
    return {
      destination: CostDestination.OPERATING_COST,
      activityType: ActivityType.GENERAL,
      targetId: '',
      targetName: 'Operating',
      accountCode: '7210',
      description: 'Fuel cost - unknown',
      descriptionAr: 'تكلفة وقود - غير معروف',
    }
  }

  // If projectId is specified, route to project cost
  if (fuelLog.projectId && fuelLog.project) {
    const activityType = getProjectActivityType(fuelLog.project.projectType)
    return {
      destination: CostDestination.PROJECT_COST,
      activityType,
      targetId: fuelLog.project.id,
      targetName: fuelLog.project.name,
      accountCode: '7210',
      description: `Fuel cost for ${fuelLog.equipment.name} on project: ${fuelLog.project.name}`,
      descriptionAr: `تكلفة وقود ${fuelLog.equipment.name} في المشروع: ${fuelLog.project.name}`,
    }
  }

  // Otherwise route to equipment cost
  const equipmentActivity = await getActivityTypeForEntity('EQUIPMENT', fuelLog.equipmentId)
  return {
    destination: CostDestination.EQUIPMENT_COST,
    activityType: equipmentActivity,
    targetId: fuelLog.equipmentId,
    targetName: fuelLog.equipment.name,
    accountCode: '7210',
    description: `Fuel cost for equipment: ${fuelLog.equipment.name}`,
    descriptionAr: `تكلفة وقود للمعدة: ${fuelLog.equipment.name}`,
  }
}

/**
 * Routes maintenance cost to Equipment cost.
 * Maintenance → Equipment cost
 */
export async function routeMaintenanceCost(maintenanceId: string): Promise<CostRoutingResult> {
  const maintenance = await db.equipmentMaintenance.findUnique({
    where: { id: maintenanceId },
    include: { equipment: true },
  })

  if (!maintenance) {
    return {
      destination: CostDestination.OPERATING_COST,
      activityType: ActivityType.GENERAL,
      targetId: '',
      targetName: 'Operating',
      accountCode: '7220',
      description: 'Maintenance cost - unknown',
      descriptionAr: 'تكلفة صيانة - غير معروف',
    }
  }

  const equipmentActivity = await getActivityTypeForEntity('EQUIPMENT', maintenance.equipmentId)
  return {
    destination: CostDestination.EQUIPMENT_COST,
    activityType: equipmentActivity,
    targetId: maintenance.equipmentId,
    targetName: maintenance.equipment.name,
    accountCode: '7220',
    description: `Maintenance cost for equipment: ${maintenance.equipment.name}`,
    descriptionAr: `تكلفة صيانة للمعدة: ${maintenance.equipment.name}`,
  }
}

/**
 * Routes purchase cost to Project cost OR Equipment cost (based on beneficiary).
 */
export async function routePurchaseCost(purchaseInvoiceId: string): Promise<CostRoutingResult> {
  const invoice = await db.purchaseInvoice.findUnique({
    where: { id: purchaseInvoiceId },
    include: { project: true, goodsReceipt: true },
  })

  if (!invoice) {
    return {
      destination: CostDestination.OPERATING_COST,
      activityType: ActivityType.GENERAL,
      targetId: '',
      targetName: 'Operating',
      accountCode: '7110',
      description: 'Purchase cost - unknown',
      descriptionAr: 'تكلفة شراء - غير معروف',
    }
  }

  // If projectId is specified, route to project cost
  if (invoice.projectId && invoice.project) {
    const activityType = getProjectActivityType(invoice.project.projectType)
    return {
      destination: CostDestination.PROJECT_COST,
      activityType,
      targetId: invoice.project.id,
      targetName: invoice.project.name,
      accountCode: activityType === ActivityType.RENTAL ? '7300' : '7110',
      description: `Purchase cost for project: ${invoice.project.name}`,
      descriptionAr: `تكلفة شراء للمشروع: ${invoice.project.name}`,
    }
  }

  return {
    destination: CostDestination.OPERATING_COST,
    activityType: ActivityType.GENERAL,
    targetId: '',
    targetName: 'Operating',
    accountCode: '7110',
    description: `Purchase cost - general (invoice: ${invoice.invoiceNo})`,
    descriptionAr: `تكلفة شراء - عامة (فاتورة: ${invoice.invoiceNo})`,
  }
}

/**
 * Routes expense to Project cost OR Operating cost.
 */
export async function routeExpenseCost(expenseId: string): Promise<CostRoutingResult> {
  const expense = await db.expense.findUnique({
    where: { id: expenseId },
    include: { project: true },
  })

  if (!expense) {
    return {
      destination: CostDestination.OPERATING_COST,
      activityType: ActivityType.GENERAL,
      targetId: '',
      targetName: 'Operating',
      accountCode: '8630',
      description: 'Expense - unknown',
      descriptionAr: 'مصروف - غير معروف',
    }
  }

  // INTERNAL expenses → Operating cost
  if (expense.expenseType === 'INTERNAL' || !expense.projectId) {
    return {
      destination: CostDestination.OPERATING_COST,
      activityType: ActivityType.GENERAL,
      targetId: '',
      targetName: 'Operating',
      accountCode: '8630',
      description: `Internal expense: ${expense.description}`,
      descriptionAr: `مصروف داخلي: ${expense.description}`,
    }
  }

  // PROJECT expenses → Project cost
  if (expense.project) {
    const activityType = getProjectActivityType(expense.project.projectType)
    return {
      destination: CostDestination.PROJECT_COST,
      activityType,
      targetId: expense.project.id,
      targetName: expense.project.name,
      accountCode: '7500',
      description: `Project expense: ${expense.description} (${expense.project.name})`,
      descriptionAr: `مصروف مشروع: ${expense.description} (${expense.project.name})`,
    }
  }

  return {
    destination: CostDestination.OPERATING_COST,
    activityType: ActivityType.GENERAL,
    targetId: '',
    targetName: 'Operating',
    accountCode: '8630',
    description: `Expense: ${expense.description}`,
    descriptionAr: `مصروف: ${expense.description}`,
  }
}

// ============ PROFITABILITY CALCULATOR ============

/**
 * Rounds a number to 2 decimal places
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * calculateProjectProfitability - Returns revenue, costs breakdown, profit, margin
 *
 * ⚠️  SSOT (P1-1-FIX / M1): جميع الإيرادات والتكاليف مصدرها JournalLine
 *    (status='POSTED', deletedAt IS NULL) عبر الدالة الموحّدة
 *    `getProjectCostBreakdown` في `@/lib/accounting/queries`. لا تُقرأ
 *    الأرقام من الجداول التشغيلية (ProgressClaim / SalesInvoice /
 *    PurchaseInvoice / LaborCost / EquipmentCost / SubcontractorInvoice /
 *    EquipmentUsage / EquipmentFuelLog / Expense) حتى تتطابق الربحية مع
 *    القوائم المالية وميزان المراجعة.
 *
 *    خريطة byRole → الحقول:
 *      PROJECT_COST → materials + purchases
 *      SUBCONTRACTOR_COST → subcontractors
 *      PAYROLL_EXPENSE → labor (salaries + labor)
 *      FUEL_EXPENSE → fuel
 *      MAINTENANCE_EXPENSE → maintenance
 *      DRIVER_EXPENSE + TRANSPORT_EXPENSE + RENTAL_DEPRECIATION → equipment
 *      ADMIN_EXPENSE + GOSI_EXPENSE + DEPRECIATION_EXPENSE + ZAKAT_EXPENSE + OTHER → expenses + other
 */
export async function calculateProjectProfitability(projectId: string): Promise<ProfitabilityResult> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      contracts: { select: { totalValue: true, status: true } },
    },
  })

  if (!project) {
    return {
      revenue: 0,
      costs: {
        materials: 0, labor: 0, subcontractors: 0, equipment: 0,
        fuel: 0, maintenance: 0, expenses: 0, purchases: 0, other: 0,
      },
      totalCosts: 0,
      profit: 0,
      margin: 0,
      currency: 'SAR',
    }
  }

  // === المصدر الموحّد: JournalLine المرحّلة على مركز تكلفة المشروع ===
  const { getProjectCostBreakdown } = await import('@/lib/accounting/queries')
  const breakdown = await getProjectCostBreakdown(projectId)
  const role = (key: string): number => breakdown.byRole.get(key) || 0

  const revenue = round2(breakdown.revenue)

  const materials = round2(role('PROJECT_COST'))
  const subcontractors = round2(role('SUBCONTRACTOR_COST'))
  const labor = round2(role('PAYROLL_EXPENSE'))
  const fuel = round2(role('FUEL_EXPENSE'))
  const maintenance = round2(role('MAINTENANCE_EXPENSE'))
  const equipment = round2(
    role('DRIVER_EXPENSE') +
    role('TRANSPORT_EXPENSE') +
    role('RENTAL_DEPRECIATION')
  )
  const expenses = round2(role('ADMIN_EXPENSE'))
  const purchases = materials // نفس بند تكاليف المواد في النظام المحاسبي
  const other = round2(
    role('GOSI_EXPENSE') +
    role('DEPRECIATION_EXPENSE') +
    role('ZAKAT_EXPENSE') +
    role('OTHER')
  )

  const totalCosts = round2(breakdown.total)
  const profit = round2(revenue - totalCosts)
  const margin = revenue > 0 ? round2((profit / revenue) * 100) : 0

  return {
    revenue,
    costs: {
      materials,
      labor,
      subcontractors,
      equipment,
      fuel,
      maintenance,
      expenses,
      purchases,
      other,
    },
    totalCosts,
    profit,
    margin,
    currency: 'SAR',
  }
}

/**
 * calculateEquipmentProfitability - Returns revenue, costs breakdown, profit, margin
 *
 * ⚠️  ARCHITECTURAL GAP (P1-1-FIX / M2): تتطلب هذه الدالة بُعد "مركز تكلفة
 *    لكل معدة" (per-equipment cost center dimension) على JournalLine حتى
 *    يمكن اشتقاق الإيراد والتكاليف من القيود المحاسبية. هذا البُعد غير
 *    متوفر حالياً في النظام، لذلك تبقى هذه الدالة تقرأ من الجداول التشغيلية
 *    كمؤشر تشغيلي (Operational View) — وليست تقريراً مالياً معتمداً.
 *
 *    TODO (طويل الأمد): أضف عمود `equipmentId` إلى JournalLine، أو أنشئ
 *    مركز تكلفة لكل معدّة واربطه بحقل `equipment.costCenterId`. عند توفّر
 *    هذا البُعد، أعد كتابة هذه الدالة لتستخدم
 *    `getBalanceByType('REVENUE', undefined, { activityType: 'EQUIPMENT_RENTAL' })`
 *    مُصفّاةً بمركز تكلفة المعدة.
 *
 *    بالكامل تعتمد هذه الدالة على EquipmentRental/Timesheet/EquipmentFuelLog
 *    /EquipmentMaintenance/EquipmentOperatorLog/EquipmentUsage + إهلاك مقدّر
 *    من Equipment.purchasePrice. جميعها مصادر تشغيلية وليست مالية.
 */
export async function calculateEquipmentProfitability(equipmentId: string): Promise<EquipmentProfitabilityResult> {
  const equipment = await db.equipment.findUnique({
    where: { id: equipmentId },
    include: {
      rentals: {
        include: {
          timesheets: true,
          contract: true,
        },
      },
      fuelLogs: true,
      maintenance: true,
      operatorLogs: true,
      timesheets: true,
      usages: true,
    },
  })

  if (!equipment) {
    return {
      revenue: 0,
      costs: { fuel: 0, maintenance: 0, operations: 0, depreciation: 0, other: 0 },
      totalCosts: 0,
      profit: 0,
      margin: 0,
      currency: 'SAR',
      totalOperatingHours: 0,
      hourlyProfit: 0,
    }
  }

  // === REVENUE ===
  // From rental timesheets that have been invoiced
  const invoicedTimesheets = equipment.timesheets.filter(
    (ts) => ts.status === 'INVOICED' || ts.status === 'APPROVED'
  )

  const revenue = round2(
    invoicedTimesheets.reduce((sum, ts) => {
      const rental = equipment.rentals.find((r) => r.id === ts.rentalId)
      if (rental) {
        return sum + (Number(ts.operatingHours) * Number(rental.hourlyRate)) + Number(rental.deliveryFees)
      }
      return sum
    }, 0)
  )

  // === COSTS ===
  const fuel = round2(
    equipment.fuelLogs.reduce((sum, fl) => sum + Number(fl.totalCost), 0)
  )

  const maintenance = round2(
    equipment.maintenance.reduce((sum, m) => sum + Number(m.cost), 0)
  )

  const operations = round2(
    equipment.operatorLogs.reduce((sum, op) => sum + Number(op.hours), 0) * (Number(equipment.hourlyRate) || 0) // estimated operator cost
  )

  // Simple depreciation estimate (purchasePrice / useful life years * months active)
  const depreciation = round2(Number(equipment.purchasePrice) > 0 ? Number(equipment.purchasePrice) / 60 : 0) // 5-year life, monthly

  const other = round2(
    equipment.usages.reduce((sum, u) => sum + Number(u.cost), 0)
  )

  const totalCosts = round2(fuel + maintenance + operations + depreciation + other)
  const profit = round2(revenue - totalCosts)
  const margin = revenue > 0 ? round2((profit / revenue) * 100) : 0

  const totalOperatingHours = round2(
    equipment.timesheets.reduce((sum, ts) => sum + Number(ts.operatingHours), 0) +
    equipment.operatorLogs.reduce((sum, op) => sum + Number(op.hours), 0)
  )

  const hourlyProfit = totalOperatingHours > 0 ? round2(profit / totalOperatingHours) : 0

  return {
    revenue,
    costs: {
      fuel,
      maintenance,
      operations,
      depreciation,
      other,
    },
    totalCosts,
    profit,
    margin,
    currency: 'SAR',
    totalOperatingHours,
    hourlyProfit,
  }
}

// ============ WORKFLOW PROGRESS TRACKER ============

export interface WorkflowProgress {
  workflowType: 'CONSTRUCTION' | 'RENTAL' | 'PURCHASE'
  steps: {
    key: string
    labelEn: string
    labelAr: string
    completed: boolean
    current: boolean
  }[]
  completionPercentage: number
  nextStep?: string
}

/**
 * Get the current progress of a construction project workflow
 */
export async function getConstructionWorkflowProgress(projectId: string): Promise<WorkflowProgress> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      client: { include: { clientPayments: true } },
      contracts: true,
      boqItems: true,
      laborCosts: true,
      expenses: true,
      subcontractorInvoices: true,
      purchaseInvoices: true,
      purchaseOrders: true,
      progressClaims: true,
      salesInvoices: true,
      equipmentOperations: true,
    },
  })

  const steps = CONSTRUCTION_WORKFLOW.map((step) => {
    let completed = false

    switch (step.key) {
      case 'CLIENT':
        completed = !!project?.client
        break
      case 'PROJECT':
        completed = !!project
        break
      case 'CONTRACT':
        completed = (project?.contracts.length ?? 0) > 0
        break
      case 'BOQ':
        completed = (project?.boqItems.length ?? 0) > 0
        break
      case 'WORK_HOURS':
        completed = (project?.laborCosts.length ?? 0) > 0 || (project?.equipmentOperations?.length ?? 0) > 0
        break
      case 'EXPENSES':
        completed = (project?.expenses.length ?? 0) > 0
        break
      case 'SUBCONTRACTORS':
        completed = (project?.subcontractorInvoices.length ?? 0) > 0
        break
      case 'PURCHASES':
        completed = (project?.purchaseInvoices.length ?? 0) > 0 || (project?.purchaseOrders?.length ?? 0) > 0
        break
      case 'EXTRACT':
        completed = (project?.progressClaims.filter((c) => c.status === 'APPROVED').length ?? 0) > 0
        break
      case 'CLIENT_INVOICE':
        completed = (project?.salesInvoices.filter((i) => i.status !== 'CANCELLED').length ?? 0) > 0
        break
      case 'COLLECTION':
        completed = (project?.salesInvoices.filter((i) => i.status === 'PAID' || i.status === 'PARTIALLY_PAID').length ?? 0) > 0
        break
      case 'JOURNAL_ENTRY':
        completed = (project?.salesInvoices.filter((i) => i.journalEntryId).length ?? 0) > 0
        break
    }

    return {
      key: step.key,
      labelEn: step.labelEn,
      labelAr: step.labelAr,
      completed,
      current: false,
    }
  })

  // Mark the current step (first incomplete step)
  const firstIncomplete = steps.findIndex((s) => !s.completed)
  if (firstIncomplete >= 0) {
    steps[firstIncomplete].current = true
  }

  const completedCount = steps.filter((s) => s.completed).length
  const completionPercentage = Math.round((completedCount / steps.length) * 100)
  const nextStep = firstIncomplete >= 0 ? steps[firstIncomplete].key : undefined

  return {
    workflowType: 'CONSTRUCTION',
    steps,
    completionPercentage,
    nextStep,
  }
}

/**
 * Get the current progress of a rental workflow
 */
export async function getRentalWorkflowProgress(rentalId: string): Promise<WorkflowProgress> {
  const rental = await db.equipmentRental.findUnique({
    where: { id: rentalId },
    include: {
      client: true,
      contract: true,
      equipment: true,
      deliveryOrders: true,
      timesheets: true,
    },
  })

  // Get invoices for this rental
  const timesheetIds = rental?.timesheets.map((t) => t.id) ?? []
  const invoices = timesheetIds.length > 0
    ? await db.salesInvoice.findMany({
        where: { timesheetId: { in: timesheetIds } },
        include: { clientPayments: true },
      })
    : []

  const steps = RENTAL_WORKFLOW.map((step) => {
    let completed = false

    switch (step.key) {
      case 'CLIENT':
        completed = !!rental?.client
        break
      case 'RENTAL_CONTRACT':
        completed = !!rental?.contract
        break
      case 'SALES_ORDER':
        completed = !!rental?.salesOrderNo
        break
      case 'DELIVERY_ORDER':
        completed = (rental?.deliveryOrders.filter((d) => d.status === 'DELIVERED').length ?? 0) > 0
        break
      case 'TIME_SHEET':
        completed = (rental?.timesheets.filter((t) => t.status === 'APPROVED' || t.status === 'INVOICED').length ?? 0) > 0
        break
      case 'RENTAL_INVOICE':
        completed = invoices.filter((i) => i.sourceType === 'TIMESHEET' && i.status !== 'CANCELLED').length > 0
        break
      case 'COLLECTION':
        completed = invoices.some((i) => i.status === 'PAID' || i.status === 'PARTIALLY_PAID')
        break
      case 'JOURNAL_ENTRY':
        completed = invoices.some((i) => i.journalEntryId)
        break
    }

    return {
      key: step.key,
      labelEn: step.labelEn,
      labelAr: step.labelAr,
      completed,
      current: false,
    }
  })

  const firstIncomplete = steps.findIndex((s) => !s.completed)
  if (firstIncomplete >= 0) {
    steps[firstIncomplete].current = true
  }

  const completedCount = steps.filter((s) => s.completed).length
  const completionPercentage = Math.round((completedCount / steps.length) * 100)
  const nextStep = firstIncomplete >= 0 ? steps[firstIncomplete].key : undefined

  return {
    workflowType: 'RENTAL',
    steps,
    completionPercentage,
    nextStep,
  }
}

/**
 * Get the current progress of a purchase workflow
 */
export async function getPurchaseWorkflowProgress(purchaseRequestId: string): Promise<WorkflowProgress> {
  const pr = await db.purchaseRequest.findUnique({
    where: { id: purchaseRequestId },
    include: {
      purchaseOrders: {
        include: {
          goodsReceipts: {
            include: {
              purchaseInvoice: true,
            },
          },
          invoices: true,
        },
      },
    },
  })

  const steps = PURCHASE_WORKFLOW.map((step) => {
    let completed = false

    switch (step.key) {
      case 'PURCHASE_REQUEST':
        completed = !!pr
        break
      case 'PURCHASE_ORDER': {
        const approvedPOs = pr?.purchaseOrders.filter(
          (po) => po.status === 'APPROVED' || po.status === 'PARTIALLY_RECEIVED' || po.status === 'RECEIVED'
        ) ?? []
        completed = approvedPOs.length > 0
        break
      }
      case 'GOODS_RECEIPT': {
        const grs = pr?.purchaseOrders.flatMap((po) => po.goodsReceipts) ?? []
        completed = grs.filter((gr) => gr.status === 'COMPLETED' || gr.status === 'PARTIAL').length > 0
        break
      }
      case 'SUPPLIER_INVOICE': {
        const invoices = pr?.purchaseOrders.flatMap((po) => po.invoices) ?? []
        completed = invoices.filter((inv) => inv.status !== 'CANCELLED').length > 0
        break
      }
      case 'PAYMENT': {
        const invoices = pr?.purchaseOrders.flatMap((po) => po.invoices) ?? []
        completed = invoices.some(
          (inv) => Number(inv.paidAmount) > 0 && inv.status !== 'CANCELLED'
        )
        break
      }
      case 'JOURNAL_ENTRY': {
        const invoices = pr?.purchaseOrders.flatMap((po) => po.invoices) ?? []
        completed = invoices.some((inv) => inv.journalEntryId)
        break
      }
    }

    return {
      key: step.key,
      labelEn: step.labelEn,
      labelAr: step.labelAr,
      completed,
      current: false,
    }
  })

  const firstIncomplete = steps.findIndex((s) => !s.completed)
  if (firstIncomplete >= 0) {
    steps[firstIncomplete].current = true
  }

  const completedCount = steps.filter((s) => s.completed).length
  const completionPercentage = Math.round((completedCount / steps.length) * 100)
  const nextStep = firstIncomplete >= 0 ? steps[firstIncomplete].key : undefined

  return {
    workflowType: 'PURCHASE',
    steps,
    completionPercentage,
    nextStep,
  }
}
