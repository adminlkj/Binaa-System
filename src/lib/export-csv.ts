/**
 * exportToCSV - Reusable CSV export utility for نظام بِنَاء
 *
 * Converts data to CSV format with proper UTF-8 BOM for Excel compatibility
 * Handles Arabic text correctly
 */

export interface CSVColumn {
  key: string
  label: string
  /** Optional custom formatter for the cell value */
  format?: (value: unknown) => string
}

/**
 * Export data to CSV and trigger browser download
 *
 * @param data - Array of objects to export
 * @param filename - Name of the downloaded file (without extension)
 * @param columns - Column definitions with key and label
 */
export function exportToCSV(
  data: Record<string, unknown>[],
  filename: string,
  columns: CSVColumn[],
): void {
  // UTF-8 BOM for Excel compatibility with Arabic text
  const BOM = '\uFEFF'

  // Build header row
  const header = columns.map(col => `"${col.label.replace(/"/g, '""')}"`).join(',')

  // Build data rows
  const rows = data.map(row => {
    return columns.map(col => {
      const rawValue = row[col.key]
      let cellValue: string

      if (col.format) {
        cellValue = col.format(rawValue)
      } else if (rawValue === null || rawValue === undefined) {
        cellValue = ''
      } else if (typeof rawValue === 'number') {
        // Use dot as decimal separator for CSV compatibility
        cellValue = rawValue.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      } else if (typeof rawValue === 'object') {
        cellValue = JSON.stringify(rawValue)
      } else {
        cellValue = String(rawValue)
      }

      // Escape and quote the cell
      return `"${cellValue.replace(/"/g, '""')}"`
    }).join(',')
  })

  // Combine all content
  const csvContent = BOM + header + '\n' + rows.join('\n')

  // Create blob and trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `${filename}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
