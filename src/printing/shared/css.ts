// ============================================================================
// أنماط CSS المشتركة - Shared CSS Styles (Professional ERP-Level)
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

// ============ Color System ============
const colors = {
  primary: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b' },
  accent: { 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
  neutral: { 50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db', 400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151', 800: '#1f2937', 900: '#111827' },
}

// ============ Default Document CSS (Professional ERP) ============

export function getDefaultCSS(lang: 'ar' | 'en'): string {
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  const fontFamily = "'Cairo', 'Noto Sans Arabic', 'Inter', sans-serif"
  const textAlign = lang === 'ar' ? 'right' : 'left'
  const amountAlign = lang === 'ar' ? 'left' : 'right'
  const borderStart = lang === 'ar' ? 'border-right' : 'border-left'
  const paddingStart = lang === 'ar' ? 'padding-right' : 'padding-left'
  const marginStart = lang === 'ar' ? 'margin-right' : 'margin-left'

  return `
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${fontFamily};
      font-size: 10.5px;
      color: #1e293b;
      direction: ${dir};
      background: #e2e8f0;
      line-height: 1.55;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @page {
      size: A4 portrait;
      margin: 12mm 10mm;
    }
    @media print {
      body { background: white; font-size: 10px; }
      .page { margin: 0; box-shadow: none; width: 100%; min-height: auto; }
      .no-print { display: none !important; }
      .page-break { page-break-before: always; }
      .doc-table thead { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .doc-header, .doc-footer, .ri-header, .ri-footer, .acct-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 0;
      margin: 0 auto 16px;
      background: white;
      box-shadow: 0 1px 12px rgba(0,0,0,0.08);
      position: relative;
      overflow: hidden;
    }

    /* ════════════════════════════════════════════
       HEADER
    ════════════════════════════════════════════ */
    .doc-header {
      background: linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%);
      color: white;
      padding: 16px 24px 14px;
      display: flex;
      align-items: center;
      gap: 14px;
      position: relative;
    }
    .doc-header::after {
      content: '';
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg, #d97706, #f59e0b, #d97706);
    }
    .header-logo {
      width: 54px; height: 54px;
      border-radius: 8px;
      background: white;
      padding: 3px;
      flex-shrink: 0;
      object-fit: contain;
    }
    .header-company { flex: 1; min-width: 0; }
    .header-company-name {
      font-size: 16px; font-weight: 800;
      letter-spacing: 0.3px; line-height: 1.3;
    }
    .header-company-details {
      font-size: 8px; opacity: 0.88;
      margin-top: 2px;
      display: flex; flex-wrap: wrap; gap: 6px 12px;
    }
    .header-company-details span {
      display: inline-flex; align-items: center; gap: 2px;
      white-space: nowrap;
    }
    .header-doc-title-section {
      flex-shrink: 0; text-align: center;
      background: rgba(255,255,255,0.12);
      border-radius: 6px;
      padding: 7px 14px;
      border: 1px solid rgba(255,255,255,0.18);
    }
    .header-doc-title { font-size: 13px; font-weight: 700; white-space: nowrap; }
    .header-doc-subtitle { font-size: 8px; opacity: 0.8; margin-top: 1px; }

    /* ════════════════════════════════════════════
       CUSTOM HEADER IMAGE
    ════════════════════════════════════════════ */
    .custom-header img { width: 100%; max-height: 90px; object-fit: contain; }

    /* ════════════════════════════════════════════
       BODY
    ════════════════════════════════════════════ */
    .doc-body { padding: 16px 24px 8px; }

    /* ════════════════════════════════════════════
       SECTION TITLE
    ════════════════════════════════════════════ */
    .section-title {
      font-size: 10px; font-weight: 700; color: #047857;
      text-transform: uppercase; letter-spacing: 0.5px;
      margin: 14px 0 6px;
      ${paddingStart}: 8px;
      ${borderStart}: 3px solid #059669;
    }

    /* ════════════════════════════════════════════
       INFO GRID
    ════════════════════════════════════════════ */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 16px;
      margin: 8px 0;
    }
    .info-grid-3 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 6px 16px;
      margin: 8px 0;
    }
    .info-item {
      padding: 5px 10px;
      background: #f8fafc;
      border-radius: 4px;
      ${borderStart}: 3px solid #059669;
    }
    .info-label {
      font-size: 7.5px; color: #94a3b8;
      text-transform: uppercase; letter-spacing: 0.4px;
      margin-bottom: 1px;
    }
    .info-value {
      font-size: 10.5px; font-weight: 600; color: #1e293b;
    }

    /* ════════════════════════════════════════════
       PARTIES SECTION
    ════════════════════════════════════════════ */
    .parties-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin: 10px 0;
    }
    .party-card {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 12px;
      background: #fafbfc;
    }
    .party-card-title {
      font-size: 8px; font-weight: 700;
      color: #047857;
      text-transform: uppercase; letter-spacing: 0.4px;
      margin-bottom: 6px;
      padding-bottom: 4px;
      border-bottom: 1px solid #e2e8f0;
    }
    .party-card-row {
      display: flex; justify-content: space-between;
      margin: 2px 0; font-size: 9.5px;
    }
    .party-card-row .label { color: #64748b; }
    .party-card-row .value { font-weight: 600; color: #1e293b; }

    /* ════════════════════════════════════════════
       TABLE (Professional)
    ════════════════════════════════════════════ */
    .doc-table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
      border: 1px solid #cbd5e1;
      font-size: 9.5px;
    }
    .doc-table thead {
      background: #047857;
    }
    .doc-table thead th {
      padding: 8px 10px;
      color: white;
      font-size: 8px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      text-align: ${textAlign};
      border-bottom: 2px solid #065f46;
    }
    .doc-table thead th.amount-header {
      text-align: ${amountAlign};
    }
    .doc-table tbody tr {
      border-bottom: 1px solid #f1f5f9;
    }
    .doc-table tbody tr:nth-child(even) {
      background: #f8fafc;
    }
    .doc-table tbody tr:hover {
      background: #ecfdf5;
    }
    .doc-table tbody td {
      padding: 6px 10px;
      font-size: 9.5px;
      text-align: ${textAlign};
      vertical-align: middle;
    }
    .doc-table tbody td.amount-cell {
      text-align: ${amountAlign};
      font-variant-numeric: tabular-nums;
      direction: ltr;
      font-weight: 500;
      font-family: 'Inter', 'Cairo', sans-serif;
    }
    .doc-table tbody td.row-num {
      text-align: center;
      color: #94a3b8;
      font-weight: 600;
      width: 30px;
      font-size: 8px;
    }
    .doc-table tfoot {
      background: #f1f5f9;
    }
    .doc-table tfoot td {
      padding: 7px 10px;
      font-size: 9.5px;
      font-weight: 600;
      border-top: 2px solid #94a3b8;
    }

    /* ════════════════════════════════════════════
       CURRENCY SYMBOL IMAGE
    ════════════════════════════════════════════ */
    .ri-currency-img {
      height: 0.85em; width: auto;
      vertical-align: middle; display: inline-block;
      margin: 0 2px;
    }

    /* ════════════════════════════════════════════
       TOTALS SECTION
    ════════════════════════════════════════════ */
    .totals-section {
      margin-top: 10px;
      display: flex;
      justify-content: flex-end;
    }
    .totals-box {
      width: 260px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      overflow: hidden;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 5px 10px;
      font-size: 9.5px;
      border-bottom: 1px solid #f1f5f9;
    }
    .total-row .label { color: #64748b; }
    .total-row .value { font-weight: 600; direction: ltr; font-variant-numeric: tabular-nums; }
    .total-row.grand {
      background: #047857;
      color: white;
      font-size: 11px;
      font-weight: 700;
      padding: 8px 10px;
      border-bottom: none;
    }
    .total-row.grand .label { color: rgba(255,255,255,0.88); }
    .total-row.grand .value { color: white; font-size: 12px; }

    /* ════════════════════════════════════════════
       AMOUNT IN WORDS
    ════════════════════════════════════════════ */
    .amount-words {
      margin-top: 10px;
      padding: 8px 12px;
      background: #fffef5;
      border: 1px solid #fde68a;
      border-radius: 4px;
      font-size: 9px;
    }
    .amount-words-label {
      font-size: 7px; font-weight: 700;
      color: #92400e; text-transform: uppercase;
      letter-spacing: 0.3px; margin-bottom: 2px;
    }
    .amount-words-text {
      color: #78350f; font-weight: 600; line-height: 1.5;
    }

    /* ════════════════════════════════════════════
       BANK INFO
    ════════════════════════════════════════════ */
    .bank-info {
      margin-top: 10px;
      padding: 8px 12px;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 4px;
      font-size: 8.5px;
    }
    .bank-info-title {
      font-weight: 700; color: #0369a1;
      margin-bottom: 4px;
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .bank-info-row {
      display: flex; gap: 12px;
      color: #0c4a6e;
    }
    .bank-info-row span { font-weight: 600; }

    /* ════════════════════════════════════════════
       TERMS
    ════════════════════════════════════════════ */
    .terms-section {
      margin-top: 10px;
      padding: 8px 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 8.5px;
      color: #64748b;
    }
    .terms-title {
      font-weight: 700; color: #334155;
      margin-bottom: 3px;
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    /* ════════════════════════════════════════════
       STAMP & SIGNATURE
    ════════════════════════════════════════════ */
    .signatures-section {
      margin-top: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 20px;
    }
    .stamp-area { text-align: center; }
    .stamp-area img {
      max-width: 100px; max-height: 100px;
      object-fit: contain;
    }
    .signature-box {
      text-align: center; min-width: 140px;
    }
    .signature-line {
      border-top: 1px solid #94a3b8;
      margin-top: 35px;
      padding-top: 4px;
      font-size: 8px; color: #64748b;
    }

    /* ════════════════════════════════════════════
       FOOTER
    ════════════════════════════════════════════ */
    .doc-footer {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      background: #f8fafc;
      border-top: 2px solid #047857;
      padding: 6px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 7px;
      color: #94a3b8;
    }
    .doc-footer .company-info {
      display: flex; gap: 8px; flex-wrap: wrap;
    }
    .doc-footer .page-info { font-weight: 600; }
    .custom-footer img { width: 100%; max-height: 50px; object-fit: contain; }

    /* ════════════════════════════════════════════
       STATUS BADGE
    ════════════════════════════════════════════ */
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.2px;
    }
    .status-draft { background: #fef3c7; color: #92400e; }
    .status-active { background: #d1fae5; color: #065f46; }
    .status-paid { background: #d1fae5; color: #065f46; }
    .status-partial { background: #dbeafe; color: #1e40af; }
    .status-overdue { background: #fee2e2; color: #991b1b; }
    .status-cancelled { background: #f1f5f9; color: #64748b; }

    /* ════════════════════════════════════════════
       RENTAL EQUIPMENT SECTION
    ════════════════════════════════════════════ */
    .rental-equipment-section {
      border: 1px solid #fde68a;
      border-radius: 6px;
      padding: 10px;
      margin: 8px 0;
      background: #fffef5;
    }
    .rental-equipment-section .section-title {
      font-size: 9px; font-weight: 700;
      color: #92400e; margin-bottom: 6px;
      padding-bottom: 4px;
      border-bottom: 1px solid #fde68a;
      ${borderStart}: 3px solid #d97706;
    }
    .rental-equipment-section .info-grid { grid-template-columns: 1fr 1fr 1fr; }
    .rental-equipment-section .info-item {
      ${borderStart}-color: #d97706;
      background: #fffef5;
    }

    /* ════════════════════════════════════════════
       DIVIDER
    ════════════════════════════════════════════ */
    .section-divider {
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 10px 0;
    }

    /* ════════════════════════════════════════════
       PRINT ACTIONS BAR
    ════════════════════════════════════════════ */
    .print-actions {
      position: fixed;
      top: 10px; left: 50%;
      transform: translateX(-50%);
      z-index: 999;
      display: flex; gap: 6px;
      background: white;
      padding: 6px 12px;
      border-radius: 8px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.12);
      border: 1px solid #e2e8f0;
    }
    .print-actions button {
      padding: 7px 18px;
      background: #047857;
      color: white; border: none;
      border-radius: 6px;
      font-size: 12px; font-weight: 600;
      cursor: pointer;
      font-family: ${fontFamily};
      transition: all 0.15s;
    }
    .print-actions button:hover { background: #065f46; }
    .print-actions .close-btn {
      background: #64748b;
    }
    .print-actions .close-btn:hover { background: #475569; }

    /* ════════════════════════════════════════════
       WATERMARK
    ════════════════════════════════════════════ */
    .watermark {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 72px;
      color: rgba(0,0,0,0.025);
      font-weight: 800;
      pointer-events: none;
      white-space: nowrap;
    }
  `
}

// ============ Rental Invoice CSS (Professional ZATCA-Compliant) ============

export function getRentalInvoiceCSS(lang: 'ar' | 'en'): string {
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  const fontFamily = "'Cairo', 'Noto Sans Arabic', 'Inter', sans-serif"
  const textAlign = lang === 'ar' ? 'right' : 'left'
  const amountAlign = lang === 'ar' ? 'left' : 'right'
  const borderStart = lang === 'ar' ? 'border-right' : 'border-left'
  const paddingStart = lang === 'ar' ? 'padding-right' : 'padding-left'

  return `
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${fontFamily};
      font-size: 9.5px;
      color: #1e293b;
      direction: ${dir};
      background: #e2e8f0;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @page {
      size: A4 portrait;
      margin: 10mm;
    }
    @media print {
      body { background: white; font-size: 9px; }
      .page { margin: 0; box-shadow: none; width: 100%; min-height: auto; }
      .no-print { display: none !important; }
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 0;
      margin: 0 auto 16px;
      background: white;
      box-shadow: 0 2px 16px rgba(0,0,0,0.1);
      position: relative;
      overflow: hidden;
    }

    /* ──── RENTAL INVOICE HEADER ──── */
    .ri-header {
      background: linear-gradient(135deg, #064e3b 0%, #065f46 40%, #047857 100%);
      color: white;
      padding: 18px 24px 14px;
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: 14px;
    }
    .ri-header::after {
      content: '';
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg, #b45309, #f59e0b, #b45309);
    }
    .ri-header-logo {
      width: 64px; height: 64px;
      border-radius: 10px;
      background: white;
      padding: 4px;
      flex-shrink: 0;
      object-fit: contain;
    }
    .ri-header-logo-placeholder {
      width: 64px; height: 64px;
      border-radius: 10px;
      background: rgba(255,255,255,0.12);
      display: flex; align-items: center; justify-content: center;
      font-size: 26px; font-weight: 800; color: #f59e0b;
      flex-shrink: 0;
    }
    .ri-header-company { flex: 1; min-width: 0; }
    .ri-header-company-name {
      font-size: 18px; font-weight: 800;
      letter-spacing: 0.3px; line-height: 1.25;
    }
    .ri-header-company-name-en {
      font-size: 10px; opacity: 0.75;
      font-weight: 400; margin-top: 1px;
    }
    .ri-header-details {
      display: flex; flex-wrap: wrap;
      gap: 4px 12px;
      margin-top: 5px;
      font-size: 7.5px; opacity: 0.88;
    }
    .ri-header-details span {
      display: inline-flex; align-items: center; gap: 2px;
      white-space: nowrap;
    }
    .ri-header-title-box {
      flex-shrink: 0; text-align: center;
      background: rgba(255,255,255,0.1);
      border-radius: 8px;
      padding: 8px 16px;
      border: 1px solid rgba(255,255,255,0.15);
      align-self: center;
    }
    .ri-header-title {
      font-size: 13px; font-weight: 700;
      white-space: nowrap;
    }
    .ri-header-title-en {
      font-size: 8px; opacity: 0.75;
      margin-top: 1px;
    }

    /* ──── RENTAL INVOICE BODY ──── */
    .ri-body { padding: 14px 24px 6px; }

    /* ──── INFO SECTION ──── */
    .ri-info-section {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1fr;
      gap: 6px 12px;
      margin: 0 0 10px;
    }
    .ri-info-item {
      padding: 5px 8px;
      background: #f8fafc;
      border-radius: 3px;
      ${borderStart}: 2px solid #047857;
    }
    .ri-info-label {
      font-size: 6.5px; color: #94a3b8;
      text-transform: uppercase; letter-spacing: 0.3px;
      margin-bottom: 1px;
    }
    .ri-info-value {
      font-size: 9.5px; font-weight: 600; color: #1e293b;
    }

    /* ──── RENTAL DATA ──── */
    .ri-rental-data {
      margin: 10px 0;
      padding: 8px 10px;
      background: #fffef5;
      border: 1px solid #fde68a;
      border-radius: 4px;
    }
    .ri-rental-data-title {
      font-size: 8px; font-weight: 700;
      color: #92400e; text-transform: uppercase;
      letter-spacing: 0.3px; margin-bottom: 6px;
      padding-bottom: 3px;
      border-bottom: 1px solid #fde68a;
    }
    .ri-rental-data-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 4px 12px;
    }
    .ri-rental-data-item {
      padding: 3px 6px;
      background: #fffefb;
      border-radius: 2px;
    }
    .ri-rental-data-label {
      font-size: 6.5px; color: #94a3b8;
      text-transform: uppercase; letter-spacing: 0.3px;
    }
    .ri-rental-data-value {
      font-size: 9px; font-weight: 600; color: #1e293b;
    }

    /* ──── PARTIES ──── */
    .ri-parties {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin: 10px 0;
    }
    .ri-party-card {
      border: 1px solid #e2e8f0;
      border-radius: 5px;
      padding: 8px 10px;
      background: #fafbfc;
    }
    .ri-party-title {
      font-size: 7.5px; font-weight: 700;
      color: #047857; text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-bottom: 5px;
      padding-bottom: 3px;
      border-bottom: 1px solid #e2e8f0;
    }
    .ri-party-row {
      display: flex; justify-content: space-between;
      margin: 2px 0; font-size: 9px;
    }
    .ri-party-row .label { color: #64748b; }
    .ri-party-row .value { font-weight: 600; color: #1e293b; }

    /* ──── TABLE ──── */
    .ri-table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
      border: 1px solid #cbd5e1;
      font-size: 9px;
    }
    .ri-table thead {
      background: #047857;
    }
    .ri-table thead th {
      padding: 7px 8px;
      color: white;
      font-size: 7.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.2px;
      text-align: ${textAlign};
      border-bottom: 2px solid #065f46;
    }
    .ri-table thead th.amount-header {
      text-align: ${amountAlign};
    }
    .ri-table tbody tr {
      border-bottom: 1px solid #f1f5f9;
    }
    .ri-table tbody tr:nth-child(even) { background: #f8fafc; }
    .ri-table tbody tr:hover { background: #ecfdf5; }
    .ri-table tbody td {
      padding: 5px 8px;
      font-size: 9px;
      text-align: ${textAlign};
      vertical-align: middle;
    }
    .ri-table tbody td.amount-cell {
      text-align: ${amountAlign};
      font-variant-numeric: tabular-nums;
      direction: ltr;
      font-weight: 500;
      font-family: 'Inter', 'Cairo', sans-serif;
    }
    .ri-table tbody td.row-num {
      text-align: center; color: #94a3b8;
      font-weight: 600; width: 28px; font-size: 8px;
    }

    /* ──── TOTALS + QR WRAPPER ──── */
    .ri-totals-qr-wrapper {
      display: flex;
      gap: 12px;
      margin-top: 10px;
      align-items: flex-start;
    }
    .ri-totals-box {
      flex: 1;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      overflow: hidden;
    }
    .ri-total-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 10px;
      font-size: 9px;
      border-bottom: 1px solid #f1f5f9;
    }
    .ri-total-row .label { color: #64748b; }
    .ri-total-row .value { font-weight: 600; direction: ltr; font-variant-numeric: tabular-nums; }
    .ri-total-row.grand {
      background: #047857;
      color: white;
      font-size: 11px; font-weight: 700;
      padding: 7px 10px;
      border-bottom: none;
    }
    .ri-total-row.grand .label { color: rgba(255,255,255,0.88); }
    .ri-total-row.grand .value { color: white; font-size: 12px; }

    /* ──── QR BOX ──── */
    .ri-qr-box {
      width: 110px; flex-shrink: 0;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 6px;
      text-align: center;
      background: #fafbfc;
    }
    .ri-qr-image {
      width: 90px; height: 90px;
      display: block; margin: 0 auto 4px;
      object-fit: contain;
    }
    .ri-qr-label {
      font-size: 5.5px; color: #94a3b8;
      line-height: 1.3;
    }

    /* ──── AMOUNT IN WORDS ──── */
    .ri-amount-words {
      margin-top: 8px;
      padding: 6px 10px;
      background: #fffef5;
      border: 1px solid #fde68a;
      border-radius: 4px;
    }
    .ri-amount-words-label {
      font-size: 7px; font-weight: 700;
      color: #92400e; text-transform: uppercase;
      letter-spacing: 0.3px; margin-bottom: 2px;
    }
    .ri-amount-words-text {
      font-size: 9px; color: #78350f;
      font-weight: 600; line-height: 1.4;
    }
    .ri-amount-words-en {
      font-size: 7.5px; color: #a16207;
      font-weight: 400; margin-top: 1px;
    }

    /* ──── BANK INFO ──── */
    .ri-bank {
      margin-top: 8px;
      padding: 8px 10px;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 4px;
    }
    .ri-bank-title {
      font-size: 7.5px; font-weight: 700;
      color: #0369a1; text-transform: uppercase;
      letter-spacing: 0.3px; margin-bottom: 4px;
    }
    .ri-bank-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 4px 12px;
    }
    .ri-bank-item-label {
      font-size: 6.5px; color: #94a3b8;
      text-transform: uppercase; letter-spacing: 0.3px;
    }
    .ri-bank-item-value {
      font-size: 9px; font-weight: 600; color: #0c4a6e;
    }

    /* ──── SIGNATURES ──── */
    .ri-signatures {
      margin-top: 16px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    .ri-sign-box {
      text-align: center;
      padding: 8px;
      border: 1px dashed #cbd5e1;
      border-radius: 4px;
      min-height: 70px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }
    .stamp-img {
      max-width: 80px; max-height: 60px;
      object-fit: contain; margin: 0 auto 4px;
    }
    .sign-label {
      font-size: 7px; color: #64748b;
      font-weight: 600; margin-top: auto;
      border-top: 1px solid #e2e8f0;
      padding-top: 4px;
    }

    /* ──── TERMS ──── */
    .ri-terms {
      margin-top: 8px;
      padding: 6px 10px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 8px; color: #64748b;
    }
    .ri-terms-title {
      font-size: 7.5px; font-weight: 700;
      color: #334155; margin-bottom: 3px;
      text-transform: uppercase; letter-spacing: 0.3px;
    }

    /* ──── RENTAL INVOICE FOOTER ──── */
    .ri-footer {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      background: #f8fafc;
      border-top: 2px solid #047857;
      padding: 5px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 6.5px;
      color: #94a3b8;
    }
    .ri-footer .company-info {
      display: flex; gap: 8px; flex-wrap: wrap;
    }

    /* ──── PRINT ACTIONS ──── */
    .ri-print-actions {
      position: fixed;
      top: 10px; left: 50%;
      transform: translateX(-50%);
      z-index: 999;
      display: flex; gap: 5px;
      background: white;
      padding: 5px 10px;
      border-radius: 8px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.12);
      border: 1px solid #e2e8f0;
    }
    .ri-btn-print, .ri-btn-jpg, .ri-btn-png, .ri-btn-close {
      padding: 6px 14px;
      color: white; border: none;
      border-radius: 5px;
      font-size: 11px; font-weight: 600;
      cursor: pointer;
      font-family: ${fontFamily};
      transition: all 0.15s;
    }
    .ri-btn-print { background: #047857; }
    .ri-btn-print:hover { background: #065f46; }
    .ri-btn-jpg { background: #0369a1; }
    .ri-btn-jpg:hover { background: #075985; }
    .ri-btn-png { background: #4338ca; }
    .ri-btn-png:hover { background: #3730a3; }
    .ri-btn-close { background: #64748b; }
    .ri-btn-close:hover { background: #475569; }
    .ri-export-loading { opacity: 0.6; cursor: wait; }

    .ri-custom-header img { width: 100%; max-height: 90px; object-fit: contain; }
    .ri-custom-footer img { width: 100%; max-height: 50px; object-fit: contain; }
  `
}

// ============ Accounting CSS ============

export function getAccountingCSS(lang: 'ar' | 'en'): string {
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  const fontFamily = "'Cairo', 'Noto Sans Arabic', 'Inter', sans-serif"
  const textAlign = lang === 'ar' ? 'right' : 'left'
  const amountAlign = lang === 'ar' ? 'left' : 'right'

  return `
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${fontFamily};
      font-size: 10px;
      color: #1e293b;
      direction: ${dir};
      background: #e2e8f0;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @page {
      size: A4 portrait;
      margin: 12mm 10mm;
    }
    @media print {
      body { background: white; }
      .page { margin: 0; box-shadow: none; width: 100%; min-height: auto; }
      .no-print { display: none !important; }
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 0;
      margin: 0 auto 16px;
      background: white;
      box-shadow: 0 1px 12px rgba(0,0,0,0.08);
      position: relative;
      overflow: hidden;
    }

    /* ──── ACCOUNTING HEADER ──── */
    .acct-header {
      background: white;
      border-bottom: 3px solid #047857;
      padding: 18px 24px 14px;
      text-align: center;
    }
    .acct-header-company {
      font-size: 16px; font-weight: 800;
      color: #1e293b; margin-bottom: 2px;
    }
    .acct-header-title {
      font-size: 14px; font-weight: 700;
      color: #047857; margin-top: 6px;
    }
    .acct-header-subtitle {
      font-size: 9px; color: #64748b;
      margin-top: 2px;
    }

    /* ──── BODY ──── */
    .doc-body { padding: 14px 24px 8px; }

    /* ──── SECTION TITLE ──── */
    .section-title {
      font-size: 9px; font-weight: 700; color: #047857;
      text-transform: uppercase; letter-spacing: 0.4px;
      margin: 12px 0 6px;
      padding-bottom: 3px;
      border-bottom: 1px solid #d1fae5;
    }

    /* ──── INFO GRID ──── */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px 14px;
      margin: 6px 0;
    }
    .info-grid-3 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 5px 14px;
      margin: 6px 0;
    }
    .info-item {
      padding: 4px 8px;
      background: #f8fafc;
      border-radius: 3px;
      ${lang === 'ar' ? 'border-right' : 'border-left'}: 2px solid #047857;
    }
    .info-label {
      font-size: 7px; color: #94a3b8;
      text-transform: uppercase; letter-spacing: 0.3px;
      margin-bottom: 1px;
    }
    .info-value {
      font-size: 10px; font-weight: 600; color: #1e293b;
    }

    /* ──── TABLE ──── */
    .doc-table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
      border: 1px solid #cbd5e1;
      font-size: 9px;
    }
    .doc-table thead {
      background: #047857;
    }
    .doc-table thead th {
      padding: 7px 8px;
      color: white;
      font-size: 7.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.2px;
      text-align: ${textAlign};
      border-bottom: 2px solid #065f46;
    }
    .doc-table thead th.amount-header {
      text-align: ${amountAlign};
    }
    .doc-table tbody tr {
      border-bottom: 1px solid #f1f5f9;
    }
    .doc-table tbody tr:nth-child(even) { background: #f8fafc; }
    .doc-table tbody tr:hover { background: #ecfdf5; }
    .doc-table tbody td {
      padding: 5px 8px;
      font-size: 9px;
      text-align: ${textAlign};
      vertical-align: middle;
    }
    .doc-table tbody td.amount-cell {
      text-align: ${amountAlign};
      font-variant-numeric: tabular-nums;
      direction: ltr;
      font-weight: 500;
      font-family: 'Inter', 'Cairo', sans-serif;
    }
    .doc-table tbody td.row-num {
      text-align: center; color: #94a3b8;
      font-weight: 600; width: 28px; font-size: 8px;
    }
    .doc-table tfoot {
      background: #f1f5f9;
    }
    .doc-table tfoot td {
      padding: 6px 8px;
      font-size: 9px;
      font-weight: 600;
      border-top: 2px solid #94a3b8;
    }

    /* ──── PARTIES ──── */
    .parties-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin: 8px 0;
    }
    .party-card {
      border: 1px solid #e2e8f0;
      border-radius: 5px;
      padding: 8px 10px;
      background: #fafbfc;
    }
    .party-card-title {
      font-size: 7.5px; font-weight: 700;
      color: #047857; text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-bottom: 5px; padding-bottom: 3px;
      border-bottom: 1px solid #e2e8f0;
    }
    .party-card-row {
      display: flex; justify-content: space-between;
      margin: 2px 0; font-size: 9px;
    }
    .party-card-row .label { color: #64748b; }
    .party-card-row .value { font-weight: 600; color: #1e293b; }

    /* ──── SIGNATURES ──── */
    .signatures-section {
      margin-top: 18px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
    }
    .stamp-area { text-align: center; }
    .stamp-area img { max-width: 90px; max-height: 90px; object-fit: contain; }
    .signature-box { text-align: center; min-width: 130px; }
    .signature-line {
      border-top: 1px solid #94a3b8;
      margin-top: 30px; padding-top: 3px;
      font-size: 7.5px; color: #64748b;
    }

    /* ──── TOTALS ──── */
    .totals-section {
      margin-top: 8px;
      display: flex;
      justify-content: flex-end;
    }
    .totals-box {
      width: 250px;
      border: 1px solid #cbd5e1;
      border-radius: 3px;
      overflow: hidden;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 8px;
      font-size: 9px;
      border-bottom: 1px solid #f1f5f9;
    }
    .total-row .label { color: #64748b; }
    .total-row .value { font-weight: 600; direction: ltr; font-variant-numeric: tabular-nums; }
    .total-row.grand {
      background: #047857; color: white;
      font-size: 10px; font-weight: 700;
      padding: 6px 8px; border-bottom: none;
    }
    .total-row.grand .label { color: rgba(255,255,255,0.88); }
    .total-row.grand .value { color: white; font-size: 11px; }

    /* ──── AMOUNT IN WORDS ──── */
    .amount-words {
      margin-top: 8px;
      padding: 6px 10px;
      background: #fffef5;
      border: 1px solid #fde68a;
      border-radius: 3px;
    }
    .amount-words-label {
      font-size: 7px; font-weight: 700;
      color: #92400e; text-transform: uppercase;
      letter-spacing: 0.3px; margin-bottom: 2px;
    }
    .amount-words-text {
      font-size: 9px; color: #78350f;
      font-weight: 600; line-height: 1.4;
    }

    /* ──── BANK INFO ──── */
    .bank-info {
      margin-top: 8px;
      padding: 6px 10px;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 3px;
      font-size: 8px;
    }
    .bank-info-title {
      font-weight: 700; color: #0369a1;
      margin-bottom: 3px;
      font-size: 7.5px; text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .bank-info-row {
      display: flex; gap: 10px;
      color: #0c4a6e;
    }
    .bank-info-row span { font-weight: 600; }

    /* ──── TERMS ──── */
    .terms-section {
      margin-top: 8px;
      padding: 6px 10px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 3px;
      font-size: 8px; color: #64748b;
    }
    .terms-title {
      font-weight: 700; color: #334155;
      margin-bottom: 2px;
      font-size: 7.5px; text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    /* ──── STATUS BADGE ──── */
    .status-badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 8px;
      font-size: 7.5px; font-weight: 700;
    }
    .status-draft { background: #fef3c7; color: #92400e; }
    .status-active { background: #d1fae5; color: #065f46; }
    .status-paid { background: #d1fae5; color: #065f46; }
    .status-partial { background: #dbeafe; color: #1e40af; }
    .status-overdue { background: #fee2e2; color: #991b1b; }
    .status-cancelled { background: #f1f5f9; color: #64748b; }

    /* ──── RENTAL EQUIPMENT SECTION ──── */
    .rental-equipment-section {
      border: 1px solid #fde68a;
      border-radius: 4px;
      padding: 8px;
      margin: 8px 0;
      background: #fffef5;
    }
    .rental-equipment-section .section-title {
      font-size: 8px; font-weight: 700;
      color: #92400e; margin-bottom: 4px;
      padding-bottom: 3px;
      border-bottom: 1px solid #fde68a;
    }
    .rental-equipment-section .info-grid { grid-template-columns: 1fr 1fr 1fr; }
    .rental-equipment-section .info-item {
      ${lang === 'ar' ? 'border-right' : 'border-left'}-color: #d97706;
      background: #fffef5;
    }

    /* ──── DIVIDER ──── */
    .section-divider { border: none; border-top: 1px solid #e2e8f0; margin: 8px 0; }

    /* ──── FOOTER ──── */
    .doc-footer {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      background: #f8fafc;
      border-top: 2px solid #047857;
      padding: 5px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 6.5px; color: #94a3b8;
    }
    .doc-footer .company-info { display: flex; gap: 8px; flex-wrap: wrap; }
    .doc-footer .page-info { font-weight: 600; }

    /* ──── CURRENCY ──── */
    .ri-currency-img { height: 0.85em; width: auto; vertical-align: middle; display: inline-block; margin: 0 2px; }

    /* ──── PRINT ACTIONS ──── */
    .print-actions {
      position: fixed;
      top: 10px; left: 50%;
      transform: translateX(-50%);
      z-index: 999;
      display: flex; gap: 5px;
      background: white;
      padding: 5px 10px;
      border-radius: 8px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.12);
      border: 1px solid #e2e8f0;
    }
    .print-actions button {
      padding: 6px 16px;
      background: #047857; color: white;
      border: none; border-radius: 5px;
      font-size: 11px; font-weight: 600;
      cursor: pointer;
      font-family: ${fontFamily};
    }
    .print-actions button:hover { background: #065f46; }
    .print-actions .close-btn { background: #64748b; }
    .print-actions .close-btn:hover { background: #475569; }
  `
}
