'use client'

import React from 'react'
import {
  Warehouse, Package, ArrowLeftRight, ClipboardCheck, ArrowRightLeft,
} from 'lucide-react'
import {
  useAppStore,
  type SubModuleKey,
  type Lang,
} from '@/stores/app-store'
import { SectionLayout } from '@/components/sections/section-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { InventoryModule } from '@/components/modules/inventory'

// ============ Tab Definitions ============

const warehousesTabs: { key: SubModuleKey; icon: React.ElementType }[] = [
  { key: 'warehouse-list', icon: Warehouse },
  { key: 'warehouse-items', icon: Package },
  { key: 'warehouse-movements', icon: ArrowLeftRight },
  { key: 'warehouse-inventory', icon: ClipboardCheck },
  { key: 'warehouse-transfers', icon: ArrowRightLeft },
]

// ============ Placeholder Component ============

function TabPlaceholder({
  icon: Icon,
  title,
  description,
  lang,
}: {
  icon: React.ElementType
  title: { ar: string; en: string }
  description: { ar: string; en: string }
  lang: Lang
}) {
  return (
    <Card className="border-dashed border-2 border-gray-200 bg-gray-50/50">
      <CardContent className="flex flex-col items-center gap-4 py-16">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-gray-100">
          <Icon className="size-8 text-gray-400" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold text-gray-700">{title[lang]}</h3>
          <p className="text-sm text-muted-foreground max-w-md">{description[lang]}</p>
        </div>
        <Badge variant="outline" className="text-gray-500 border-gray-300">
          {lang === 'ar' ? 'قريباً' : 'Coming Soon'}
        </Badge>
      </CardContent>
    </Card>
  )
}

// ============ Placeholder Data ============

const placeholderData: Record<string, {
  title: { ar: string; en: string }
  description: { ar: string; en: string }
}> = {
  'warehouse-list': {
    title: { ar: 'المخازن', en: 'Warehouses' },
    description: {
      ar: 'إدارة المخازن والمستودعات، تعريف المواقع والأنواع والسعات التخزينية',
      en: 'Manage warehouses and storage locations, define types and storage capacities',
    },
  },
  'warehouse-movements': {
    title: { ar: 'الحركات', en: 'Warehouse Movements' },
    description: {
      ar: 'تسجيل ومتابعة حركات المخزون: الإدخال، الإخراج، والتحويل بين المخازن',
      en: 'Record and track stock movements: receipts, issues, and inter-warehouse transfers',
    },
  },
  'warehouse-inventory': {
    title: { ar: 'الجرد', en: 'Physical Inventory' },
    description: {
      ar: 'إجراء عمليات الجرد الدوري، مقارنة الكميات الفعلية بالدفترية، ومعالجة الفروقات',
      en: 'Conduct periodic inventory counts, compare actual vs book quantities, and process adjustments',
    },
  },
  'warehouse-transfers': {
    title: { ar: 'التحويلات', en: 'Warehouse Transfers' },
    description: {
      ar: 'تحويل المواد والأصناف بين المخازن المختلفة، ومتابعة حالة التحويلات',
      en: 'Transfer materials and items between different warehouses, track transfer statuses',
    },
  },
}

// ============ Main Component ============

export function WarehousesSection() {
  const { activeSubModule, lang } = useAppStore()

  const renderTabContent = () => {
    switch (activeSubModule) {
      case 'warehouse-list':
        return (
          <TabPlaceholder
            icon={Warehouse}
            title={placeholderData['warehouse-list'].title}
            description={placeholderData['warehouse-list'].description}
            lang={lang}
          />
        )
      case 'warehouse-items':
        return <InventoryModule />
      case 'warehouse-movements':
        return (
          <TabPlaceholder
            icon={ArrowLeftRight}
            title={placeholderData['warehouse-movements'].title}
            description={placeholderData['warehouse-movements'].description}
            lang={lang}
          />
        )
      case 'warehouse-inventory':
        return (
          <TabPlaceholder
            icon={ClipboardCheck}
            title={placeholderData['warehouse-inventory'].title}
            description={placeholderData['warehouse-inventory'].description}
            lang={lang}
          />
        )
      case 'warehouse-transfers':
        return (
          <TabPlaceholder
            icon={ArrowRightLeft}
            title={placeholderData['warehouse-transfers'].title}
            description={placeholderData['warehouse-transfers'].description}
            lang={lang}
          />
        )
      default:
        return <InventoryModule />
    }
  }

  return (
    <SectionLayout
      title={{ ar: 'المخازن', en: 'Warehouses' }}
      subtitle={{
        ar: 'إدارة المخازن والمخزون والحركات والجرد',
        en: 'Manage warehouses, inventory, movements, and stock counts',
      }}
      tabs={warehousesTabs}
      showPrintExport={false}
    >
      {renderTabContent()}
    </SectionLayout>
  )
}
