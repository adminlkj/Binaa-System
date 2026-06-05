'use client'

import React from 'react'
import { LayoutDashboard } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAppStore } from '@/stores/app-store'
import { ModuleLayout } from '@/components/shared/module-layout'

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

// Keep old export for backward compatibility
export function ModulePlaceholder({ moduleKey }: { moduleKey: string }) {
  return <PlaceholderModule />
}

/**
 * PlaceholderModule - Simple placeholder with empty state for fallback
 * Shows icon + "Coming Soon" message
 */
export function PlaceholderModule() {
  const { lang } = useAppStore()

  return (
    <ModuleLayout
      title={{ ar: 'قريباً', en: 'Coming Soon' }}
      subtitle={{ ar: 'هذا القسم قيد التطوير', en: 'This section is under development' }}
    >
      <div className="flex h-64 items-center justify-center">
        <Card className="w-full max-w-md border border-gray-200 bg-gray-50">
          <CardHeader className="items-center text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-gray-100">
              <LayoutDashboard className="size-8 text-gray-400" />
            </div>
            <CardTitle className="mt-4 text-xl">{t('قريباً', 'Coming Soon', lang)}</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground leading-relaxed">
              {t('هذا القسم قيد التطوير وسيكون متاحاً قريباً', 'This section is under development and will be available soon', lang)}
            </p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2">
              <div className="size-2 rounded-full text-gray-500 bg-current animate-pulse" />
              <span className="text-sm font-medium text-gray-500">
                {t('قيد التطوير', 'Under Development', lang)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </ModuleLayout>
  )
}
