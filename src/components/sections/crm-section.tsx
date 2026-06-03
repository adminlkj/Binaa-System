'use client'

import React from 'react'
import {
  UserCircle, Lightbulb, FileBarChart, Phone,
} from 'lucide-react'
import {
  useAppStore,
  type SubModuleKey,
  type Lang,
} from '@/stores/app-store'
import { SectionLayout } from '@/components/sections/section-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ClientsModule } from '@/components/modules/clients'
import { SalesModule } from '@/components/modules/sales'

// ============ Tab Definitions ============

const crmTabs: { key: SubModuleKey; icon: React.ElementType }[] = [
  { key: 'clients', icon: UserCircle },
  { key: 'opportunities', icon: Lightbulb },
  { key: 'quotations', icon: FileBarChart },
  { key: 'follow-ups', icon: Phone },
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
  'opportunities': {
    title: { ar: 'الفرص', en: 'Opportunities' },
    description: {
      ar: 'تتبع فرص الأعمال والمشاريع المحتملة، مراحل البيع، واحتمالات الإغلاق',
      en: 'Track business opportunities and potential projects, sales stages, and closing probabilities',
    },
  },
  'follow-ups': {
    title: { ar: 'المتابعة', en: 'Follow-ups' },
    description: {
      ar: 'إدارة مهام المتابعة مع العملاء، المكالمات، الاجتماعات، والتواصل',
      en: 'Manage follow-up tasks with clients, calls, meetings, and communications',
    },
  },
}

// ============ Main Component ============

export function CRMSection() {
  const { activeSubModule, lang } = useAppStore()

  const renderTabContent = () => {
    switch (activeSubModule) {
      case 'clients':
        return <ClientsModule />
      case 'opportunities':
        return (
          <TabPlaceholder
            icon={Lightbulb}
            title={placeholderData['opportunities'].title}
            description={placeholderData['opportunities'].description}
            lang={lang}
          />
        )
      case 'quotations':
        return <SalesModule />
      case 'follow-ups':
        return (
          <TabPlaceholder
            icon={Phone}
            title={placeholderData['follow-ups'].title}
            description={placeholderData['follow-ups'].description}
            lang={lang}
          />
        )
      default:
        return <ClientsModule />
    }
  }

  return (
    <SectionLayout
      title={{ ar: 'إدارة العلاقات', en: 'CRM' }}
      subtitle={{
        ar: 'إدارة العملاء والفرص والعروض والمتابعة',
        en: 'Manage clients, opportunities, quotations, and follow-ups',
      }}
      tabs={crmTabs}
      showPrintExport={false}
    >
      {renderTabContent()}
    </SectionLayout>
  )
}
