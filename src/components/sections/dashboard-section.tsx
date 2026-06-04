'use client'

import React from 'react'
import { useAppStore } from '@/stores/app-store'
import { DashboardModule } from '@/components/modules/dashboard'

export function DashboardSection() {
  const { lang } = useAppStore()

  return (
    <div className="space-y-0">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">
          {lang === 'ar' ? 'لوحة التحكم' : 'Dashboard'}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {lang === 'ar' ? 'نظرة عامة على أداء المؤسسة والمشاريع' : 'Overview of organization and project performance'}
        </p>
      </div>
      <DashboardModule />
    </div>
  )
}
