'use client'

/**
 * TablePrintExportButtons
 * -----------------------
 * Reusable toolbar that provides Print + Export CSV buttons for any tabular screen.
 *
 * - Print: uses the centralized `PrintButton` with the `generic-table` template,
 *   passing `columns`, `rows`, `infoItems`, and `totals` so the printed A4 page
 *   shows a professional report with the company header/footer.
 * - Export: uses `exportToCSV` to download a UTF-8 BOM CSV file (Excel-friendly
 *   with Arabic text).
 *
 * Usage:
 *   <TablePrintExportButtons
 *     title={{ ar: 'شجرة الحسابات', en: 'Chart of Accounts' }}
 *     columns={[{ key: 'code', label: 'الكود' }, ...]}
 *     rows={accounts}
 *     csvColumns={[{ key: 'code', label: 'الكود' }, ...]}
 *     csvFilename="chart-of-accounts"
 *     infoItems={[{ label: 'إجمالي الحسابات', value: '120' }]}
 *   />
 */

import React from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PrintButton } from '@/components/shared/print-button'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'
import { useAppStore } from '@/stores/app-store'
import type { PrintDocumentType } from '@/printing'

export interface PrintColumn {
  key: string
  label: string
  /** Set to 'amount' to right-align and format as money in the print template */
  align?: 'amount' | 'text'
  type?: 'amount' | 'text' | 'money'
}

export interface PrintInfoItem {
  label: string
  value: string
}

export interface PrintTotalItem {
  label: string
  value: number
  isGrand?: boolean
}

interface TablePrintExportButtonsProps {
  /** Title shown in the print header (Arabic/English) */
  title: { ar: string; en: string }
  /** Print document type — defaults to 'generic-table' which uses the GenericTable template */
  printType?: PrintDocumentType
  /** Column definitions for the print template */
  columns: PrintColumn[]
  /** Row data for the print template */
  rows: Record<string, unknown>[]
  /** Column definitions for CSV export (can differ from print columns) */
  csvColumns: CSVColumn[]
  /** Row data for CSV export (can differ from print rows) */
  csvRows?: Record<string, unknown>[]
  /** CSV filename (without extension) — defaults to a slug of the English title */
  csvFilename?: string
  /** Info items shown in a grid at the top of the printed report */
  infoItems?: PrintInfoItem[]
  /** Totals shown in a totals box at the bottom of the printed report */
  totals?: PrintTotalItem[]
  /** Whether to show the currency badge on the printed report */
  showCurrency?: boolean
  /** Disable both buttons (e.g. when there's no data) */
  disabled?: boolean
  /** Button size — defaults to 'sm' */
  size?: 'default' | 'sm' | 'lg' | 'icon'
  /** Optional className for the wrapper */
  className?: string
}

export function TablePrintExportButtons({
  title,
  printType = 'generic-table',
  columns,
  rows,
  csvColumns,
  csvRows,
  csvFilename,
  infoItems,
  totals,
  showCurrency = false,
  disabled = false,
  size = 'sm',
  className,
}: TablePrintExportButtonsProps) {
  const { lang } = useAppStore()

  const handleExport = () => {
    if (disabled) return
    const data = csvRows || rows
    if (data.length === 0) {
      alert(lang === 'ar' ? 'لا توجد بيانات للتصدير' : 'No data to export')
      return
    }
    const filename = csvFilename || (lang === 'ar' ? title.ar : title.en).replace(/\s+/g, '-').toLowerCase()
    exportToCSV(data, `${filename}-${new Date().toISOString().slice(0, 10)}`, csvColumns)
  }

  // Build the data object expected by the GenericTable print template
  const printData: Record<string, unknown> = {
    sectionTitle: lang === 'ar' ? title.ar : title.en,
    columns: columns.map(c => ({
      key: c.key,
      label: c.label,
      align: c.align,
      type: c.type,
    })),
    rows,
    showCurrency,
    infoItems: infoItems || [],
    totals: totals || [],
  }

  return (
    <div className={`flex items-center gap-1.5 ${className || ''}`}>
      <PrintButton
        type={printType}
        data={printData}
        size={size}
        variant="outline"
        label={lang === 'ar' ? 'طباعة' : 'Print'}
      />
      <Button
        variant="outline"
        size={size}
        onClick={handleExport}
        disabled={disabled}
        title={lang === 'ar' ? 'تصدير CSV' : 'Export CSV'}
        className="gap-1.5"
      >
        <Download className="size-4" />
        <span>{lang === 'ar' ? 'تصدير' : 'Export'}</span>
      </Button>
    </div>
  )
}

/**
 * Helper hook to build print/export column definitions from a simple config.
 * Useful when print and CSV columns are the same.
 */
export function buildColumns(
  cols: Array<{ key: string; labelAr: string; labelEn: string; isAmount?: boolean }>
): { printColumns: PrintColumn[]; csvColumns: CSVColumn[] } {
  const printColumns: PrintColumn[] = cols.map(c => ({
    key: c.key,
    label: '', // filled by caller based on lang
    align: c.isAmount ? 'amount' : 'text',
    type: c.isAmount ? 'amount' : 'text',
  }))
  const csvColumns: CSVColumn[] = cols.map(c => ({
    key: c.key,
    label: '', // filled by caller based on lang
  }))
  return { printColumns, csvColumns }
}
