'use client'

import { CreditCard, Plus, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/app-store'

export function ServiceInvoicesModule() {
  const { lang } = useAppStore()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {lang === 'ar' ? 'فواتير الخدمات' : 'Service Invoices'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {lang === 'ar' ? 'إدارة فواتير الخدمات المقدمة للعملاء' : 'Manage service invoices for clients'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" title={lang === 'ar' ? 'تحديث' : 'Refresh'}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="size-4" /> {lang === 'ar' ? 'فاتورة خدمة جديدة' : 'New Service Invoice'}
          </Button>
        </div>
      </div>

      <Card className="border-teal-200 bg-teal-50/50">
        <CardContent className="flex flex-col items-center gap-4 py-16">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-teal-100">
            <CreditCard className="size-8 text-teal-600" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-800">
              {lang === 'ar' ? 'فواتير الخدمات' : 'Service Invoices'}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              {lang === 'ar'
                ? 'إدارة فواتير الخدمات الاستشارية والفنية المقدمة للعملاء'
                : 'Manage consulting and technical service invoices for clients'}
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-teal-100 px-4 py-2">
            <div className="size-2 rounded-full bg-teal-600 animate-pulse" />
            <span className="text-sm font-medium text-teal-700">
              {lang === 'ar' ? 'قيد التطوير' : 'Under Development'}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
