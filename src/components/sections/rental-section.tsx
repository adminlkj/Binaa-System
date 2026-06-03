'use client'

import React from 'react'
import {
  FileSignature, Tractor, Truck, Clock, Receipt,
} from 'lucide-react'
import {
  useAppStore,
  type SubModuleKey,
  type Lang,
} from '@/stores/app-store'
import { SectionLayout } from '@/components/sections/section-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ContractsModule } from '@/components/modules/contracts'
import { DeliveryOrdersModule } from '@/components/modules/delivery-orders'
import { TimesheetsModule } from '@/components/modules/timesheets'
import { RentalInvoicesModule } from '@/components/modules/rental-invoices'

// ============ Tab Definitions ============

const rentalTabs: { key: SubModuleKey; icon: React.ElementType }[] = [
  { key: 'rental-contracts', icon: FileSignature },
  { key: 'rental-equipment', icon: Tractor },
  { key: 'rental-delivery-orders', icon: Truck },
  { key: 'rental-hours', icon: Clock },
  { key: 'rental-invoices', icon: Receipt },
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
  'rental-equipment': {
    title: { ar: 'المعدات المؤجرة', en: 'Rented Equipment' },
    description: {
      ar: 'عرض وإدارة المعدات المؤجرة، حالتها، مواقعها، وتفاصيل التأجير',
      en: 'View and manage rented equipment, their status, locations, and rental details',
    },
  },
}

// ============ Main Component ============

export function RentalSection() {
  const { activeSubModule, lang } = useAppStore()

  const renderTabContent = () => {
    switch (activeSubModule) {
      case 'rental-contracts':
        return <ContractsModule />
      case 'rental-equipment':
        return (
          <TabPlaceholder
            icon={Tractor}
            title={placeholderData['rental-equipment'].title}
            description={placeholderData['rental-equipment'].description}
            lang={lang}
          />
        )
      case 'rental-delivery-orders':
        return <DeliveryOrdersModule />
      case 'rental-hours':
        return <TimesheetsModule />
      case 'rental-invoices':
        return <RentalInvoicesModule />
      default:
        return <ContractsModule />
    }
  }

  return (
    <SectionLayout
      title={{ ar: 'التأجير', en: 'Rental' }}
      subtitle={{
        ar: 'إدارة عقود التأجير وأوامر التوصيل والفواتير',
        en: 'Manage rental contracts, delivery orders, and invoices',
      }}
      tabs={rentalTabs}
      showPrintExport={false}
    >
      {renderTabContent()}
    </SectionLayout>
  )
}
