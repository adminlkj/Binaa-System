'use client'

import React from 'react'
import { ModuleLayout } from '@/components/shared/module-layout'
import { useAppStore } from '@/stores/app-store'
import { CalendarRange } from 'lucide-react'

export function FinancialYearsModule() {
  const { lang } = useAppStore()
  return (
    <ModuleLayout
      title={{ ar: 'السنوات المالية', en: 'Financial Years' }}
      subtitle={{ ar: 'جاري التحميل...', en: 'Loading...' }}
      actions={null}
    >
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <CalendarRange className="size-8 text-teal-600" />
          <span className="text-sm text-muted-foreground">
            {lang === 'ar' ? 'جاري تحميل شاشة السنوات المالية...' : 'Loading financial years screen...'}
          </span>
        </div>
      </div>
    </ModuleLayout>
  )
}
