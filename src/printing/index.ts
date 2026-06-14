// ============================================================================
// واجهة الطباعة العامة - Public Print API
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

// Main entry point - PrintService
export { generatePrintHTML, getTemplate } from './print-service'

// Types
export type { PrintDocumentType, PrintOptions, PrintSettings, DocumentTemplate, DocumentCategory, DocumentTitle } from './shared/types'

// Utils (for external use if needed)
export { fmtMoney, formatMoneyPrint, formatDate, getDocumentTitle, encodeZATCATLV, getAmountInWords } from './shared/utils'

// Templates (for direct access if needed)
export { ServiceInvoiceTemplate } from './invoices/ServiceInvoice'
export { RentalInvoiceTemplate } from './invoices/RentalInvoice'
export { SupplierInvoiceTemplate } from './invoices/SupplierInvoice'
export { template as ProgressClaimTemplate } from './projects/ProgressClaim'
export { template as PurchaseOrderTemplate } from './procurement/PurchaseOrder'
export { template as DeliveryOrderTemplate } from './procurement/DeliveryOrder'
export { template as TimesheetTemplate } from './operations/Timesheet'
export { template as TrialBalanceTemplate } from './accounting/TrialBalance'
export { template as GeneralLedgerTemplate } from './accounting/GeneralLedger'
export { template as IncomeStatementTemplate } from './accounting/IncomeStatement'
export { template as BalanceSheetTemplate } from './accounting/BalanceSheet'
export { template as VatReturnTemplate } from './tax/VatReturn'
export { template as PaymentVoucherTemplate } from './financial/PaymentVoucher'
export { template as SalarySlipTemplate } from './financial/SalarySlip'
export { template as RentalContractTemplate } from './financial/RentalContract'
export { template as GenericTableTemplate } from './reports/GenericTable'
