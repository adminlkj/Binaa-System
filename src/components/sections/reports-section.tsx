'use client'

import React from 'react'
import {
  Building2, Wallet, Truck, ShoppingCart, Users, Percent, BookOpen,
} from 'lucide-react'
import {
  useAppStore,
  type SubModuleKey,
  type Lang,
} from '@/stores/app-store'
import { SectionLayout } from '@/components/sections/section-layout'
import { ReportsModule } from '@/components/modules/reports'

// ============ Tab Definitions ============

const reportsTabs: { key: SubModuleKey; icon: React.ElementType; label: { ar: string; en: string } }[] = [
  { key: 'report-statements', icon: BookOpen, label: { ar: 'القوائم المالية', en: 'Financial Statements' } },
  { key: 'report-projects', icon: Building2, label: { ar: 'تقارير المشاريع', en: 'Project Reports' } },
  { key: 'report-rental', icon: Truck, label: { ar: 'تقارير التأجير', en: 'Rental Reports' } },
  { key: 'report-finance', icon: Wallet, label: { ar: 'التقارير المالية', en: 'Financial Reports' } },
  { key: 'report-purchases', icon: ShoppingCart, label: { ar: 'تقارير المشتريات', en: 'Purchase Reports' } },
  { key: 'report-clients', icon: Users, label: { ar: 'تقارير العملاء', en: 'Client Reports' } },
  { key: 'report-tax', icon: Percent, label: { ar: 'تقارير الضريبة', en: 'Tax Reports' } },
]

// ============ Main Component ============

export function ReportsSection() {
  return (
    <SectionLayout
      title={{ ar: 'التقارير', en: 'Reports' }}
      subtitle={{
        ar: 'تقارير شاملة للمشاريع والتأجير والمالية والمشتريات والعملاء والضريبة',
        en: 'Comprehensive reports for projects, rental, finance, purchases, clients, and tax',
      }}
      tabs={reportsTabs}
      showPrintExport={false}
    >
      <ReportsModule />
    </SectionLayout>
  )
}
