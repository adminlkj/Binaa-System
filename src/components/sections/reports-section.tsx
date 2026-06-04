'use client'

import React from 'react'
import {
  Building2, Wallet, Wrench, ShoppingCart, Package, Users,
} from 'lucide-react'
import {
  useAppStore,
  type SubModuleKey,
  type Lang,
} from '@/stores/app-store'
import { SectionLayout } from '@/components/sections/section-layout'
import { ReportsModule } from '@/components/modules/reports'

// ============ Tab Definitions ============

const reportsTabs: { key: SubModuleKey; icon: React.ElementType }[] = [
  { key: 'report-projects', icon: Building2 },
  { key: 'report-finance', icon: Wallet },
  { key: 'report-equipment', icon: Wrench },
  { key: 'report-purchases', icon: ShoppingCart },
  { key: 'report-inventory', icon: Package },
  { key: 'report-hr', icon: Users },
]

// ============ Report Type Mapping ============
// Maps SubModuleKey to the corresponding report type used in ReportsModule

const reportTypeMap: Record<string, string> = {
  'report-projects': 'projects',
  'report-finance': 'finance',
  'report-equipment': 'equipment',
  'report-purchases': 'purchases',
  'report-inventory': 'inventory',
  'report-hr': 'hr',
}

// ============ Main Component ============

export function ReportsSection() {
  const { activeSubModule, lang } = useAppStore()

  // For now, all report tabs render the same ReportsModule
  // The ReportsModule itself handles different report types internally
  // The reportTypeMap can be used for future deep-linking into specific reports
  void reportTypeMap // suppress unused warning - will be used for deep linking
  void lang // used via store

  return (
    <SectionLayout
      title={{ ar: 'التقارير', en: 'Reports' }}
      subtitle={{
        ar: 'تقارير شاملة للمشاريع والمالية والمعدات والمشتريات والمخزون والموارد البشرية',
        en: 'Comprehensive reports for projects, finance, equipment, purchases, inventory, and HR',
      }}
      tabs={reportsTabs}
      showPrintExport={false}
    >
      <ReportsModule />
    </SectionLayout>
  )
}
