'use client'

import React from 'react'
import {
  Truck, Users, ShoppingCart, ClipboardList,
  PackageCheck, FileText,
} from 'lucide-react'
import {
  useAppStore,
  type SubModuleKey,
  type Lang,
} from '@/stores/app-store'
import { SectionLayout } from '@/components/sections/section-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SuppliersModule } from '@/components/modules/suppliers'
import { SubcontractorsModule } from '@/components/modules/subcontractors'
import { PurchaseOrdersModule } from '@/components/modules/purchase-orders'
import { SupplierInvoicesModule } from '@/components/modules/supplier-invoices'

// ============ Tab Definitions ============

const supplyChainTabs: { key: SubModuleKey; icon: React.ElementType }[] = [
  { key: 'suppliers', icon: Truck },
  { key: 'subcontractors', icon: Users },
  { key: 'purchase-requests', icon: ShoppingCart },
  { key: 'purchase-orders', icon: ClipboardList },
  { key: 'goods-receipt', icon: PackageCheck },
  { key: 'supplier-invoices', icon: FileText },
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
  'purchase-requests': {
    title: { ar: 'طلبات الشراء', en: 'Purchase Requests' },
    description: {
      ar: 'إنشاء ومتابعة طلبات الشراء، اعتماد الطلبات وتحويلها لأوامر شراء',
      en: 'Create and track purchase requests, approve requests and convert to purchase orders',
    },
  },
  'goods-receipt': {
    title: { ar: 'الاستلام', en: 'Goods Receipt' },
    description: {
      ar: 'تسجيل استلام البضائع والمواد، مطابقة الكميات مع أوامر الشراء',
      en: 'Record goods and materials receipt, match quantities with purchase orders',
    },
  },
}

// ============ Main Component ============

export function SupplyChainSection() {
  const { activeSubModule, lang } = useAppStore()

  const renderTabContent = () => {
    switch (activeSubModule) {
      case 'suppliers':
        return <SuppliersModule />
      case 'subcontractors':
        return <SubcontractorsModule />
      case 'purchase-requests':
        return (
          <TabPlaceholder
            icon={ShoppingCart}
            title={placeholderData['purchase-requests'].title}
            description={placeholderData['purchase-requests'].description}
            lang={lang}
          />
        )
      case 'purchase-orders':
        return <PurchaseOrdersModule />
      case 'goods-receipt':
        return (
          <TabPlaceholder
            icon={PackageCheck}
            title={placeholderData['goods-receipt'].title}
            description={placeholderData['goods-receipt'].description}
            lang={lang}
          />
        )
      case 'supplier-invoices':
        return <SupplierInvoicesModule />
      default:
        return <SuppliersModule />
    }
  }

  return (
    <SectionLayout
      title={{ ar: 'سلسلة التوريد', en: 'Supply Chain' }}
      subtitle={{
        ar: 'إدارة الموردين والمقاولين الفرعيين والمشتريات',
        en: 'Manage suppliers, subcontractors, and procurement',
      }}
      tabs={supplyChainTabs}
      showPrintExport={false}
    >
      {renderTabContent()}
    </SectionLayout>
  )
}
