'use client'

import { FileMinus, Plus, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/app-store'

export function SupplierInvoicesModule() {
  const { lang } = useAppStore()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {lang === 'ar' ? 'فواتير الموردين' : 'Supplier Invoices'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {lang === 'ar' ? 'إدارة فواتير الموردين والمتابعة المالية' : 'Manage supplier invoices and financial tracking'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" title={lang === 'ar' ? 'تحديث' : 'Refresh'}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="size-4" /> {lang === 'ar' ? 'فاتورة مورد جديدة' : 'New Supplier Invoice'}
          </Button>
        </div>
      </div>

      <Card className="border-rose-200 bg-rose-50/50">
        <CardContent className="flex flex-col items-center gap-4 py-16">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-rose-100">
            <FileMinus className="size-8 text-rose-600" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-800">
              {lang === 'ar' ? 'فواتير الموردين' : 'Supplier Invoices'}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              {lang === 'ar'
                ? 'إدارة فواتير الموردين الواردة ومتابعة السداد'
                : 'Manage incoming supplier invoices and payment tracking'}
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-4 py-2">
            <div className="size-2 rounded-full bg-rose-600 animate-pulse" />
            <span className="text-sm font-medium text-rose-700">
              {lang === 'ar' ? 'قيد التطوير' : 'Under Development'}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
