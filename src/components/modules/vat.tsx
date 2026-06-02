'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Percent, Plus, RefreshCw,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useAppStore, formatSAR, formatDate } from '@/stores/app-store'

// ============ Types ============
interface VATReturn {
  id: string; period: string; salesVAT: number; purchaseVAT: number
  netVAT: number; status: string; filedDate: string | null; createdAt: string
}

// ============ Status Config ============
const statusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  DRAFT: { label: { ar: 'مسودة', en: 'Draft' }, color: 'text-gray-700', bg: 'bg-gray-100' },
  FILED: { label: { ar: 'مقدّم', en: 'Filed' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
}

function StatusBadge({ status, lang }: { status: string; lang: 'ar' | 'en' }) {
  const cfg = statusConfig[status] || statusConfig.DRAFT
  return <Badge className={`${cfg.bg} ${cfg.color} border-0`}>{cfg.label[lang]}</Badge>
}

function TableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ============ New VAT Return Dialog ============
function NewVATReturnDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [period, setPeriod] = useState('')
  const [salesVAT, setSalesVAT] = useState('')
  const [purchaseVAT, setPurchaseVAT] = useState('')
  const [status, setStatus] = useState('DRAFT')

  React.useEffect(() => {
    if (open) { setPeriod(''); setSalesVAT(''); setPurchaseVAT(''); setStatus('DRAFT') }
  }, [open])

  const netVAT = (parseFloat(salesVAT) || 0) - (parseFloat(purchaseVAT) || 0)

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/vat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['vat-returns'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ period, salesVAT, purchaseVAT, status })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{lang === 'ar' ? 'إقرار ضريبي جديد' : 'New VAT Return'}</DialogTitle>
          <DialogDescription>{lang === 'ar' ? 'إضافة إقرار ضريبة قيمة مضافة' : 'Add new VAT return'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'الفترة *' : 'Period *'}</Label>
            <Input value={period} onChange={e => setPeriod(e.target.value)} placeholder={lang === 'ar' ? 'مثل: Q1-2025' : 'e.g. Q1-2025'} dir="ltr" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'ضريبة المبيعات *' : 'Sales VAT *'}</Label>
              <Input type="number" min="0" step="0.01" value={salesVAT} onChange={e => setSalesVAT(e.target.value)} dir="ltr" required />
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'ضريبة المشتريات *' : 'Purchase VAT *'}</Label>
              <Input type="number" min="0" step="0.01" value={purchaseVAT} onChange={e => setPurchaseVAT(e.target.value)} dir="ltr" required />
            </div>
          </div>

          {/* Net VAT Preview */}
          <Card className={netVAT >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}>
            <CardContent className="p-3 text-center">
              <p className="text-sm">{lang === 'ar' ? 'صافي الضريبة' : 'Net VAT'}</p>
              <p className={`text-xl font-bold ${netVAT >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatSAR(netVAT, lang)}</p>
              <p className="text-xs text-muted-foreground">{netVAT >= 0 ? (lang === 'ar' ? 'مبلغ مستحق' : 'Amount due') : (lang === 'ar' ? 'مبلغ مسترد' : 'Amount refundable')}</p>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'الحالة' : 'Status'}</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={status === 'DRAFT' ? 'default' : 'outline'} className={status === 'DRAFT' ? 'bg-emerald-600' : ''} onClick={() => setStatus('DRAFT')}>
                {lang === 'ar' ? 'مسودة' : 'Draft'}
              </Button>
              <Button type="button" size="sm" variant={status === 'FILED' ? 'default' : 'outline'} className={status === 'FILED' ? 'bg-emerald-600' : ''} onClick={() => setStatus('FILED')}>
                {lang === 'ar' ? 'مقدّم' : 'Filed'}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="submit" disabled={createMutation.isPending || !period || !salesVAT} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? (lang === 'ar' ? 'جاري الإنشاء...' : 'Creating...') : (lang === 'ar' ? 'إضافة' : 'Add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main VAT Module ============
export function VATModule() {
  const { lang } = useAppStore()
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: vatReturns = [], isLoading, isError, refetch } = useQuery<VATReturn[]>({
    queryKey: ['vat-returns'],
    queryFn: async () => {
      const res = await fetch('/api/vat')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  // Summary
  const totalSalesVAT = vatReturns.reduce((s, v) => s + v.salesVAT, 0)
  const totalPurchaseVAT = vatReturns.reduce((s, v) => s + v.purchaseVAT, 0)
  const totalNetVAT = vatReturns.reduce((s, v) => s + v.netVAT, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lang === 'ar' ? 'ضريبة القيمة المضافة' : 'VAT'}</h1>
          <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'إدارة إقرارات الضريبة' : 'Manage VAT returns'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> {lang === 'ar' ? 'إقرار جديد' : 'New Return'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Percent className="size-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-emerald-600">{lang === 'ar' ? 'ضريبة المبيعات' : 'Sales VAT'}</p>
              <p className="text-xl font-bold text-emerald-700">{formatSAR(totalSalesVAT, lang)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-rose-50 border-rose-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-rose-100 flex items-center justify-center">
              <Percent className="size-5 text-rose-600" />
            </div>
            <div>
              <p className="text-sm text-rose-600">{lang === 'ar' ? 'ضريبة المشتريات' : 'Purchase VAT'}</p>
              <p className="text-xl font-bold text-rose-700">{formatSAR(totalPurchaseVAT, lang)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={totalNetVAT >= 0 ? 'bg-amber-50 border-amber-200' : 'bg-teal-50 border-teal-200'}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`size-10 rounded-full flex items-center justify-center ${totalNetVAT >= 0 ? 'bg-amber-100' : 'bg-teal-100'}`}>
              <Percent className={`size-5 ${totalNetVAT >= 0 ? 'text-amber-600' : 'text-teal-600'}`} />
            </div>
            <div>
              <p className={`text-sm ${totalNetVAT >= 0 ? 'text-amber-600' : 'text-teal-600'}`}>{lang === 'ar' ? 'صافي الضريبة' : 'Net VAT'}</p>
              <p className={`text-xl font-bold ${totalNetVAT >= 0 ? 'text-amber-700' : 'text-teal-700'}`}>{formatSAR(totalNetVAT, lang)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><TableSkeleton /></div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-rose-600">{lang === 'ar' ? 'حدث خطأ' : 'An error occurred'}</p>
              <Button variant="outline" onClick={() => refetch()}>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</Button>
            </div>
          ) : vatReturns.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <Percent className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{lang === 'ar' ? 'لا توجد إقرارات' : 'No VAT returns'}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
                <Plus className="size-4 mr-1" /> {lang === 'ar' ? 'إضافة إقرار' : 'Add Return'}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{lang === 'ar' ? 'الفترة' : 'Period'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'ضريبة المبيعات' : 'Sales VAT'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'ضريبة المشتريات' : 'Purchase VAT'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'صافي الضريبة' : 'Net VAT'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vatReturns.map(v => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono">{v.period}</TableCell>
                      <TableCell className="text-emerald-700">{formatSAR(v.salesVAT, lang)}</TableCell>
                      <TableCell className="text-rose-700">{formatSAR(v.purchaseVAT, lang)}</TableCell>
                      <TableCell className={`font-semibold ${v.netVAT >= 0 ? 'text-amber-700' : 'text-teal-700'}`}>{formatSAR(v.netVAT, lang)}</TableCell>
                      <TableCell><StatusBadge status={v.status} lang={lang} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <NewVATReturnDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
